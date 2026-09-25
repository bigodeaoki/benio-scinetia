import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { POOL, Pool } from '../db/database.module';
import { IS_PUBLIC, PAPEIS } from './decorators';

// Toda requisição autenticada carrega a conta do usuário (tenant). A empresa
// ativa vem do header X-Empresa-Id e precisa pertencer à mesma conta.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
    @Inject(POOL) private pool: Pool,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    // Downloads (Excel/PDF) enviam o token via query string
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string);
    if (!token) throw new UnauthorizedException('Token ausente');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    const [rows]: any = await this.pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.conta_id,
              c.nome AS conta_nome, c.slug AS conta_slug, c.status AS conta_status, c.plano, c.trial_ate
         FROM usuarios u JOIN contas c ON c.id = u.conta_id
        WHERE u.id = ?`,
      [payload.sub],
    );
    const usuario = rows[0];
    if (!usuario || !usuario.ativo) throw new UnauthorizedException('Usuário inativo');
    if (Number(usuario.conta_id) !== Number(payload.conta)) throw new UnauthorizedException('Sessão inválida');
    if (usuario.conta_status !== 'ativa') throw new ForbiddenException('Conta suspensa — fale com o suporte');

    const [empresas]: any = await this.pool.query('SELECT id FROM empresas WHERE conta_id = ? ORDER BY id', [usuario.conta_id]);
    const ids: number[] = empresas.map((e: any) => Number(e.id));
    const pedida = Number(req.headers['x-empresa-id'] || req.query.empresa || 0);
    if (pedida && !ids.includes(pedida)) throw new ForbiddenException('Sem acesso a esta empresa');

    const papeis = this.reflector.getAllAndOverride<string[]>(PAPEIS, [ctx.getHandler(), ctx.getClass()]);
    if (papeis?.length && !papeis.includes(usuario.papel)) {
      throw new ForbiddenException('Permissão insuficiente para esta operação');
    }

    req.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel };
    req.conta = {
      id: usuario.conta_id, nome: usuario.conta_nome, slug: usuario.conta_slug,
      status: usuario.conta_status, plano: usuario.plano, trial_ate: usuario.trial_ate,
    };
    req.contaId = usuario.conta_id;
    req.empresaId = pedida || ids[0] || null;
    req.empresaIds = ids;
    return true;
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { POOL, Pool } from '../db/database.module';
import { EscopoSessao, IS_PUBLIC, PAPEIS } from './decorators';

// Monta o escopo de cada requisição: admin vê tudo; dono vê o grupo da sua
// matriz (matriz + filiais); os demais só a própria empresa. A empresa ativa
// vem do header X-Empresa-Id e precisa estar dentro do escopo.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, @Inject(POOL) private pool: Pool) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string);
    if (!token) throw new UnauthorizedException('Token ausente');
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    const [rows]: any = await this.pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.empresa_id,
              e.matriz AS eh_matriz, e.empresa_id AS matriz_da_filial, e.ativo AS empresa_ativa
         FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE u.id = ?`,
      [payload.sub],
    );
    const u = rows[0];
    if (!u || !u.ativo) throw new UnauthorizedException('Usuário inativo');

    let escopo: EscopoSessao;
    if (u.papel === 'admin') {
      escopo = { papel: 'admin', matrizId: null, empresaIds: null };
    } else {
      if (!u.empresa_id) throw new ForbiddenException('Usuário sem empresa — fale com o suporte');
      const matrizId = u.eh_matriz ? u.empresa_id : u.matriz_da_filial;
      const [grupo]: any = await this.pool.query(
        'SELECT id, ativo FROM empresas WHERE id = ? OR empresa_id = ? ORDER BY matriz DESC, nome', [matrizId, matrizId],
      );
      const matriz = grupo.find((g: any) => g.id === matrizId);
      // Matriz suspensa (pelo admin) derruba o grupo inteiro; filial inativa (pelo dono), só quem é dela
      if (!matriz?.ativo) throw new ForbiddenException('Empresa suspensa — fale com o suporte');
      if (!u.empresa_ativa) throw new ForbiddenException('Filial inativa — fale com o dono da empresa');
      const empresaIds = u.papel === 'owner' ? grupo.map((g: any) => g.id) : [u.empresa_id];
      escopo = { papel: u.papel, matrizId, empresaIds };
    }

    // Empresa ativa só pelo cabeçalho: ?empresa= na URL é filtro de listagem, não troca de escopo
    const pedida = String(req.headers['x-empresa-id'] || '') || null;
    if (pedida) {
      if (escopo.empresaIds) {
        if (!escopo.empresaIds.includes(pedida)) throw new ForbiddenException('Sem acesso a esta empresa');
      } else {
        const [existe]: any = await this.pool.query('SELECT id FROM empresas WHERE id = ?', [pedida]);
        if (!existe.length) throw new ForbiddenException('Empresa não encontrada');
      }
    }

    const papeis = this.reflector.getAllAndOverride<string[]>(PAPEIS, [ctx.getHandler(), ctx.getClass()]);
    if (papeis?.length && !papeis.includes(u.papel)) throw new ForbiddenException('Permissão insuficiente para esta operação');

    req.usuario = { id: u.id, nome: u.nome, email: u.email, papel: u.papel, empresa_id: u.empresa_id };
    req.escopo = escopo;
    req.empresaId = pedida || (u.papel === 'owner' ? escopo.matrizId : u.empresa_id) || null;
    return true;
  }
}

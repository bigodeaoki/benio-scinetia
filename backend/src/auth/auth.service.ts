import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { env } from '../config/env';
import { POOL, Pool } from '../db/database.module';
import { CadastroDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(POOL) private pool: Pool,
    private jwt: JwtService,
    private auditoria: AuditoriaService,
  ) {}

  // Cadastro self-service: conta, primeira empresa e admin numa transação.
  // O e-mail é único no sistema: um usuário pertence a uma conta só.
  async cadastro(dto: CadastroDto) {
    const email = dto.email.trim().toLowerCase();
    const [existe]: any = await this.pool.query('SELECT id FROM usuarios WHERE email=?', [email]);
    if (existe.length) throw new BadRequestException('Já existe uma conta com este e-mail — entre ou recupere a senha');

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const slug = await this.slugLivre(conn, dto.conta_nome);
      const [rc]: any = await conn.query(
        `INSERT INTO contas (nome, slug, plano, status, trial_ate)
         VALUES (?,?,?,?, DATE_ADD(CURDATE(), INTERVAL ? DAY))`,
        [dto.conta_nome.trim(), slug, 'trial', 'ativa', env.TRIAL_DIAS],
      );
      const contaId = rc.insertId;
      const [re]: any = await conn.query(
        'INSERT INTO empresas (conta_id, razao_social, nome_fantasia, uf, regime) VALUES (?,?,?,?,?)',
        [contaId, dto.razao_social.trim(), dto.nome_fantasia?.trim() || null, dto.uf.toUpperCase(), dto.regime],
      );
      const hash = await bcrypt.hash(dto.senha, 10);
      const [ru]: any = await conn.query(
        'INSERT INTO usuarios (conta_id, nome, email, senha_hash, papel) VALUES (?,?,?,?,?)',
        [contaId, dto.nome.trim(), email, hash, 'admin'],
      );
      await this.auditoria.registrar(conn, {
        conta_id: contaId, empresa_id: re.insertId, usuario_id: ru.insertId,
        acao: 'conta.criada', entidade: 'contas', entidade_id: contaId, detalhes: { plano: 'trial', slug },
      });
      await conn.commit();
      return this.sessao(ru.insertId);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const [rows]: any = await this.pool.query('SELECT id, senha_hash, ativo FROM usuarios WHERE email=?', [email]);
    const u = rows[0];
    if (!u || !u.ativo || !(await bcrypt.compare(dto.senha, u.senha_hash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    await this.pool.query('UPDATE usuarios SET ultimo_login_em = NOW() WHERE id=?', [u.id]);
    return this.sessao(u.id);
  }

  // Dados da sessão: usuário, conta e as empresas da conta
  async me(usuarioId: number) {
    const [rows]: any = await this.pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.conta_id,
              c.nome AS conta_nome, c.slug, c.plano, c.status, c.trial_ate
         FROM usuarios u JOIN contas c ON c.id = u.conta_id
        WHERE u.id=?`,
      [usuarioId],
    );
    const u = rows[0];
    if (!u) throw new UnauthorizedException('Usuário não encontrado');
    const [empresas]: any = await this.pool.query(
      'SELECT id, razao_social, nome_fantasia, uf, regime, aliquota_simples FROM empresas WHERE conta_id=? ORDER BY id',
      [u.conta_id],
    );
    return {
      usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel },
      conta: { id: u.conta_id, nome: u.conta_nome, slug: u.slug, plano: u.plano, status: u.status, trial_ate: u.trial_ate },
      empresas,
    };
  }

  private async sessao(usuarioId: number) {
    const dados = await this.me(usuarioId);
    const token = await this.jwt.signAsync({ sub: dados.usuario.id, conta: dados.conta.id });
    return { token, ...dados };
  }

  // "Indústria Scientia" vira "industria-scientia"; se já existir, ganha sufixo
  private async slugLivre(conn: any, nome: string): Promise<string> {
    const base = String(nome)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'conta';
    for (let n = 0; n < 50; n++) {
      const slug = n ? `${base}-${n + 1}` : base;
      const [r]: any = await conn.query('SELECT id FROM contas WHERE slug=?', [slug]);
      if (!r.length) return slug;
    }
    return `${base}-${Date.now()}`;
  }
}

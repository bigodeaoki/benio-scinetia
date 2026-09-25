import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { POOL, Pool } from '../db/database.module';
import { LoginDto } from './dto';

// Não há cadastro público: o admin cadastra a matriz e o dono; o dono cadastra
// filiais e usuários. Aqui só login e sessão.
@Injectable()
export class AuthService {
  constructor(@Inject(POOL) private pool: Pool, private jwt: JwtService) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const [rows]: any = await this.pool.query('SELECT id, senha_hash, ativo FROM usuarios WHERE email=?', [email]);
    const u = rows[0];
    if (!u || !u.ativo || !(await bcrypt.compare(dto.senha, u.senha_hash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    await this.pool.query('UPDATE usuarios SET ultimo_login_em = NOW() WHERE id=?', [u.id]);
    const dados = await this.me(u.id);
    const token = await this.jwt.signAsync({ sub: u.id, papel: dados.usuario.papel });
    return { token, ...dados };
  }

  // Sessão: usuário e escopo (matriz do grupo e empresas que ele pode usar).
  // Dono recebe matriz + filiais; usuário comum, só a própria empresa; admin,
  // nenhuma (opera pela visão global).
  async me(usuarioId: string) {
    const [rows]: any = await this.pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.empresa_id, e.matriz AS eh_matriz, e.empresa_id AS matriz_da_filial
         FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE u.id=?`,
      [usuarioId],
    );
    const u = rows[0];
    if (!u) throw new UnauthorizedException('Usuário não encontrado');
    let empresas: any[] = [];
    let matriz: any = null;
    if (u.papel !== 'admin') {
      const matrizId = u.eh_matriz ? u.empresa_id : u.matriz_da_filial;
      const [grupo]: any = await this.pool.query(
        'SELECT id, nome, cnpj, matriz, filial, empresa_id, ativo FROM empresas WHERE id=? OR empresa_id=? ORDER BY matriz DESC, nome',
        [matrizId, matrizId],
      );
      const m = grupo.find((g: any) => g.id === matrizId);
      matriz = m ? { id: m.id, nome: m.nome } : null;
      empresas = u.papel === 'owner' ? grupo : grupo.filter((g: any) => g.id === u.empresa_id);
    }
    return {
      usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel, empresa_id: u.empresa_id },
      escopo: {
        papel: u.papel,
        matriz,
        empresas,
        empresa_padrao: u.papel === 'admin' ? null : u.papel === 'owner' ? matriz?.id || null : u.empresa_id,
      },
    };
  }
}

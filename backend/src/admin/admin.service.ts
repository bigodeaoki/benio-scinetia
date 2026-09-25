import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { EmpresaAdminDto, NovaEmpresaDto, UsuarioAdminDto } from './admin.dto';

// Visão global do operador do SaaS: empresas (matriz) com seus donos, e
// usuários de qualquer empresa. Filial não passa por aqui: é do dono.
@Injectable()
export class AdminService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listarEmpresas() {
    const [matrizes]: any = await this.pool.query(
      `SELECT e.id, e.nome, e.cnpj, e.ativo, e.criado_em, e.atualizado_em,
              (SELECT COUNT(*) FROM empresas f WHERE f.empresa_id = e.id) AS filiais,
              (SELECT COUNT(*) FROM usuarios u LEFT JOIN empresas f ON f.id = u.empresa_id
                WHERE f.id = e.id OR f.empresa_id = e.id) AS usuarios
         FROM empresas e WHERE e.matriz = 1 ORDER BY e.nome`,
    );
    const [donos]: any = await this.pool.query(
      "SELECT id, nome, email, ativo, empresa_id FROM usuarios WHERE papel = 'owner' ORDER BY nome",
    );
    return matrizes.map((m: any) => ({ ...m, donos: donos.filter((d: any) => d.empresa_id === m.id) }));
  }

  // Matriz + dono numa transação
  async criarEmpresa(adminId: string, dto: NovaEmpresaDto) {
    const email = dto.dono.email.trim().toLowerCase();
    const [existe]: any = await this.pool.query('SELECT id FROM usuarios WHERE email=?', [email]);
    if (existe.length) throw new BadRequestException('Já existe um usuário com o e-mail do dono');
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const empresaId = novoId();
      await conn.query(
        'INSERT INTO empresas (id, nome, cnpj, matriz, filial, empresa_id) VALUES (?,?,?,1,0,NULL)',
        [empresaId, dto.nome.trim(), dto.cnpj ? dto.cnpj.toUpperCase() : null],
      );
      const donoId = novoId();
      await conn.query(
        'INSERT INTO usuarios (id, empresa_id, nome, email, senha_hash, papel) VALUES (?,?,?,?,?,?)',
        [donoId, empresaId, dto.dono.nome.trim(), email, await bcrypt.hash(dto.dono.senha, 10), 'owner'],
      );
      await this.auditoria.registrar(conn, {
        matriz_id: empresaId, empresa_id: empresaId, usuario_id: adminId,
        acao: 'empresa.criada', entidade: 'empresas', entidade_id: empresaId, detalhes: { nome: dto.nome.trim(), dono: email },
      });
      await conn.commit();
      return { id: empresaId, dono_id: donoId };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  async atualizarEmpresa(adminId: string, id: string, dto: EmpresaAdminDto) {
    const e = await this.buscarEmpresa(id);
    await this.pool.query('UPDATE empresas SET nome=?, cnpj=? WHERE id=?', [dto.nome.trim(), dto.cnpj ? dto.cnpj.toUpperCase() : null, id]);
    await this.auditoria.registrar(null, {
      matriz_id: this.matrizDe(e), empresa_id: id, usuario_id: adminId,
      acao: 'empresa.alterada', entidade: 'empresas', entidade_id: id, detalhes: { nome: dto.nome.trim() },
    });
    return { ok: true };
  }

  async alterarAtivoEmpresa(adminId: string, id: string, ativo: boolean) {
    const e = await this.buscarEmpresa(id);
    await this.pool.query('UPDATE empresas SET ativo=? WHERE id=?', [ativo ? 1 : 0, id]);
    await this.auditoria.registrar(null, {
      matriz_id: this.matrizDe(e), empresa_id: id, usuario_id: adminId,
      acao: ativo ? 'empresa.reativada' : 'empresa.inativada', entidade: 'empresas', entidade_id: id, detalhes: { nome: e.nome },
    });
    return { ok: true, ativo };
  }

  async listarUsuarios() {
    const [rows]: any = await this.pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.ultimo_login_em, u.criado_em, u.empresa_id,
              e.nome AS empresa_nome, e.matriz AS empresa_matriz, m.nome AS matriz_nome
         FROM usuarios u
         LEFT JOIN empresas e ON e.id = u.empresa_id
         LEFT JOIN empresas m ON m.id = e.empresa_id
        ORDER BY u.papel = 'admin' DESC, COALESCE(m.nome, e.nome), u.nome`,
    );
    return rows;
  }

  async criarUsuario(adminId: string, dto: UsuarioAdminDto) {
    if (!dto.senha) throw new BadRequestException('Senha é obrigatória para um usuário novo');
    const empresa = await this.validarPapelEmpresa(dto);
    const id = novoId();
    const email = dto.email.trim().toLowerCase();
    await this.pool
      .query('INSERT INTO usuarios (id, empresa_id, nome, email, senha_hash, papel) VALUES (?,?,?,?,?,?)', [
        id, empresa?.id ?? null, dto.nome.trim(), email, await bcrypt.hash(dto.senha, 10), dto.papel,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: this.matrizDe(empresa), empresa_id: empresa?.id ?? null, usuario_id: adminId,
      acao: 'usuario.criado', entidade: 'usuarios', entidade_id: id, detalhes: { email, papel: dto.papel },
    });
    return { id };
  }

  async atualizarUsuario(adminId: string, id: string, dto: UsuarioAdminDto) {
    await this.buscarUsuario(id);
    const empresa = await this.validarPapelEmpresa(dto);
    await this.pool
      .query('UPDATE usuarios SET nome=?, email=?, papel=?, empresa_id=? WHERE id=?', [
        dto.nome.trim(), dto.email.trim().toLowerCase(), dto.papel, empresa?.id ?? null, id,
      ])
      .catch((e: any) => this.traduzir(e));
    if (dto.senha) await this.pool.query('UPDATE usuarios SET senha_hash=? WHERE id=?', [await bcrypt.hash(dto.senha, 10), id]);
    await this.auditoria.registrar(null, {
      matriz_id: this.matrizDe(empresa), empresa_id: empresa?.id ?? null, usuario_id: adminId,
      acao: 'usuario.alterado', entidade: 'usuarios', entidade_id: id, detalhes: { papel: dto.papel, senha_trocada: !!dto.senha },
    });
    return { ok: true };
  }

  async alterarAtivoUsuario(adminId: string, id: string, ativo: boolean) {
    if (id === adminId && !ativo) throw new BadRequestException('Você não pode inativar o próprio usuário');
    const u = await this.buscarUsuario(id);
    await this.pool.query('UPDATE usuarios SET ativo=? WHERE id=?', [ativo ? 1 : 0, id]);
    await this.auditoria.registrar(null, {
      matriz_id: u.matriz_id, empresa_id: u.empresa_id, usuario_id: adminId,
      acao: ativo ? 'usuario.reativado' : 'usuario.inativado', entidade: 'usuarios', entidade_id: id, detalhes: { email: u.email },
    });
    return { ok: true, ativo };
  }

  // admin não tem empresa; dono só de matriz; os demais, de qualquer empresa
  private async validarPapelEmpresa(dto: UsuarioAdminDto) {
    if (dto.papel === 'admin') {
      if (dto.empresa_id) throw new BadRequestException('Admin do sistema não pertence a uma empresa');
      return null;
    }
    if (!dto.empresa_id) throw new BadRequestException('Informe a empresa do usuário');
    const empresa = await this.buscarEmpresa(dto.empresa_id);
    if (dto.papel === 'owner' && !empresa.matriz) throw new BadRequestException('Dono é sempre cadastrado na matriz, não na filial');
    return empresa;
  }

  private matrizDe(empresa: any): string | null {
    return empresa ? (empresa.matriz ? empresa.id : empresa.empresa_id) : null;
  }

  private async buscarEmpresa(id: string) {
    const [rows]: any = await this.pool.query('SELECT id, nome, matriz, filial, empresa_id, ativo FROM empresas WHERE id=?', [id]);
    if (!rows.length) throw new NotFoundException('Empresa não encontrada');
    return rows[0];
  }

  private async buscarUsuario(id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT u.id, u.email, u.papel, u.empresa_id, CASE WHEN e.matriz = 1 THEN e.id ELSE e.empresa_id END AS matriz_id
         FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id WHERE u.id=?`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('Usuário não encontrado');
    return rows[0];
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe um usuário com este e-mail');
    throw e;
  }
}

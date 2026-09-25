import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { POOL, Pool } from '../db/database.module';
import { UsuarioDto } from './usuarios.dto';

// Usuários de uma conta. E-mail é único no sistema inteiro (um usuário
// pertence a uma conta só). Usuário nunca é excluído: inativa-se, para a
// auditoria continuar apontando para alguém.
@Injectable()
export class UsuariosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(contaId: number) {
    const [rows]: any = await this.pool.query(
      'SELECT id, nome, email, papel, ativo, ultimo_login_em, criado_em FROM usuarios WHERE conta_id=? ORDER BY nome',
      [contaId],
    );
    return rows;
  }

  async criar(contaId: number, usuarioAtualId: number, dto: UsuarioDto) {
    if (!dto.senha) throw new BadRequestException('Senha é obrigatória para um usuário novo');
    const email = dto.email.trim().toLowerCase();
    const hash = await bcrypt.hash(dto.senha, 10);
    const [res]: any = await this.pool
      .query('INSERT INTO usuarios (conta_id, nome, email, senha_hash, papel, ativo) VALUES (?,?,?,?,?,?)', [
        contaId, dto.nome.trim(), email, hash, dto.papel, dto.ativo === false ? 0 : 1,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { conta_id: contaId, usuario_id: usuarioAtualId, acao: 'usuario.criado', entidade: 'usuarios', entidade_id: res.insertId, detalhes: { email, papel: dto.papel } });
    return { id: res.insertId };
  }

  async atualizar(contaId: number, usuarioAtualId: number, id: number, dto: UsuarioDto) {
    const atual = await this.buscar(contaId, id);
    if (id === usuarioAtualId && dto.papel !== 'admin' && atual.papel === 'admin') {
      throw new BadRequestException('Você não pode tirar o próprio papel de admin');
    }
    const email = dto.email.trim().toLowerCase();
    await this.pool
      .query('UPDATE usuarios SET nome=?, email=?, papel=? WHERE id=? AND conta_id=?', [dto.nome.trim(), email, dto.papel, id, contaId])
      .catch((e: any) => this.traduzir(e));
    if (dto.senha) {
      const hash = await bcrypt.hash(dto.senha, 10);
      await this.pool.query('UPDATE usuarios SET senha_hash=? WHERE id=?', [hash, id]);
    }
    await this.auditoria.registrar(null, { conta_id: contaId, usuario_id: usuarioAtualId, acao: 'usuario.alterado', entidade: 'usuarios', entidade_id: id, detalhes: { papel: dto.papel, senha_trocada: !!dto.senha } });
    return { ok: true };
  }

  async alterarAtivo(contaId: number, usuarioAtualId: number, id: number, ativo: boolean) {
    if (id === usuarioAtualId && !ativo) throw new BadRequestException('Você não pode inativar o próprio usuário');
    await this.buscar(contaId, id);
    await this.pool.query('UPDATE usuarios SET ativo=? WHERE id=? AND conta_id=?', [ativo ? 1 : 0, id, contaId]);
    await this.auditoria.registrar(null, { conta_id: contaId, usuario_id: usuarioAtualId, acao: ativo ? 'usuario.reativado' : 'usuario.inativado', entidade: 'usuarios', entidade_id: id });
    return { ok: true, ativo };
  }

  private async buscar(contaId: number, id: number) {
    const [rows]: any = await this.pool.query('SELECT id, papel FROM usuarios WHERE id=? AND conta_id=?', [id, contaId]);
    if (!rows.length) throw new NotFoundException('Usuário não encontrado');
    return rows[0];
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe um usuário com este e-mail');
    throw e;
  }
}

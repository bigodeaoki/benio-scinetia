import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { UsuarioDto } from './usuarios.dto';

// Usuários do grupo, geridos pelo dono: papéis operacionais em qualquer
// empresa do grupo (matriz ou filial). Donos e admins são do admin global.
// Usuário nunca é excluído: inativa-se.
@Injectable()
export class UsuariosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(escopo: EscopoSessao) {
    const [rows]: any = await this.pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.ultimo_login_em, u.criado_em, u.empresa_id, e.nome AS empresa_nome, e.matriz AS empresa_matriz
         FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
        WHERE u.empresa_id IN (?) ORDER BY e.matriz DESC, e.nome, u.nome`,
      [escopo.empresaIds],
    );
    return rows;
  }

  async criar(escopo: EscopoSessao, usuarioAtualId: string, dto: UsuarioDto) {
    if (!dto.senha) throw new BadRequestException('Senha é obrigatória para um usuário novo');
    this.exigirEmpresaDoGrupo(escopo, dto.empresa_id);
    const id = novoId();
    await this.pool
      .query('INSERT INTO usuarios (id, empresa_id, nome, email, senha_hash, papel) VALUES (?,?,?,?,?,?)', [
        id, dto.empresa_id, dto.nome.trim(), dto.email.trim().toLowerCase(), await bcrypt.hash(dto.senha, 10), dto.papel,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: dto.empresa_id, usuario_id: usuarioAtualId, acao: 'usuario.criado', entidade: 'usuarios', entidade_id: id, detalhes: { email: dto.email.trim().toLowerCase(), papel: dto.papel } });
    return { id };
  }

  async atualizar(escopo: EscopoSessao, usuarioAtualId: string, id: string, dto: UsuarioDto) {
    await this.buscarOperacional(escopo, id);
    this.exigirEmpresaDoGrupo(escopo, dto.empresa_id);
    await this.pool
      .query('UPDATE usuarios SET nome=?, email=?, papel=?, empresa_id=? WHERE id=?', [dto.nome.trim(), dto.email.trim().toLowerCase(), dto.papel, dto.empresa_id, id])
      .catch((e: any) => this.traduzir(e));
    if (dto.senha) await this.pool.query('UPDATE usuarios SET senha_hash=? WHERE id=?', [await bcrypt.hash(dto.senha, 10), id]);
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: dto.empresa_id, usuario_id: usuarioAtualId, acao: 'usuario.alterado', entidade: 'usuarios', entidade_id: id, detalhes: { papel: dto.papel, senha_trocada: !!dto.senha } });
    return { ok: true };
  }

  async alterarAtivo(escopo: EscopoSessao, usuarioAtualId: string, id: string, ativo: boolean) {
    if (id === usuarioAtualId && !ativo) throw new BadRequestException('Você não pode inativar o próprio usuário');
    const u = await this.buscarOperacional(escopo, id);
    await this.pool.query('UPDATE usuarios SET ativo=? WHERE id=?', [ativo ? 1 : 0, id]);
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: u.empresa_id, usuario_id: usuarioAtualId, acao: ativo ? 'usuario.reativado' : 'usuario.inativado', entidade: 'usuarios', entidade_id: id, detalhes: { email: u.email } });
    return { ok: true, ativo };
  }

  private exigirEmpresaDoGrupo(escopo: EscopoSessao, empresaId: string) {
    if (!escopo.empresaIds?.includes(empresaId)) throw new BadRequestException('A empresa precisa ser a matriz ou uma filial do seu grupo');
  }

  // Só usuários operacionais do grupo: dono e admin não são editáveis daqui
  private async buscarOperacional(escopo: EscopoSessao, id: string) {
    const [rows]: any = await this.pool.query('SELECT id, email, papel, empresa_id FROM usuarios WHERE id=? AND empresa_id IN (?)', [id, escopo.empresaIds]);
    if (!rows.length) throw new NotFoundException('Usuário não encontrado');
    if (rows[0].papel === 'owner' || rows[0].papel === 'admin') throw new BadRequestException('Dono e admin são geridos pelo admin do sistema');
    return rows[0];
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe um usuário com este e-mail');
    throw e;
  }
}

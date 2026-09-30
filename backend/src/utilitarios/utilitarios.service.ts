import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { UtilitarioDto } from './utilitarios.dto';

const COLUNAS = `u.id, u.empresa_id, e.nome AS empresa_nome, u.nome, u.descricao, u.valor, u.ativo, u.criado_em, u.atualizado_em`;

// Utilitários de cada empresa (energia, água, gás…). Bem de cada empresa, como o
// maquinário: quem cadastra escolhe a empresa dona dentro do seu escopo (a dona
// do grupo pode apontar qualquer empresa; os demais só a sua).
@Injectable()
export class UtilitariosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  // Tudo que está no escopo (a dona vê matriz + filiais; os demais só a sua empresa), com filtro opcional por empresa
  async listar(escopo: EscopoSessao, empresaId: string, filtroEmpresa?: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM utilitarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.empresa_id IN (?) ORDER BY u.ativo DESC, e.matriz DESC, e.nome, u.nome`,
      [this.visiveis(escopo, empresaId, filtroEmpresa)],
    );
    return rows;
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM utilitarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = ? AND u.empresa_id IN (?)`,
      [id, this.visiveis(escopo, empresaId)],
    );
    if (!rows.length) throw new NotFoundException('Utilitário não encontrado');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: UtilitarioDto) {
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const id = novoId();
    await this.pool
      .query('INSERT INTO utilitarios (id, empresa_id, nome, descricao, valor) VALUES (?,?,?,?,?)', [id, dona, dto.nome.trim(), dto.descricao?.trim() || null, dto.valor])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'utilitario.criado', entidade: 'utilitarios', entidade_id: id,
      detalhes: { nome: dto.nome.trim(), valor: dto.valor },
    });
    return this.buscar(escopo, dona, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: UtilitarioDto) {
    const atual = await this.buscar(escopo, empresaId, id);
    const dona = this.empresaDona(escopo, atual.empresa_id, dto.empresa_id);
    await this.pool
      .query('UPDATE utilitarios SET empresa_id=?, nome=?, descricao=?, valor=? WHERE id=? AND empresa_id=?', [dona, dto.nome.trim(), dto.descricao?.trim() || null, dto.valor, id, atual.empresa_id])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'utilitario.alterado', entidade: 'utilitarios', entidade_id: id,
      detalhes: { nome: dto.nome.trim(), valor: dto.valor, ...(dona !== atual.empresa_id ? { movido_de: atual.empresa_id } : {}) },
    });
    return this.buscar(escopo, dona, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.buscar(escopo, empresaId, id);
    await this.pool.query('UPDATE utilitarios SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, atual.empresa_id]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId,
      acao: ativo ? 'utilitario.reativado' : 'utilitario.inativado', entidade: 'utilitarios', entidade_id: id, detalhes: { nome: atual.nome },
    });
    return this.buscar(escopo, atual.empresa_id, id);
  }

  // Empresa dona do utilitário: a informada (se estiver no escopo) ou a ativa
  private empresaDona(escopo: EscopoSessao, empresaId: string, pedida?: string) {
    this.exigirEmpresa(empresaId);
    if (!pedida || pedida === empresaId) return empresaId;
    if (escopo.empresaIds && !escopo.empresaIds.includes(pedida)) throw new ForbiddenException('Sem acesso a esta empresa');
    return pedida;
  }

  // Empresas cujos registros o usuário enxerga: as do escopo (admin: só a ativa). Com filtro, ele precisa estar entre elas
  private visiveis(escopo: EscopoSessao, empresaId: string, filtro?: string) {
    this.exigirEmpresa(empresaId);
    const ids = escopo.empresaIds ?? [empresaId];
    if (!filtro) return ids;
    if (!ids.includes(filtro)) throw new ForbiddenException('Sem acesso a esta empresa');
    return [filtro];
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe utilitário com este nome nesta empresa');
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') throw new BadRequestException('Empresa não encontrada');
    throw e;
  }
}

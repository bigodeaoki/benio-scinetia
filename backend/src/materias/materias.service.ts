import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { MateriaDto } from './materias.dto';

// Filtro da tela de cadastro: grupo inteiro ou uma empresa do escopo
export type FiltroCadastro = { grupo?: boolean; empresa?: string };

const COLUNAS = `m.id, m.nome, m.unidade, m.descricao, m.ativo, m.criado_em, m.atualizado_em, m.empresa_id,
  e.nome AS empresa_nome, IF(m.empresa_id IN (?), 'propria', 'matriz') AS origem`;

// Matérias-primas são de cada empresa, mas a filial enxerga também as da
// matriz do grupo (vínculo matriz_id) e as usa como referência. Altera quem
// tem a empresa dona no escopo: a dona do grupo altera qualquer uma; os
// demais papéis só as da sua empresa. Molde das entidades: id UUID,
// criado_em/atualizado_em pelo banco, sem exclusão física.
@Injectable()
export class MateriasService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  // Sem filtro: o que a empresa ativa pode usar (ela e a matriz), para estoque e fórmulas.
  // Com grupo/empresa: a tela de cadastro, que para a dona traz o grupo inteiro
  async listar(escopo: EscopoSessao, empresaId: string, filtro: FiltroCadastro = {}) {
    const ids = filtro.grupo || filtro.empresa ? this.gerenciaveis(escopo, empresaId, filtro.empresa) : this.visiveis(escopo, empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM materias_primas m JOIN empresas e ON e.id = m.empresa_id
        WHERE m.empresa_id IN (?) ORDER BY m.ativo DESC, e.matriz DESC, e.nome, m.nome`,
      [this.editaveis(escopo, empresaId), ids],
    );
    return rows;
  }

  // Uma matéria-prima que a empresa ativa pode usar (estoque, fórmulas)
  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    return this.buscarEm(this.visiveis(escopo, empresaId), escopo, empresaId, id);
  }

  // Uma matéria-prima da tela de cadastro (a dona alcança as das filiais)
  async buscarGerenciavel(escopo: EscopoSessao, empresaId: string, id: string) {
    return this.buscarEm(this.gerenciaveis(escopo, empresaId), escopo, empresaId, id);
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: MateriaDto) {
    this.exigirEmpresa(empresaId);
    await this.recusarNomeDaMatriz(escopo, empresaId, dto.nome);
    const id = novoId();
    await this.pool
      .query('INSERT INTO materias_primas (id, empresa_id, matriz_id, nome, unidade, descricao) VALUES (?,?,?,?,?,?)', [
        id, empresaId, escopo.matrizId, dto.nome.trim(), dto.unidade.trim(), dto.descricao?.trim() || null,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'materia.criada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: dto.nome.trim() } });
    return this.buscar(escopo, empresaId, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: MateriaDto) {
    const atual = await this.exigirPropria(escopo, empresaId, id);
    await this.recusarNomeDaMatriz(escopo, atual.empresa_id, dto.nome);
    await this.pool
      .query('UPDATE materias_primas SET nome=?, unidade=?, descricao=? WHERE id=? AND empresa_id=?', [
        dto.nome.trim(), dto.unidade.trim(), dto.descricao?.trim() || null, id, atual.empresa_id,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'materia.alterada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: dto.nome.trim() } });
    return this.buscarGerenciavel(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.exigirPropria(escopo, empresaId, id);
    await this.pool.query('UPDATE materias_primas SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, atual.empresa_id]);
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: ativo ? 'materia.reativada' : 'materia.inativada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: atual.nome } });
    return this.buscarGerenciavel(escopo, empresaId, id);
  }

  // Empresas cujas matérias-primas a empresa ativa pode usar: ela mesma e, se for filial, a matriz
  visiveis(escopo: EscopoSessao, empresaId: string): string[] {
    this.exigirEmpresa(empresaId);
    return empresaId !== escopo.matrizId && escopo.matrizId ? [empresaId, escopo.matrizId] : [empresaId];
  }

  // Empresas cujos cadastros o usuário altera: as do seu escopo (a dona, o grupo; os demais, só a ativa)
  editaveis(escopo: EscopoSessao, empresaId: string): string[] {
    this.exigirEmpresa(empresaId);
    return escopo.empresaIds ?? [empresaId];
  }

  // Tela de cadastro: o que pode usar mais o que pode alterar. Com filtro, ele precisa estar entre elas
  gerenciaveis(escopo: EscopoSessao, empresaId: string, filtro?: string): string[] {
    const ids = [...new Set([...this.visiveis(escopo, empresaId), ...this.editaveis(escopo, empresaId)])];
    if (!filtro) return ids;
    if (!ids.includes(filtro)) throw new ForbiddenException('Sem acesso a esta empresa');
    return [filtro];
  }

  private async buscarEm(ids: string[], escopo: EscopoSessao, empresaId: string, id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM materias_primas m JOIN empresas e ON e.id = m.empresa_id WHERE m.id = ? AND m.empresa_id IN (?)`,
      [this.editaveis(escopo, empresaId), id, ids],
    );
    if (!rows.length) throw new NotFoundException('Matéria-prima não encontrada');
    return rows[0];
  }

  // Filial não repete nome que a matriz já tem: usa a da matriz
  private async recusarNomeDaMatriz(escopo: EscopoSessao, empresaId: string, nome: string) {
    if (!escopo.matrizId || empresaId === escopo.matrizId) return;
    const [rows]: any = await this.pool.query('SELECT id FROM materias_primas WHERE empresa_id=? AND nome=?', [escopo.matrizId, nome.trim()]);
    if (rows.length) throw new BadRequestException('A matriz já tem uma matéria-prima com este nome — use a da matriz');
  }

  // Só altera quem tem a empresa dona no escopo (origem 'propria')
  private async exigirPropria(escopo: EscopoSessao, empresaId: string, id: string) {
    const m = await this.buscarGerenciavel(escopo, empresaId, id);
    if (m.origem !== 'propria') throw new ForbiddenException('Matéria-prima da matriz: só a matriz altera');
    return m;
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe matéria-prima com este nome nesta empresa');
    throw e;
  }
}

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { FiltroCadastro, MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { EnvaseDto } from './envases.dto';

const COLUNAS = `v.id, v.nome, v.descricao, v.ativo, v.criado_em, v.atualizado_em, v.empresa_id,
  e.nome AS empresa_nome, IF(v.empresa_id IN (?), 'propria', 'matriz') AS origem`;

// Itens de envase (frascos, tampas, rótulos, caixas...). Sem quantidade: o
// estoque controla, por entradas de compra. Mesma visibilidade das
// matérias-primas: a filial enxerga os da matriz; altera quem tem a empresa
// dona no escopo (a dona do grupo, qualquer um; os demais, só os da sua).
@Injectable()
export class EnvasesService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService, private materias: MateriasService) {}

  // Sem filtro: o que a empresa ativa pode usar (ela e a matriz). Com grupo/empresa: a tela de cadastro
  async listar(escopo: EscopoSessao, empresaId: string, filtro: FiltroCadastro = {}) {
    const ids = filtro.grupo || filtro.empresa ? this.materias.gerenciaveis(escopo, empresaId, filtro.empresa) : this.materias.visiveis(escopo, empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM envases v JOIN empresas e ON e.id = v.empresa_id
        WHERE v.empresa_id IN (?) ORDER BY v.ativo DESC, e.matriz DESC, e.nome, v.nome`,
      [this.materias.editaveis(escopo, empresaId), ids],
    );
    return rows;
  }

  // Um item que a empresa ativa pode usar (estoque)
  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    return this.buscarEm(this.materias.visiveis(escopo, empresaId), escopo, empresaId, id);
  }

  // Um item da tela de cadastro (a dona alcança os das filiais)
  async buscarGerenciavel(escopo: EscopoSessao, empresaId: string, id: string) {
    return this.buscarEm(this.materias.gerenciaveis(escopo, empresaId), escopo, empresaId, id);
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: EnvaseDto) {
    this.exigirEmpresa(empresaId);
    await this.recusarNomeDaMatriz(escopo, empresaId, dto.nome);
    const id = novoId();
    await this.pool
      .query('INSERT INTO envases (id, empresa_id, matriz_id, nome, descricao) VALUES (?,?,?,?,?)', [id, empresaId, escopo.matrizId, dto.nome.trim(), dto.descricao?.trim() || null])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'envase.criado', entidade: 'envases', entidade_id: id, detalhes: { nome: dto.nome.trim() } });
    return this.buscar(escopo, empresaId, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: EnvaseDto) {
    const atual = await this.exigirProprio(escopo, empresaId, id);
    await this.recusarNomeDaMatriz(escopo, atual.empresa_id, dto.nome);
    await this.pool
      .query('UPDATE envases SET nome=?, descricao=? WHERE id=? AND empresa_id=?', [dto.nome.trim(), dto.descricao?.trim() || null, id, atual.empresa_id])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'envase.alterado', entidade: 'envases', entidade_id: id, detalhes: { nome: dto.nome.trim() } });
    return this.buscarGerenciavel(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.exigirProprio(escopo, empresaId, id);
    await this.pool.query('UPDATE envases SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, atual.empresa_id]);
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: ativo ? 'envase.reativado' : 'envase.inativado', entidade: 'envases', entidade_id: id, detalhes: { nome: atual.nome } });
    return this.buscarGerenciavel(escopo, empresaId, id);
  }

  private async buscarEm(ids: string[], escopo: EscopoSessao, empresaId: string, id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM envases v JOIN empresas e ON e.id = v.empresa_id WHERE v.id = ? AND v.empresa_id IN (?)`,
      [this.materias.editaveis(escopo, empresaId), id, ids],
    );
    if (!rows.length) throw new NotFoundException('Item de envase não encontrado');
    return rows[0];
  }

  private async recusarNomeDaMatriz(escopo: EscopoSessao, empresaId: string, nome: string) {
    if (!escopo.matrizId || empresaId === escopo.matrizId) return;
    const [rows]: any = await this.pool.query('SELECT id FROM envases WHERE empresa_id=? AND nome=?', [escopo.matrizId, nome.trim()]);
    if (rows.length) throw new BadRequestException('A matriz já tem um item de envase com este nome — use o da matriz');
  }

  // Só altera quem tem a empresa dona no escopo (origem 'propria')
  private async exigirProprio(escopo: EscopoSessao, empresaId: string, id: string) {
    const v = await this.buscarGerenciavel(escopo, empresaId, id);
    if (v.origem !== 'propria') throw new ForbiddenException('Item de envase da matriz: só a matriz altera');
    return v;
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe item de envase com este nome nesta empresa');
    throw e;
  }
}

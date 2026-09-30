import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { FiltroCadastro, MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { ImpostoDto } from './impostos.dto';

const COLUNAS = `t.id, t.nome, t.percentual, t.ativo, t.criado_em, t.atualizado_em, t.empresa_id,
  e.nome AS empresa_nome, IF(t.empresa_id IN (?), 'propria', 'matriz') AS origem`;

// Impostos (nome e %). Mesma visibilidade das matérias-primas: a filial enxerga os
// da matriz; altera quem tem a empresa dona no escopo (a dona do grupo, qualquer um;
// os demais, só os da sua empresa).
@Injectable()
export class ImpostosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService, private materias: MateriasService) {}

  // Sem filtro: o que a empresa ativa pode usar (ela e a matriz). Com grupo/empresa: a tela de cadastro
  async listar(escopo: EscopoSessao, empresaId: string, filtro: FiltroCadastro = {}) {
    const ids = filtro.grupo || filtro.empresa ? this.materias.gerenciaveis(escopo, empresaId, filtro.empresa) : this.materias.visiveis(escopo, empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM impostos t JOIN empresas e ON e.id = t.empresa_id
        WHERE t.empresa_id IN (?) ORDER BY t.ativo DESC, e.matriz DESC, e.nome, t.nome`,
      [this.materias.editaveis(escopo, empresaId), ids],
    );
    return rows;
  }

  async buscarGerenciavel(escopo: EscopoSessao, empresaId: string, id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM impostos t JOIN empresas e ON e.id = t.empresa_id WHERE t.id = ? AND t.empresa_id IN (?)`,
      [this.materias.editaveis(escopo, empresaId), id, this.materias.gerenciaveis(escopo, empresaId)],
    );
    if (!rows.length) throw new NotFoundException('Imposto não encontrado');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: ImpostoDto) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
    await this.recusarNomeDaMatriz(escopo, empresaId, dto.nome);
    const id = novoId();
    await this.pool
      .query('INSERT INTO impostos (id, empresa_id, matriz_id, nome, percentual) VALUES (?,?,?,?,?)', [id, empresaId, escopo.matrizId, dto.nome.trim(), dto.percentual])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'imposto.criado', entidade: 'impostos', entidade_id: id,
      detalhes: { nome: dto.nome.trim(), percentual: dto.percentual },
    });
    return this.buscarGerenciavel(escopo, empresaId, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: ImpostoDto) {
    const atual = await this.exigirProprio(escopo, empresaId, id);
    await this.recusarNomeDaMatriz(escopo, atual.empresa_id, dto.nome);
    await this.pool
      .query('UPDATE impostos SET nome=?, percentual=? WHERE id=? AND empresa_id=?', [dto.nome.trim(), dto.percentual, id, atual.empresa_id])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'imposto.alterado', entidade: 'impostos', entidade_id: id,
      detalhes: { nome: dto.nome.trim(), percentual: dto.percentual, percentual_anterior: atual.percentual },
    });
    return this.buscarGerenciavel(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.exigirProprio(escopo, empresaId, id);
    await this.pool.query('UPDATE impostos SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, atual.empresa_id]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: ativo ? 'imposto.reativado' : 'imposto.inativado',
      entidade: 'impostos', entidade_id: id, detalhes: { nome: atual.nome },
    });
    return this.buscarGerenciavel(escopo, empresaId, id);
  }

  // Filial não repete nome que a matriz já tem: usa o da matriz
  private async recusarNomeDaMatriz(escopo: EscopoSessao, empresaId: string, nome: string) {
    if (!escopo.matrizId || empresaId === escopo.matrizId) return;
    const [rows]: any = await this.pool.query('SELECT id FROM impostos WHERE empresa_id=? AND nome=?', [escopo.matrizId, nome.trim()]);
    if (rows.length) throw new BadRequestException('A matriz já tem um imposto com este nome — use o da matriz');
  }

  // Só altera quem tem a empresa dona no escopo (origem 'propria')
  private async exigirProprio(escopo: EscopoSessao, empresaId: string, id: string) {
    const t = await this.buscarGerenciavel(escopo, empresaId, id);
    if (t.origem !== 'propria') throw new ForbiddenException('Imposto da matriz: só a matriz altera');
    return t;
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe imposto com este nome nesta empresa');
    throw e;
  }
}

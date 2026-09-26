import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { EnvaseDto } from './envases.dto';

const COLUNAS = `v.id, v.nome, v.descricao, v.ativo, v.criado_em, v.atualizado_em, v.empresa_id,
  e.nome AS empresa_nome, IF(v.empresa_id = ?, 'propria', 'matriz') AS origem`;

// Itens de envase (frascos, tampas, rótulos, caixas...). Sem quantidade: o
// estoque controla, por entradas de compra. Mesma visibilidade das
// matérias-primas: a filial enxerga os da matriz e só a dona altera o seu.
@Injectable()
export class EnvasesService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService, private materias: MateriasService) {}

  async listar(escopo: EscopoSessao, empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM envases v JOIN empresas e ON e.id = v.empresa_id
        WHERE v.empresa_id IN (?) ORDER BY v.ativo DESC, origem, v.nome`,
      [empresaId, this.materias.visiveis(escopo, empresaId)],
    );
    return rows;
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM envases v JOIN empresas e ON e.id = v.empresa_id WHERE v.id = ? AND v.empresa_id IN (?)`,
      [empresaId, id, this.materias.visiveis(escopo, empresaId)],
    );
    if (!rows.length) throw new NotFoundException('Item de envase não encontrado');
    return rows[0];
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
    await this.exigirProprio(escopo, empresaId, id);
    await this.recusarNomeDaMatriz(escopo, empresaId, dto.nome);
    await this.pool
      .query('UPDATE envases SET nome=?, descricao=? WHERE id=? AND empresa_id=?', [dto.nome.trim(), dto.descricao?.trim() || null, id, empresaId])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'envase.alterado', entidade: 'envases', entidade_id: id, detalhes: { nome: dto.nome.trim() } });
    return this.buscar(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.exigirProprio(escopo, empresaId, id);
    await this.pool.query('UPDATE envases SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: ativo ? 'envase.reativado' : 'envase.inativado', entidade: 'envases', entidade_id: id, detalhes: { nome: atual.nome } });
    return this.buscar(escopo, empresaId, id);
  }

  private async recusarNomeDaMatriz(escopo: EscopoSessao, empresaId: string, nome: string) {
    if (!escopo.matrizId || empresaId === escopo.matrizId) return;
    const [rows]: any = await this.pool.query('SELECT id FROM envases WHERE empresa_id=? AND nome=?', [escopo.matrizId, nome.trim()]);
    if (rows.length) throw new BadRequestException('A matriz já tem um item de envase com este nome — use o da matriz');
  }

  private async exigirProprio(escopo: EscopoSessao, empresaId: string, id: string) {
    const v = await this.buscar(escopo, empresaId, id);
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

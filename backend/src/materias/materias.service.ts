import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { MateriaDto } from './materias.dto';

// Matérias-primas são de cada empresa, mas a filial enxerga também as da
// matriz do grupo (vínculo matriz_id). Só a empresa dona altera a sua; a
// filial usa as da matriz como referência, sem editar. Molde das entidades:
// id UUID, criado_em/atualizado_em pelo banco, sem exclusão física.
@Injectable()
export class MateriasService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  // Da empresa ativa, mais as da matriz quando a ativa é uma filial
  async listar(escopo: EscopoSessao, empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT m.id, m.nome, m.unidade, m.descricao, m.ativo, m.criado_em, m.atualizado_em, m.empresa_id,
              e.nome AS empresa_nome, IF(m.empresa_id = ?, 'propria', 'matriz') AS origem
         FROM materias_primas m JOIN empresas e ON e.id = m.empresa_id
        WHERE m.empresa_id IN (?)
        ORDER BY m.ativo DESC, origem, m.nome`,
      [empresaId, this.visiveis(escopo, empresaId)],
    );
    return rows;
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT m.id, m.nome, m.unidade, m.descricao, m.ativo, m.criado_em, m.atualizado_em, m.empresa_id,
              e.nome AS empresa_nome, IF(m.empresa_id = ?, 'propria', 'matriz') AS origem
         FROM materias_primas m JOIN empresas e ON e.id = m.empresa_id
        WHERE m.id = ? AND m.empresa_id IN (?)`,
      [empresaId, id, this.visiveis(escopo, empresaId)],
    );
    if (!rows.length) throw new NotFoundException('Matéria-prima não encontrada');
    return rows[0];
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
    await this.exigirPropria(escopo, empresaId, id);
    await this.recusarNomeDaMatriz(escopo, empresaId, dto.nome);
    await this.pool
      .query('UPDATE materias_primas SET nome=?, unidade=?, descricao=? WHERE id=? AND empresa_id=?', [
        dto.nome.trim(), dto.unidade.trim(), dto.descricao?.trim() || null, id, empresaId,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'materia.alterada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: dto.nome.trim() } });
    return this.buscar(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.exigirPropria(escopo, empresaId, id);
    await this.pool.query('UPDATE materias_primas SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: ativo ? 'materia.reativada' : 'materia.inativada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: atual.nome } });
    return this.buscar(escopo, empresaId, id);
  }

  // Empresas cujas matérias-primas a empresa ativa enxerga: ela mesma e, se for filial, a matriz
  visiveis(escopo: EscopoSessao, empresaId: string): string[] {
    return empresaId !== escopo.matrizId && escopo.matrizId ? [empresaId, escopo.matrizId] : [empresaId];
  }

  // Filial não repete nome que a matriz já tem: usa a da matriz
  private async recusarNomeDaMatriz(escopo: EscopoSessao, empresaId: string, nome: string) {
    if (!escopo.matrizId || empresaId === escopo.matrizId) return;
    const [rows]: any = await this.pool.query('SELECT id FROM materias_primas WHERE empresa_id=? AND nome=?', [escopo.matrizId, nome.trim()]);
    if (rows.length) throw new BadRequestException('A matriz já tem uma matéria-prima com este nome — use a da matriz');
  }

  private async exigirPropria(escopo: EscopoSessao, empresaId: string, id: string) {
    const m = await this.buscar(escopo, empresaId, id);
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

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { MateriaDto } from './materias.dto';

const COLUNAS = 'id, nome, unidade, descricao, ativo, criado_em, atualizado_em';

// Matérias-primas da empresa ativa. Primeira entidade de domínio e o molde
// das próximas: id UUID gerado aqui, criado_em/atualizado_em pelo banco,
// escopo por empresa (validada pelo guard como sendo da conta) e auditoria
// em toda escrita. Sem exclusão física: inativa-se.
@Injectable()
export class MateriasService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(empresaId: number) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM materias_primas WHERE empresa_id=? ORDER BY ativo DESC, nome`,
      [this.exigirEmpresa(empresaId)],
    );
    return rows;
  }

  async buscar(empresaId: number, id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM materias_primas WHERE id=? AND empresa_id=?`,
      [id, this.exigirEmpresa(empresaId)],
    );
    if (!rows.length) throw new NotFoundException('Matéria-prima não encontrada');
    return rows[0];
  }

  async criar(contaId: number, empresaId: number, usuarioId: number, dto: MateriaDto) {
    const id = novoId();
    await this.pool
      .query('INSERT INTO materias_primas (id, empresa_id, nome, unidade, descricao) VALUES (?,?,?,?,?)', [
        id, this.exigirEmpresa(empresaId), dto.nome.trim(), dto.unidade.trim(), dto.descricao?.trim() || null,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      conta_id: contaId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: 'materia.criada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: dto.nome.trim() },
    });
    return this.buscar(empresaId, id);
  }

  async atualizar(contaId: number, empresaId: number, usuarioId: number, id: string, dto: MateriaDto) {
    await this.buscar(empresaId, id);
    await this.pool
      .query('UPDATE materias_primas SET nome=?, unidade=?, descricao=? WHERE id=? AND empresa_id=?', [
        dto.nome.trim(), dto.unidade.trim(), dto.descricao?.trim() || null, id, empresaId,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      conta_id: contaId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: 'materia.alterada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: dto.nome.trim() },
    });
    return this.buscar(empresaId, id);
  }

  async alterarAtivo(contaId: number, empresaId: number, usuarioId: number, id: string, ativo: boolean) {
    const atual = await this.buscar(empresaId, id);
    await this.pool.query('UPDATE materias_primas SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, {
      conta_id: contaId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: ativo ? 'materia.reativada' : 'materia.inativada', entidade: 'materias_primas', entidade_id: id, detalhes: { nome: atual.nome },
    });
    return this.buscar(empresaId, id);
  }

  private exigirEmpresa(empresaId: number): number {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
    return empresaId;
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe matéria-prima com este nome nesta empresa');
    throw e;
  }
}

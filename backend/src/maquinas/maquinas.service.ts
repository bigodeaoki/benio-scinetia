import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { MaquinaDto } from './maquinas.dto';

const COLUNAS = `m.id, m.empresa_id, e.nome AS empresa_nome, m.titulo, m.descricao, m.modelo, m.custo_hora, m.rendimento_pct,
  m.ativo, m.criado_em, m.atualizado_em`;

// Maquinário de cada empresa. É bem físico: a filial não enxerga as máquinas
// da matriz. Quem cadastra escolhe a empresa dona dentro do seu escopo (o
// dono pode apontar qualquer empresa do grupo; os demais só a sua).
@Injectable()
export class MaquinasService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM maquinas m JOIN empresas e ON e.id = m.empresa_id WHERE m.empresa_id = ? ORDER BY m.ativo DESC, m.titulo`,
      [empresaId],
    );
    return rows;
  }

  async buscar(empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM maquinas m JOIN empresas e ON e.id = m.empresa_id WHERE m.id = ? AND m.empresa_id = ?`,
      [id, empresaId],
    );
    if (!rows.length) throw new NotFoundException('Máquina não encontrada');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: MaquinaDto) {
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const id = novoId();
    await this.pool
      .query('INSERT INTO maquinas (id, empresa_id, titulo, descricao, modelo, custo_hora, rendimento_pct) VALUES (?,?,?,?,?,?,?)', [
        id, dona, dto.titulo.trim(), dto.descricao?.trim() || null, dto.modelo?.trim() || null, dto.custo_hora, dto.rendimento_pct,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'maquina.criada', entidade: 'maquinas', entidade_id: id,
      detalhes: { titulo: dto.titulo.trim(), custo_hora: dto.custo_hora, rendimento_pct: dto.rendimento_pct },
    });
    return this.buscar(dona, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: MaquinaDto) {
    await this.buscar(empresaId, id);
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    await this.pool
      .query('UPDATE maquinas SET empresa_id=?, titulo=?, descricao=?, modelo=?, custo_hora=?, rendimento_pct=? WHERE id=? AND empresa_id=?', [
        dona, dto.titulo.trim(), dto.descricao?.trim() || null, dto.modelo?.trim() || null, dto.custo_hora, dto.rendimento_pct, id, empresaId,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'maquina.alterada', entidade: 'maquinas', entidade_id: id,
      detalhes: { titulo: dto.titulo.trim(), custo_hora: dto.custo_hora, rendimento_pct: dto.rendimento_pct, ...(dona !== empresaId ? { movida_de: empresaId } : {}) },
    });
    return this.buscar(dona, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.buscar(empresaId, id);
    await this.pool.query('UPDATE maquinas SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: ativo ? 'maquina.reativada' : 'maquina.inativada', entidade: 'maquinas', entidade_id: id, detalhes: { titulo: atual.titulo },
    });
    return this.buscar(empresaId, id);
  }

  // Empresa dona da máquina: a informada (se estiver no escopo) ou a ativa
  private empresaDona(escopo: EscopoSessao, empresaId: string, pedida?: string) {
    this.exigirEmpresa(empresaId);
    if (!pedida || pedida === empresaId) return empresaId;
    if (escopo.empresaIds && !escopo.empresaIds.includes(pedida)) throw new ForbiddenException('Sem acesso a esta empresa');
    return pedida;
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe máquina com este título nesta empresa');
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') throw new BadRequestException('Empresa não encontrada');
    throw e;
  }
}

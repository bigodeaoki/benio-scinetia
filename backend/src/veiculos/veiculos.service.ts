import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { VeiculoDto } from './veiculos.dto';

const COLUNAS = `v.id, v.empresa_id, e.nome AS empresa_nome, v.tipo, v.marca, v.modelo, v.ano, v.placa, v.custo_hora, v.status,
  v.ultima_manutencao, DATEDIFF(CURDATE(), v.ultima_manutencao) AS dias_desde_manutencao, v.ativo, v.criado_em, v.atualizado_em`;

// Veículos (logística) de cada empresa. Bem físico: a filial não enxerga os
// da matriz. Quem cadastra escolhe a empresa dona dentro do seu escopo.
@Injectable()
export class VeiculosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM veiculos v JOIN empresas e ON e.id = v.empresa_id WHERE v.empresa_id = ? ORDER BY v.ativo DESC, v.tipo, v.marca, v.modelo, v.placa`,
      [empresaId],
    );
    return rows;
  }

  async buscar(empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM veiculos v JOIN empresas e ON e.id = v.empresa_id WHERE v.id = ? AND v.empresa_id = ?`,
      [id, empresaId],
    );
    if (!rows.length) throw new NotFoundException('Veículo não encontrado');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: VeiculoDto) {
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const v = this.normalizar(dto);
    const id = novoId();
    await this.pool
      .query('INSERT INTO veiculos (id, empresa_id, tipo, marca, modelo, ano, placa, custo_hora, status, ultima_manutencao) VALUES (?,?,?,?,?,?,?,?,?,?)', [
        id, dona, v.tipo, v.marca, v.modelo, v.ano, v.placa, v.custo_hora, v.status, v.ultima_manutencao,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'veiculo.criado', entidade: 'veiculos', entidade_id: id,
      detalhes: { tipo: v.tipo, placa: v.placa, custo_hora: v.custo_hora, status: v.status },
    });
    return this.buscar(dona, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: VeiculoDto) {
    const atual = await this.buscar(empresaId, id);
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const v = this.normalizar(dto);
    await this.pool
      .query('UPDATE veiculos SET empresa_id=?, tipo=?, marca=?, modelo=?, ano=?, placa=?, custo_hora=?, status=?, ultima_manutencao=? WHERE id=? AND empresa_id=?', [
        dona, v.tipo, v.marca, v.modelo, v.ano, v.placa, v.custo_hora, v.status, v.ultima_manutencao, id, empresaId,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'veiculo.alterado', entidade: 'veiculos', entidade_id: id,
      detalhes: {
        tipo: v.tipo, placa: v.placa, custo_hora: v.custo_hora, status: v.status,
        ...(v.status !== atual.status ? { status_anterior: atual.status } : {}),
        ...(dona !== empresaId ? { movido_de: empresaId } : {}),
      },
    });
    return this.buscar(dona, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.buscar(empresaId, id);
    await this.pool.query('UPDATE veiculos SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: ativo ? 'veiculo.reativado' : 'veiculo.inativado', entidade: 'veiculos', entidade_id: id, detalhes: { tipo: atual.tipo, placa: atual.placa },
    });
    return this.buscar(empresaId, id);
  }

  // Limpa os campos e valida o que o DTO não cobre: ano até o ano que vem, manutenção não futura
  private normalizar(dto: VeiculoDto) {
    const anoMax = new Date().getFullYear() + 1;
    if (dto.ano != null && dto.ano > anoMax) throw new BadRequestException(`Ano: no máximo ${anoMax}`);
    const hoje = new Date().toISOString().slice(0, 10);
    if (dto.ultima_manutencao && dto.ultima_manutencao > hoje) throw new BadRequestException('Última manutenção não pode ser no futuro');
    return {
      tipo: dto.tipo.trim(),
      marca: dto.marca?.trim() || null,
      modelo: dto.modelo?.trim() || null,
      ano: dto.ano ?? null,
      placa: dto.placa?.trim().toUpperCase().replace(/[\s-]/g, '') || null,
      custo_hora: dto.custo_hora,
      status: dto.status || 'disponivel',
      ultima_manutencao: dto.ultima_manutencao || null,
    };
  }

  // Empresa dona do veículo: a informada (se estiver no escopo) ou a ativa
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
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe veículo com esta placa nesta empresa');
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') throw new BadRequestException('Empresa não encontrada');
    throw e;
  }
}

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { EntradaEstoqueDto } from './estoque.dto';

const COLUNAS = `e.id, e.materia_prima_id, m.nome AS materia_nome, m.unidade AS materia_unidade,
  e.quantidade, e.unidade, e.data_compra, e.data_vencimento, e.ativo, e.criado_em, e.atualizado_em,
  DATEDIFF(e.data_vencimento, CURDATE()) AS dias_para_vencer`;

// Entradas de compra da empresa ativa. A matéria-prima precisa ser visível
// para ela (própria ou da matriz); o estoque em si é de cada empresa, a
// filial não vê o da matriz nem o contrário. Entrada errada é cancelada.
@Injectable()
export class EstoqueService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService, private materias: MateriasService) {}

  async listar(empresaId: string, materiaId?: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM estoque e JOIN materias_primas m ON m.id = e.materia_prima_id
        WHERE e.empresa_id = ? ${materiaId ? 'AND e.materia_prima_id = ?' : ''}
        ORDER BY e.ativo DESC, e.data_compra DESC, e.criado_em DESC`,
      materiaId ? [empresaId, materiaId] : [empresaId],
    );
    return rows;
  }

  // Totais por matéria-prima e unidade (só entradas ativas), com o próximo vencimento
  async resumo(empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT e.materia_prima_id, m.nome AS materia_nome, e.unidade,
              SUM(e.quantidade) AS total, COUNT(*) AS entradas,
              MIN(CASE WHEN e.data_vencimento >= CURDATE() THEN e.data_vencimento END) AS proximo_vencimento,
              SUM(e.data_vencimento < CURDATE()) AS entradas_vencidas
         FROM estoque e JOIN materias_primas m ON m.id = e.materia_prima_id
        WHERE e.empresa_id = ? AND e.ativo = 1
        GROUP BY e.materia_prima_id, m.nome, e.unidade
        ORDER BY m.nome, e.unidade`,
      [empresaId],
    );
    return rows;
  }

  async buscar(empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM estoque e JOIN materias_primas m ON m.id = e.materia_prima_id WHERE e.id = ? AND e.empresa_id = ?`,
      [id, empresaId],
    );
    if (!rows.length) throw new NotFoundException('Entrada de estoque não encontrada');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: EntradaEstoqueDto) {
    const mp = await this.validar(escopo, empresaId, dto);
    const id = novoId();
    await this.pool.query(
      'INSERT INTO estoque (id, empresa_id, materia_prima_id, quantidade, unidade, data_compra, data_vencimento) VALUES (?,?,?,?,?,?,?)',
      [id, empresaId, dto.materia_prima_id, dto.quantidade, dto.unidade?.trim() || mp.unidade, dto.data_compra, dto.data_vencimento || null],
    );
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'estoque.entrada', entidade: 'estoque', entidade_id: id,
      detalhes: { materia: mp.nome, quantidade: dto.quantidade, unidade: dto.unidade?.trim() || mp.unidade },
    });
    return this.buscar(empresaId, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: EntradaEstoqueDto) {
    await this.buscar(empresaId, id);
    const mp = await this.validar(escopo, empresaId, dto);
    await this.pool.query(
      'UPDATE estoque SET materia_prima_id=?, quantidade=?, unidade=?, data_compra=?, data_vencimento=? WHERE id=? AND empresa_id=?',
      [dto.materia_prima_id, dto.quantidade, dto.unidade?.trim() || mp.unidade, dto.data_compra, dto.data_vencimento || null, id, empresaId],
    );
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'estoque.alterada', entidade: 'estoque', entidade_id: id,
      detalhes: { materia: mp.nome, quantidade: dto.quantidade },
    });
    return this.buscar(empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.buscar(empresaId, id);
    await this.pool.query('UPDATE estoque SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: ativo ? 'estoque.restaurada' : 'estoque.cancelada', entidade: 'estoque', entidade_id: id, detalhes: { materia: atual.materia_nome },
    });
    return this.buscar(empresaId, id);
  }

  // Matéria-prima visível para a empresa (própria ou da matriz) e datas coerentes
  private async validar(escopo: EscopoSessao, empresaId: string, dto: EntradaEstoqueDto) {
    this.exigirEmpresa(empresaId);
    const mp = await this.materias.buscar(escopo, empresaId, dto.materia_prima_id).catch(() => {
      throw new BadRequestException('Matéria-prima não encontrada nesta empresa nem na matriz');
    });
    if (!mp.ativo) throw new BadRequestException('Matéria-prima inativa');
    if (dto.data_vencimento && dto.data_vencimento < dto.data_compra) {
      throw new BadRequestException('Vencimento não pode ser anterior à data da compra');
    }
    return mp;
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }
}

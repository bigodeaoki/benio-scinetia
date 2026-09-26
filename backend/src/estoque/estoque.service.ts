import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { EnvasesService } from '../envases/envases.service';
import { MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { EntradaEstoqueDto } from './estoque.dto';

// Uma entrada é de matéria-prima ou de envase; `tipo`, `item_id` e `item_nome` unificam os dois
const COLUNAS = `e.id, e.materia_prima_id, e.envase_id,
  IF(e.materia_prima_id IS NOT NULL, 'materia_prima', 'envase') AS tipo,
  COALESCE(e.materia_prima_id, e.envase_id) AS item_id, COALESCE(m.nome, v.nome) AS item_nome,
  e.quantidade, e.unidade, e.data_compra, e.data_vencimento, e.ativo, e.criado_em, e.atualizado_em,
  DATEDIFF(e.data_vencimento, CURDATE()) AS dias_para_vencer`;
const JUNCOES = 'FROM estoque e LEFT JOIN materias_primas m ON m.id = e.materia_prima_id LEFT JOIN envases v ON v.id = e.envase_id';

// Entradas de compra da empresa ativa. O item (matéria-prima ou envase)
// precisa ser visível para ela (próprio ou da matriz); o estoque em si é de
// cada empresa. Entrada errada é cancelada, nunca apagada.
@Injectable()
export class EstoqueService {
  constructor(
    @Inject(POOL) private pool: Pool,
    private auditoria: AuditoriaService,
    private materias: MateriasService,
    private envases: EnvasesService,
  ) {}

  async listar(empresaId: string, filtro: { materia?: string; envase?: string } = {}) {
    this.exigirEmpresa(empresaId);
    const condicoes = ['e.empresa_id = ?'];
    const params: any[] = [empresaId];
    if (filtro.materia) { condicoes.push('e.materia_prima_id = ?'); params.push(filtro.materia); }
    if (filtro.envase) { condicoes.push('e.envase_id = ?'); params.push(filtro.envase); }
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} ${JUNCOES} WHERE ${condicoes.join(' AND ')} ORDER BY e.ativo DESC, e.data_compra DESC, e.criado_em DESC`,
      params,
    );
    return rows;
  }

  // Totais por item e unidade (só entradas ativas), com o próximo vencimento
  async resumo(empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT IF(e.materia_prima_id IS NOT NULL, 'materia_prima', 'envase') AS tipo,
              COALESCE(e.materia_prima_id, e.envase_id) AS item_id, COALESCE(m.nome, v.nome) AS item_nome, e.unidade,
              SUM(e.quantidade) AS total, COUNT(*) AS entradas,
              MIN(CASE WHEN e.data_vencimento >= CURDATE() THEN e.data_vencimento END) AS proximo_vencimento,
              SUM(e.data_vencimento < CURDATE()) AS entradas_vencidas
         ${JUNCOES}
        WHERE e.empresa_id = ? AND e.ativo = 1
        GROUP BY tipo, item_id, item_nome, e.unidade
        ORDER BY tipo, item_nome, e.unidade`,
      [empresaId],
    );
    return rows;
  }

  async buscar(empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(`SELECT ${COLUNAS} ${JUNCOES} WHERE e.id = ? AND e.empresa_id = ?`, [id, empresaId]);
    if (!rows.length) throw new NotFoundException('Entrada de estoque não encontrada');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: EntradaEstoqueDto) {
    const item = await this.validar(escopo, empresaId, dto);
    const id = novoId();
    await this.pool.query(
      'INSERT INTO estoque (id, empresa_id, materia_prima_id, envase_id, quantidade, unidade, data_compra, data_vencimento) VALUES (?,?,?,?,?,?,?,?)',
      [id, empresaId, dto.materia_prima_id || null, dto.envase_id || null, dto.quantidade, item.unidade, dto.data_compra, dto.data_vencimento || null],
    );
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'estoque.entrada', entidade: 'estoque', entidade_id: id,
      detalhes: { tipo: item.tipo, item: item.nome, quantidade: dto.quantidade, unidade: item.unidade },
    });
    return this.buscar(empresaId, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: EntradaEstoqueDto) {
    await this.buscar(empresaId, id);
    const item = await this.validar(escopo, empresaId, dto);
    await this.pool.query(
      'UPDATE estoque SET materia_prima_id=?, envase_id=?, quantidade=?, unidade=?, data_compra=?, data_vencimento=? WHERE id=? AND empresa_id=?',
      [dto.materia_prima_id || null, dto.envase_id || null, dto.quantidade, item.unidade, dto.data_compra, dto.data_vencimento || null, id, empresaId],
    );
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'estoque.alterada', entidade: 'estoque', entidade_id: id,
      detalhes: { tipo: item.tipo, item: item.nome, quantidade: dto.quantidade },
    });
    return this.buscar(empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.buscar(empresaId, id);
    await this.pool.query('UPDATE estoque SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: ativo ? 'estoque.restaurada' : 'estoque.cancelada', entidade: 'estoque', entidade_id: id, detalhes: { item: atual.item_nome },
    });
    return this.buscar(empresaId, id);
  }

  // Exatamente um item, visível para a empresa (próprio ou da matriz) e ativo; datas coerentes
  private async validar(escopo: EscopoSessao, empresaId: string, dto: EntradaEstoqueDto) {
    this.exigirEmpresa(empresaId);
    if (!!dto.materia_prima_id === !!dto.envase_id) throw new BadRequestException('Informe a matéria-prima ou o item de envase, um dos dois');
    let item: { tipo: string; nome: string; unidade: string; ativo: number };
    if (dto.materia_prima_id) {
      const mp = await this.materias.buscar(escopo, empresaId, dto.materia_prima_id).catch(() => {
        throw new BadRequestException('Matéria-prima não encontrada nesta empresa nem na matriz');
      });
      item = { tipo: 'materia_prima', nome: mp.nome, unidade: dto.unidade?.trim() || mp.unidade, ativo: mp.ativo };
    } else {
      const v = await this.envases.buscar(escopo, empresaId, dto.envase_id).catch(() => {
        throw new BadRequestException('Item de envase não encontrado nesta empresa nem na matriz');
      });
      item = { tipo: 'envase', nome: v.nome, unidade: dto.unidade?.trim() || 'un', ativo: v.ativo };
    }
    if (!item.ativo) throw new BadRequestException(`${item.tipo === 'envase' ? 'Item de envase' : 'Matéria-prima'} "${item.nome}" está inativo`);
    if (dto.data_vencimento && dto.data_vencimento < dto.data_compra) {
      throw new BadRequestException('Vencimento não pode ser anterior à data da compra');
    }
    return item;
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }
}

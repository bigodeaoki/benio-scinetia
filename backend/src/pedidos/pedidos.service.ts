import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { FormulacoesService } from '../formulacoes/formulacoes.service';
import { MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { PedidoDto } from './pedidos.dto';

const COLUNAS = `p.id, p.matriz_id, p.empresa_id, e.nome AS empresa_nome, p.numero, p.cliente_id, c.razao_social AS cliente_nome, c.nome_fantasia AS cliente_fantasia,
  p.formulacao_id, f.nome AS formulacao_nome, f.empresa_id AS formulacao_empresa_id,
  (SELECT COUNT(*) FROM formulacao_itens i WHERE i.formulacao_id = p.formulacao_id) AS formulacao_itens,
  p.status, p.etapa, p.observacoes, p.usuario_id, u.nome AS usuario_nome, p.criado_em, p.atualizado_em, IF(p.empresa_id IN (?), 1, 0) AS editavel`;
const JUNCOES = `FROM pedidos p JOIN empresas e ON e.id = p.empresa_id JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN formulacoes f ON f.id = p.formulacao_id LEFT JOIN usuarios u ON u.id = p.usuario_id`;

// Pedidos: entrada em etapas, salva no meio. Cada empresa cria os seus e todo
// o grupo enxerga; altera quem tem a empresa dona no escopo. Etapa 1: cliente
// do grupo e formulação (existente, ou nova só com o nome).
@Injectable()
export class PedidosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService, private formulacoes: FormulacoesService, private materias: MateriasService) {}

  async listar(escopo: EscopoSessao, empresaId: string, filtro: { empresa?: string; status?: string } = {}) {
    const matriz = await this.grupoDe(escopo, empresaId);
    if (filtro.empresa) await this.exigirDoGrupo(matriz, filtro.empresa);
    const condicoes = ['p.matriz_id = ?'];
    const params: any[] = [this.editaveis(escopo, empresaId), matriz];
    if (filtro.empresa) { condicoes.push('p.empresa_id = ?'); params.push(filtro.empresa); }
    if (filtro.status) { condicoes.push('p.status = ?'); params.push(filtro.status); }
    const [rows]: any = await this.pool.query(`SELECT ${COLUNAS} ${JUNCOES} WHERE ${condicoes.join(' AND ')} ORDER BY p.criado_em DESC, p.numero DESC`, params);
    return rows;
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    const matriz = await this.grupoDe(escopo, empresaId);
    const [rows]: any = await this.pool.query(`SELECT ${COLUNAS} ${JUNCOES} WHERE p.id = ? AND p.matriz_id = ?`, [this.editaveis(escopo, empresaId), id, matriz]);
    if (!rows.length) throw new NotFoundException('Pedido não encontrado');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: PedidoDto) {
    const matriz = await this.grupoDe(escopo, empresaId);
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const cliente = await this.exigirCliente(matriz, dto.cliente_id);
    const formulacaoId = await this.resolverFormulacao(escopo, dona, usuarioId, dto);
    const id = novoId();
    let numero = 0;
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      // Numeração sequencial por empresa, dentro da transação
      const [[{ n }]]: any = await cx.query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM pedidos WHERE empresa_id = ? FOR UPDATE', [dona]);
      numero = n;
      await cx.query(
        'INSERT INTO pedidos (id, matriz_id, empresa_id, numero, cliente_id, formulacao_id, status, etapa, observacoes, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, matriz, dona, numero, cliente.id, formulacaoId, 'rascunho', dto.etapa || 1, dto.observacoes?.trim() || null, usuarioId],
      );
      await cx.commit();
    } catch (e: any) {
      await cx.rollback();
      if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Outro pedido foi numerado ao mesmo tempo: tente de novo');
      throw e;
    } finally {
      cx.release();
    }
    await this.auditoria.registrar(null, {
      matriz_id: matriz, empresa_id: dona, usuario_id: usuarioId, acao: 'pedido.criado', entidade: 'pedidos', entidade_id: id,
      detalhes: { numero, cliente: cliente.razao_social, formulacao_id: formulacaoId },
    });
    return this.buscar(escopo, empresaId, id);
  }

  // Regrava os dados da etapa 1 e a etapa onde o usuário parou; só em rascunho
  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: PedidoDto) {
    const atual = await this.exigirEditavel(escopo, empresaId, id);
    if (atual.status !== 'rascunho') throw new BadRequestException(`Pedido ${atual.status}: reabra para alterar`);
    if (dto.empresa_id && dto.empresa_id !== atual.empresa_id) throw new BadRequestException('Pedido não muda de empresa');
    const cliente = await this.exigirCliente(atual.matriz_id, dto.cliente_id);
    const formulacaoId = await this.resolverFormulacao(escopo, atual.empresa_id, usuarioId, dto);
    await this.pool.query('UPDATE pedidos SET cliente_id=?, formulacao_id=?, observacoes=?, etapa=? WHERE id=?', [
      cliente.id, formulacaoId, dto.observacoes?.trim() || null, dto.etapa || atual.etapa, id,
    ]);
    await this.auditoria.registrar(null, {
      matriz_id: atual.matriz_id, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'pedido.alterado', entidade: 'pedidos', entidade_id: id,
      detalhes: { numero: atual.numero, cliente: cliente.razao_social, formulacao_id: formulacaoId, etapa: dto.etapa || atual.etapa },
    });
    return this.buscar(escopo, empresaId, id);
  }

  // Cancelar (de qualquer status) ou reabrir (só de cancelado, volta a rascunho)
  async alterarStatus(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, status: 'rascunho' | 'cancelado') {
    const atual = await this.exigirEditavel(escopo, empresaId, id);
    if (status === 'cancelado' && atual.status === 'cancelado') throw new BadRequestException('Pedido já cancelado');
    if (status === 'rascunho' && atual.status !== 'cancelado') throw new BadRequestException('Só um pedido cancelado é reaberto');
    await this.pool.query('UPDATE pedidos SET status=? WHERE id=?', [status, id]);
    await this.auditoria.registrar(null, {
      matriz_id: atual.matriz_id, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: status === 'cancelado' ? 'pedido.cancelado' : 'pedido.reaberto',
      entidade: 'pedidos', entidade_id: id, detalhes: { numero: atual.numero },
    });
    return this.buscar(escopo, empresaId, id);
  }

  // Formulação por id (visível para a empresa do pedido e ativa) ou por nome: reaproveita a
  // existente com o mesmo nome, senão cria uma nova só com o nome, na empresa do pedido
  private async resolverFormulacao(escopo: EscopoSessao, dona: string, usuarioId: string, dto: PedidoDto): Promise<string | null> {
    if (dto.formulacao_id && dto.formulacao_nome) throw new BadRequestException('Informe a formulação pelo id ou pelo nome, não os dois');
    if (dto.formulacao_id) {
      const f = await this.formulacoes.buscar(escopo, dona, dto.formulacao_id).catch(() => {
        throw new BadRequestException('Formulação não encontrada nesta empresa nem na matriz');
      });
      if (!f.ativo) throw new BadRequestException(`Formulação "${f.nome}" está inativa`);
      return f.id;
    }
    if (dto.formulacao_nome) {
      const nome = dto.formulacao_nome.trim();
      const [rows]: any = await this.pool.query(
        'SELECT id FROM formulacoes WHERE nome = ? AND ativo = 1 AND empresa_id IN (?) ORDER BY (empresa_id = ?) DESC LIMIT 1',
        [nome, this.materias.visiveis(escopo, dona), dona],
      );
      if (rows.length) return rows[0].id;
      const nova = await this.formulacoes.criar(escopo, dona, usuarioId, { nome, itens: [] });
      return nova.id;
    }
    return null;
  }

  private async exigirCliente(matriz: string, clienteId: string) {
    const [rows]: any = await this.pool.query('SELECT id, razao_social, ativo FROM clientes WHERE id = ? AND matriz_id = ?', [clienteId, matriz]);
    if (!rows.length) throw new BadRequestException('Cliente não encontrado no grupo');
    if (!rows[0].ativo) throw new BadRequestException(`Cliente "${rows[0].razao_social}" está inativo`);
    return rows[0];
  }

  // Empresas cujos pedidos o usuário altera: as do seu escopo (a dona, o grupo; os demais, só a ativa)
  private editaveis(escopo: EscopoSessao, empresaId: string): string[] {
    return escopo.empresaIds ?? [empresaId];
  }

  private async exigirEditavel(escopo: EscopoSessao, empresaId: string, id: string) {
    const p = await this.buscar(escopo, empresaId, id);
    if (!p.editavel) throw new ForbiddenException(`Pedido de ${p.empresa_nome}: só essa empresa (ou a dona do grupo) altera`);
    return p;
  }

  private empresaDona(escopo: EscopoSessao, empresaId: string, pedida?: string) {
    if (!pedida || pedida === empresaId) return empresaId;
    if (escopo.empresaIds && !escopo.empresaIds.includes(pedida)) throw new ForbiddenException('Sem acesso a esta empresa');
    return pedida;
  }

  // Grupo (matriz) da empresa ativa. O admin não tem grupo: resolve pela empresa ativa
  private async grupoDe(escopo: EscopoSessao, empresaId: string): Promise<string> {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
    if (escopo.matrizId) return escopo.matrizId;
    const [rows]: any = await this.pool.query('SELECT id, matriz, empresa_id FROM empresas WHERE id = ?', [empresaId]);
    if (!rows.length) throw new NotFoundException('Empresa não encontrada');
    return rows[0].matriz ? rows[0].id : rows[0].empresa_id;
  }

  private async exigirDoGrupo(matriz: string, empresaId: string) {
    const [rows]: any = await this.pool.query('SELECT id FROM empresas WHERE id = ? AND (id = ? OR empresa_id = ?)', [empresaId, matriz, matriz]);
    if (!rows.length) throw new ForbiddenException('Sem acesso a esta empresa');
  }
}

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { EnvasesService } from '../envases/envases.service';
import { FormulacoesService } from '../formulacoes/formulacoes.service';
import { MateriasService } from '../materias/materias.service';
import { custoTotalPedido } from '../shared/custos';
import { novoId } from '../shared/ids';
import { custoMateriaPrima, necessidade, producaoPrevista } from '../shared/necessidade';
import { AmostraDto, CustoDto, CustosDto, DepreciacaoPedidoDto, EnvasePedidoDto, EnvasesPedidoDto, ImpostoPedidoDto, LogisticaPedidoDto, MaoDeObraPedidoDto, MaquinaPedidoDto, PedidoDto, ProducaoDto, TrocaFormulacaoDto, UtilitarioPedidoDto } from './pedidos.dto';

const COLUNAS = `p.id, p.matriz_id, p.empresa_id, e.nome AS empresa_nome, p.numero, p.cliente_id, c.razao_social AS cliente_nome, c.nome_fantasia AS cliente_fantasia,
  p.formulacao_id, f.nome AS formulacao_nome, f.empresa_id AS formulacao_empresa_id,
  (SELECT COUNT(*) FROM formulacao_itens i WHERE i.formulacao_id = p.formulacao_id) AS formulacao_itens,
  p.status, p.etapa, p.quantidade_producao, p.unidade_producao, p.observacoes, p.usuario_id, u.nome AS usuario_nome, p.criado_em, p.atualizado_em, IF(p.empresa_id IN (?), 1, 0) AS editavel`;
const JUNCOES = `FROM pedidos p JOIN empresas e ON e.id = p.empresa_id JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN formulacoes f ON f.id = p.formulacao_id LEFT JOIN usuarios u ON u.id = p.usuario_id`;

// Pedidos: entrada em etapas, salva no meio. Cada empresa cria os seus e todo
// o grupo enxerga; altera quem tem a empresa dona no escopo, só em rascunho.
// Etapa 1: histórico de formulações do pedido (a nova põe a anterior em
// desuso) e envios de amostra (gasto informativo, fora do custo).
@Injectable()
export class PedidosService {
  constructor(
    @Inject(POOL) private pool: Pool,
    private auditoria: AuditoriaService,
    private formulacoes: FormulacoesService,
    private materias: MateriasService,
    private envases: EnvasesService,
  ) {}

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

  // Cabeçalho + histórico de formulações + envios de amostra, com o resumo do gasto
  async detalhar(escopo: EscopoSessao, empresaId: string, id: string) {
    const pedido = await this.buscar(escopo, empresaId, id);
    const [formulacoes]: any = await this.pool.query(
      `SELECT pf.id, pf.formulacao_id, f.nome, f.empresa_id AS formulacao_empresa_id, fe.nome AS formulacao_empresa_nome, f.ativo AS formulacao_ativa,
              (SELECT COUNT(*) FROM formulacao_itens i WHERE i.formulacao_id = f.id) AS itens,
              pf.ativa, pf.motivo, pf.criado_em, pf.desativada_em, pf.aprovada_em, ap.nome AS aprovada_por_nome, u.nome AS usuario_nome
         FROM pedido_formulacoes pf JOIN formulacoes f ON f.id = pf.formulacao_id JOIN empresas fe ON fe.id = f.empresa_id
         LEFT JOIN usuarios u ON u.id = pf.usuario_id LEFT JOIN usuarios ap ON ap.id = pf.aprovada_por
        WHERE pf.pedido_id = ? ORDER BY pf.ativa DESC, pf.criado_em DESC`,
      [id],
    );
    const [amostras]: any = await this.pool.query(
      `SELECT a.id, a.formulacao_id, f.nome AS formulacao_nome, a.quantidade, a.unidade, a.envase_id, v.nome AS envase_nome, a.embalagens, a.logistica, a.custo_materia_prima, a.custo_mp_incompleto,
              a.data_envio, a.observacoes, a.ativo, u.nome AS usuario_nome, a.criado_em, a.atualizado_em
         FROM pedido_amostras a JOIN formulacoes f ON f.id = a.formulacao_id LEFT JOIN envases v ON v.id = a.envase_id LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.pedido_id = ? ORDER BY a.ativo DESC, a.data_envio DESC, a.criado_em DESC`,
      [id],
    );
    // Ingredientes da formulação atual: a quantidade da fórmula vale para 1 unidade produzida;
    // com a quantidade de produção definida, vem o necessário de cada matéria-prima e o seu custo
    // (necessário na unidade de compra × valor de compra do cadastro)
    const [itens]: any = pedido.formulacao_id
      ? await this.pool.query(
          `SELECT i.ordem, i.materia_prima_id, m.nome AS materia_prima, i.quantidade, i.unidade, m.valor_compra, m.unidade AS unidade_compra
             FROM formulacao_itens i JOIN materias_primas m ON m.id = i.materia_prima_id
            WHERE i.formulacao_id = ? ORDER BY i.ordem, m.nome`,
          [pedido.formulacao_id],
        )
      : [[]];
    const producao = Number(pedido.quantidade_producao) || 0;
    const ingredientes = itens.map((i: any) => {
      const n = producao > 0 ? necessidade(Number(i.quantidade), i.unidade, producao) : null;
      const c = n ? custoMateriaPrima(n.quantidade, n.unidade, i.valor_compra, i.unidade_compra) : { custo: null, aviso: null };
      return { ...i, necessario: n ? n.quantidade : null, necessario_unidade: n ? n.unidade : null, custo: c.custo, custo_aviso: c.aviso };
    });
    const [maquinasBrutas]: any = await this.pool.query(
      `SELECT pm.id, pm.maquina_id, m.titulo, m.modelo, m.custo_hora, m.rendimento_pct AS rendimento_padrao, m.ativo AS maquina_ativa,
              pm.rendimento_pct, pm.horas, pm.custo_hora AS custo_hora_pedido, pm.ordem
         FROM pedido_maquinas pm JOIN maquinas m ON m.id = pm.maquina_id WHERE pm.pedido_id = ? ORDER BY pm.ordem, m.titulo`,
      [id],
    );
    // Custo da máquina = horas × custo-hora gravado no pedido (ou o do cadastro, para pedidos antigos)
    const maquinas = maquinasBrutas.map((m: any) => {
      const custoHora = m.custo_hora_pedido != null ? Number(m.custo_hora_pedido) : Number(m.custo_hora);
      return { ...m, custo_hora_pedido: custoHora, custo: Math.round((Number(m.horas) || 0) * custoHora * 100) / 100 };
    });
    const [utilitariosBrutos]: any = await this.pool.query(
      `SELECT pu.id, pu.utilitario_id, u.nome, u.descricao, u.valor AS valor_cadastro, u.ativo AS utilitario_ativo, pu.quantidade, pu.valor, pu.ordem
         FROM pedido_utilitarios pu JOIN utilitarios u ON u.id = pu.utilitario_id WHERE pu.pedido_id = ? ORDER BY pu.ordem, u.nome`,
      [id],
    );
    // Custo do utilitário = quantidade consumida × valor gravado no pedido
    const utilitarios = utilitariosBrutos.map((u: any) => ({ ...u, custo: Math.round((Number(u.quantidade) || 0) * Number(u.valor) * 100) / 100 }));
    // O rendimento das máquinas não muda a matéria-prima: reduz o que sai (300 a 90 % produzem 270)
    const prevista = producao > 0 ? producaoPrevista(producao, maquinas.map((m: any) => Number(m.rendimento_pct))) : null;
    // Custo global da produção: matéria-prima + máquinas. É a base sobre a qual os demais custos se calculam
    const custoMaterias = Math.round(ingredientes.reduce((s: number, i: any) => s + (i.custo || 0), 0) * 100) / 100;
    const custoMaquinas = Math.round(maquinas.reduce((s: number, m: any) => s + m.custo, 0) * 100) / 100;
    const custoUtilitarios = Math.round(utilitarios.reduce((s: number, u: any) => s + u.custo, 0) * 100) / 100;
    const custoGlobal = Math.round((custoMaterias + custoMaquinas + custoUtilitarios) * 100) / 100;
    const porUnidade = (base: number | null) => (base && base > 0 ? Math.round((custoGlobal / base) * 10000) / 10000 : null);
    const custos_producao = {
      materias_primas: custoMaterias, materias_sem_custo: ingredientes.filter((i: any) => producao > 0 && i.custo == null).length,
      maquinas: custoMaquinas, horas: Math.round(maquinas.reduce((s: number, m: any) => s + (Number(m.horas) || 0), 0) * 100) / 100,
      utilitarios: custoUtilitarios,
      total: custoGlobal, custo_unitario_planejado: porUnidade(producao), custo_unitario_previsto: porUnidade(prevista ? prevista.quantidade : null),
    };
    const [custos]: any = await this.pool.query(
      'SELECT id, tipo, referencia_id, descricao, quantidade, unidade, valor_unitario, total, ordem FROM pedido_custos WHERE pedido_id = ? ORDER BY ordem',
      [id],
    );
    const custos_resumo = this.resumoCustos(custos, producao, prevista ? prevista.quantidade : null);
    // Etapa 3: mão de obra por categoria e impostos, em % do custo global; outros custos são as linhas em R$
    const [maoDeObraSalva]: any = await this.pool.query('SELECT categoria, valor, ordem FROM pedido_mao_de_obra WHERE pedido_id = ? ORDER BY ordem', [id]);
    const [categorias]: any = await this.pool.query(
      `SELECT categoria, COUNT(*) AS funcionarios FROM funcionarios
        WHERE empresa_id = ? AND ativo = 1 AND status <> 'desligado' GROUP BY categoria ORDER BY categoria`,
      [pedido.empresa_id],
    );
    const [impostosSalvos]: any = await this.pool.query(
      `SELECT pi.id, pi.imposto_id, t.nome, t.percentual AS percentual_cadastro, t.ativo AS imposto_ativo, pi.percentual, pi.ordem
         FROM pedido_impostos pi JOIN impostos t ON t.id = pi.imposto_id WHERE pi.pedido_id = ? ORDER BY pi.ordem`,
      [id],
    );
    const [impostosDisponiveis]: any = await this.pool.query(
      `SELECT t.id, t.nome, t.percentual, IF(t.empresa_id = ?, 'propria', 'matriz') AS origem
         FROM impostos t WHERE t.empresa_id IN (?) AND t.ativo = 1 ORDER BY t.nome`,
      [pedido.empresa_id, this.empresasDoPedido(pedido)],
    );
    // Logística (horas × custo-hora gravado) e depreciação (R$) somam direto ao custo, como os outros custos
    const [logisticaBruta]: any = await this.pool.query(
      `SELECT pv.id, pv.veiculo_id, TRIM(CONCAT_WS(' ', v.tipo, v.marca, v.modelo, v.placa)) AS nome, v.custo_hora AS custo_hora_cadastro,
              v.ativo AS veiculo_ativo, pv.horas, pv.custo_hora, pv.ordem
         FROM pedido_veiculos pv JOIN veiculos v ON v.id = pv.veiculo_id WHERE pv.pedido_id = ? ORDER BY pv.ordem`,
      [id],
    );
    const logistica = logisticaBruta.map((v: any) => ({ ...v, custo: Math.round((Number(v.horas) || 0) * Number(v.custo_hora) * 100) / 100 }));
    const [depreciacoes]: any = await this.pool.query('SELECT id, nome, valor, ordem FROM pedido_depreciacoes WHERE pedido_id = ? ORDER BY ordem', [id]);
    const custoLogistica = Math.round(logistica.reduce((s: number, v: any) => s + v.custo, 0) * 100) / 100;
    const custoDepreciacao = Math.round(depreciacoes.reduce((s: number, d: any) => s + Number(d.valor), 0) * 100) / 100;
    // Etapa 2: envase do pedido (quantidade × valor unitário, em R$)
    const [envaseItens]: any = await this.pool.query(
      `SELECT pe.id, pe.envase_id, pe.descricao, e.nome AS envase_nome, e.ativo AS envase_ativo, pe.quantidade, pe.unidade, pe.valor_unitario, pe.total, pe.ordem
         FROM pedido_envases pe JOIN envases e ON e.id = pe.envase_id WHERE pe.pedido_id = ? ORDER BY pe.ordem`,
      [id],
    );
    const custoEnvase = Math.round(envaseItens.reduce((s: number, l: any) => s + Number(l.total), 0) * 100) / 100;
    const custoMaoDeObra = Math.round(maoDeObraSalva.reduce((s: number, m: any) => s + Number(m.valor), 0) * 100) / 100;
    // Até a etapa 4 tudo soma em R$ no custo global; os impostos (etapa 5) são % sobre ele
    const totais = custoTotalPedido(
      { envase: custoEnvase, producao: custoGlobal, mao_de_obra: custoMaoDeObra, logistica: custoLogistica, depreciacao: custoDepreciacao, outros: custos_resumo.total },
      impostosSalvos.map((t: any) => Number(t.percentual)),
    );
    const porUnidadeTotal = (b: number | null) => (b && b > 0 ? Math.round((totais.total / b) * 10000) / 10000 : null);
    const custo_pedido = {
      envase: custoEnvase, producao: custoGlobal, mao_de_obra: custoMaoDeObra, logistica: custoLogistica, depreciacao: custoDepreciacao, outros: custos_resumo.total,
      subtotal: totais.subtotal, impostos: totais.impostos, impostos_pct: totais.impostos_pct, total: totais.total,
      custo_unitario_planejado: porUnidadeTotal(producao), custo_unitario_previsto: porUnidadeTotal(prevista ? prevista.quantidade : null),
    };
    return {
      ...pedido, formulacoes, amostras, amostras_resumo: this.resumoAmostras(amostras), formulacao_ingredientes: ingredientes, maquinas,
      rendimento_combinado_pct: prevista ? prevista.rendimento_pct : null, producao_prevista: prevista ? prevista.quantidade : null,
      custos, custos_resumo, custos_producao, utilitarios, envase_itens: envaseItens,
      mao_de_obra: maoDeObraSalva, categorias_mao_de_obra: categorias,
      impostos: impostosSalvos.map((t: any, i: number) => ({ ...t, valor: totais.linhas_impostos[i] })), impostos_disponiveis: impostosDisponiveis, logistica, depreciacoes, custo_pedido,
    };
  }

  // Só as ativas: nº de envios, logística total, embalagens e quantidade por unidade
  private resumoAmostras(amostras: any[]) {
    const ativas = amostras.filter((a) => a.ativo);
    const quantidades: Record<string, number> = {};
    for (const a of ativas) quantidades[a.unidade] = (quantidades[a.unidade] || 0) + Number(a.quantidade);
    const logistica = Math.round(ativas.reduce((s, a) => s + Number(a.logistica), 0) * 100) / 100;
    const materiaPrima = Math.round(ativas.reduce((s, a) => s + Number(a.custo_materia_prima || 0), 0) * 100) / 100;
    return {
      envios: ativas.length,
      logistica_total: logistica,
      // Gasto que a empresa arca: fica à parte e não entra no custo global do pedido
      materia_prima_total: materiaPrima, custo_total: Math.round((logistica + materiaPrima) * 100) / 100, incompletos: ativas.filter((a) => a.custo_mp_incompleto).length,
      embalagens_total: ativas.reduce((s, a) => s + Number(a.embalagens), 0),
      quantidades: Object.entries(quantidades).map(([unidade, total]) => ({ unidade, total: Math.round(total * 1000) / 1000 })),
    };
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
      if (formulacaoId) await cx.query('INSERT INTO pedido_formulacoes (id, pedido_id, formulacao_id, usuario_id) VALUES (?,?,?,?)', [novoId(), id, formulacaoId, usuarioId]);
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
    return this.detalhar(escopo, empresaId, id);
  }

  // Regrava o cabeçalho (cliente, observações, etapa). Formulação diferente da atual vira troca com histórico
  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: PedidoDto) {
    const atual = await this.exigirRascunho(escopo, empresaId, id);
    if (dto.empresa_id && dto.empresa_id !== atual.empresa_id) throw new BadRequestException('Pedido não muda de empresa');
    const cliente = await this.exigirCliente(atual.matriz_id, dto.cliente_id);
    await this.pool.query('UPDATE pedidos SET cliente_id=?, observacoes=?, etapa=? WHERE id=?', [cliente.id, dto.observacoes?.trim() || null, dto.etapa || atual.etapa, id]);
    if (dto.formulacao_id || dto.formulacao_nome) {
      const nova = await this.resolverFormulacao(escopo, atual.empresa_id, usuarioId, dto);
      if (nova && nova !== atual.formulacao_id) await this.aplicarFormulacao(atual, nova, usuarioId, undefined);
    }
    await this.auditoria.registrar(null, {
      matriz_id: atual.matriz_id, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'pedido.alterado', entidade: 'pedidos', entidade_id: id,
      detalhes: { numero: atual.numero, cliente: cliente.razao_social, etapa: dto.etapa || atual.etapa },
    });
    return this.detalhar(escopo, empresaId, id);
  }

  // Nova formulação do pedido: a atual entra em desuso (com o motivo); o cadastro de formulações não muda
  async trocarFormulacao(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: TrocaFormulacaoDto) {
    const atual = await this.exigirRascunho(escopo, empresaId, id);
    if (!dto.formulacao_id && !dto.formulacao_nome) throw new BadRequestException('Informe a formulação pelo id ou pelo nome');
    const nova = await this.resolverFormulacao(escopo, atual.empresa_id, usuarioId, dto);
    if (nova === atual.formulacao_id) throw new BadRequestException('Esta já é a formulação atual do pedido');
    await this.aplicarFormulacao(atual, nova!, usuarioId, dto.motivo?.trim() || null);
    return this.detalhar(escopo, empresaId, id);
  }

  private async aplicarFormulacao(pedido: any, novaId: string, usuarioId: string, motivo: string | null | undefined) {
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      await cx.query('UPDATE pedido_formulacoes SET ativa = 0, desativada_em = NOW(), motivo = COALESCE(?, motivo) WHERE pedido_id = ? AND ativa = 1', [motivo ?? null, pedido.id]);
      await cx.query('INSERT INTO pedido_formulacoes (id, pedido_id, formulacao_id, usuario_id) VALUES (?,?,?,?)', [novoId(), pedido.id, novaId, usuarioId]);
      await cx.query('UPDATE pedidos SET formulacao_id = ? WHERE id = ?', [novaId, pedido.id]);
      await cx.commit();
    } catch (e) {
      await cx.rollback();
      throw e;
    } finally {
      cx.release();
    }
    await this.auditoria.registrar(null, {
      matriz_id: pedido.matriz_id, empresa_id: pedido.empresa_id, usuario_id: usuarioId, acao: 'pedido.formulacao_trocada', entidade: 'pedidos', entidade_id: pedido.id,
      detalhes: { numero: pedido.numero, de: pedido.formulacao_id, para: novaId, motivo: motivo || null },
    });
  }


  // Etapa 2 (Produção): quantidade a produzir da formulação atual e o maquinário do pedido.
  // Sem a lista de máquinas, a que já está no pedido é mantida; lista vazia limpa
  async definirProducao(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: ProducaoDto) {
    const atual = await this.exigirRascunho(escopo, empresaId, id);
    if (!atual.formulacao_id) throw new BadRequestException('O pedido ainda não tem formulação: adicione uma antes de definir a produção');
    const unidade = dto.unidade.trim();
    if (!unidade) throw new BadRequestException('Informe a unidade');
    const maquinas = dto.maquinas ? await this.validarMaquinas(atual, dto.maquinas) : null;
    const utilitarios = dto.utilitarios ? await this.validarUtilitarios(atual, dto.utilitarios) : null;
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      await cx.query('UPDATE pedidos SET quantidade_producao = ?, unidade_producao = ? WHERE id = ?', [dto.quantidade, unidade, id]);
      if (maquinas) {
        await cx.query('DELETE FROM pedido_maquinas WHERE pedido_id = ?', [id]);
        if (maquinas.length) {
          await cx.query('INSERT INTO pedido_maquinas (id, pedido_id, maquina_id, rendimento_pct, horas, custo_hora, ordem, usuario_id) VALUES ?', [
            maquinas.map((m, i) => [novoId(), id, m.maquina_id, m.rendimento_pct, m.horas, m.custo_hora, i + 1, usuarioId]),
          ]);
        }
      }
      if (utilitarios) {
        await cx.query('DELETE FROM pedido_utilitarios WHERE pedido_id = ?', [id]);
        if (utilitarios.length) {
          await cx.query('INSERT INTO pedido_utilitarios (id, pedido_id, utilitario_id, quantidade, valor, ordem, usuario_id) VALUES ?', [
            utilitarios.map((u, i) => [novoId(), id, u.utilitario_id, u.quantidade, u.valor, i + 1, usuarioId]),
          ]);
        }
      }
      await cx.commit();
    } catch (e) {
      await cx.rollback();
      throw e;
    } finally {
      cx.release();
    }
    await this.auditoria.registrar(null, {
      matriz_id: atual.matriz_id, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'pedido.producao_definida', entidade: 'pedidos', entidade_id: id,
      detalhes: {
        numero: atual.numero, quantidade: dto.quantidade, unidade, formulacao_id: atual.formulacao_id,
        ...(maquinas ? { maquinas: maquinas.map((m) => ({ titulo: m.titulo, rendimento_pct: m.rendimento_pct, horas: m.horas })) } : {}),
        ...(utilitarios ? { utilitarios: utilitarios.map((u) => ({ nome: u.nome, quantidade: u.quantidade, valor: u.valor })) } : {}),
      },
    });
    return this.detalhar(escopo, empresaId, id);
  }

  // Utilitários da empresa do pedido, ativos e sem repetir; o valor é o do cadastro, gravado na hora
  private async validarUtilitarios(pedido: any, lista: UtilitarioPedidoDto[]) {
    const ids = lista.map((u) => u.utilitario_id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Utilitário repetido na lista');
    if (!ids.length) return [];
    const [rows]: any = await this.pool.query('SELECT id, nome, valor, ativo FROM utilitarios WHERE id IN (?) AND empresa_id = ?', [ids, pedido.empresa_id]);
    const porId = new Map<string, any>(rows.map((u: any) => [u.id, u]));
    return lista.map((item) => {
      const u = porId.get(item.utilitario_id);
      if (!u) throw new BadRequestException('Utilitário não encontrado na empresa do pedido');
      if (!u.ativo) throw new BadRequestException(`Utilitário "${u.nome}" está inativo`);
      return { utilitario_id: u.id as string, nome: u.nome as string, quantidade: item.quantidade ?? null, valor: Number(u.valor) };
    });
  }

  // Máquinas da empresa do pedido, ativas e sem repetir; sem rendimento informado, vale o do cadastro
  private async validarMaquinas(pedido: any, lista: MaquinaPedidoDto[]) {
    const ids = lista.map((m) => m.maquina_id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Máquina repetida na lista');
    if (!ids.length) return [];
    const [rows]: any = await this.pool.query('SELECT id, titulo, rendimento_pct, custo_hora, ativo FROM maquinas WHERE id IN (?) AND empresa_id = ?', [ids, pedido.empresa_id]);
    const porId = new Map<string, any>(rows.map((m: any) => [m.id, m]));
    return lista.map((item) => {
      const m = porId.get(item.maquina_id);
      if (!m) throw new BadRequestException('Máquina não encontrada na empresa do pedido');
      if (!m.ativo) throw new BadRequestException(`Máquina "${m.titulo}" está inativa`);
      return { maquina_id: m.id as string, titulo: m.titulo as string, rendimento_pct: item.rendimento_pct ?? Number(m.rendimento_pct), horas: item.horas ?? null, custo_hora: Number(m.custo_hora) };
    });
  }

  // Etapa 2 (Envase): itens de envase do pedido, regravados por inteiro. Nome e valor ficam
  // gravados no pedido; o custo (quantidade × valor unitário) soma no custo global
  async definirEnvase(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: EnvasesPedidoDto) {
    const pedido = await this.exigirRascunho(escopo, empresaId, id);
    const itens = await this.validarEnvasesPedido(pedido, dto.itens);
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      await cx.query('DELETE FROM pedido_envases WHERE pedido_id = ?', [id]);
      if (itens.length) {
        await cx.query('INSERT INTO pedido_envases (id, pedido_id, envase_id, descricao, quantidade, unidade, valor_unitario, total, ordem, usuario_id) VALUES ?', [
          itens.map((e, i) => [novoId(), id, e.envase_id, e.descricao, e.quantidade, e.unidade, e.valor_unitario, e.total, i + 1, usuarioId]),
        ]);
      }
      await cx.commit();
    } catch (e) {
      await cx.rollback();
      throw e;
    } finally {
      cx.release();
    }
    await this.auditoria.registrar(null, {
      matriz_id: pedido.matriz_id, empresa_id: pedido.empresa_id, usuario_id: usuarioId, acao: 'pedido.envase_definido', entidade: 'pedidos', entidade_id: id,
      detalhes: {
        numero: pedido.numero, total: Math.round(itens.reduce((s, e) => s + e.total, 0) * 100) / 100,
        itens: itens.map((e) => ({ envase: e.descricao, quantidade: e.quantidade, valor_unitario: e.valor_unitario })),
      },
    });
    return this.detalhar(escopo, empresaId, id);
  }

  // Itens de envase da empresa do pedido ou da matriz, ativos (ou já no pedido), sem repetir
  private async validarEnvasesPedido(pedido: any, lista: EnvasePedidoDto[]) {
    const ids = lista.map((e) => e.envase_id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Item de envase repetido na lista');
    if (!ids.length) return [];
    const [rows]: any = await this.pool.query('SELECT id, nome, ativo FROM envases WHERE id IN (?) AND empresa_id IN (?)', [ids, this.empresasDoPedido(pedido)]);
    const [jaNoPedido]: any = await this.pool.query('SELECT envase_id FROM pedido_envases WHERE pedido_id = ?', [pedido.id]);
    const noPedido = new Set<string>(jaNoPedido.map((r: any) => r.envase_id));
    const porId = new Map<string, any>(rows.map((e: any) => [e.id, e]));
    return lista.map((item) => {
      const e = porId.get(item.envase_id);
      if (!e) throw new BadRequestException('Item de envase não encontrado para a empresa do pedido');
      if (!e.ativo && !noPedido.has(e.id)) throw new BadRequestException(`Item de envase "${e.nome}" está inativo`);
      const quantidade = Number(item.quantidade);
      const valorUnitario = Number(item.valor_unitario);
      return {
        envase_id: e.id as string, descricao: String(e.nome).slice(0, 150), quantidade, unidade: item.unidade?.trim() || 'un',
        valor_unitario: valorUnitario, total: Math.round(quantidade * valorUnitario * 100) / 100,
      };
    });
  }

  // Etapas 4 e 5 (Custos e Impostos): custos avulsos (linhas em R$, nome e valor gravados na hora),
  // mão de obra por área, logística e depreciação em R$; impostos em % do custo global. Lista omitida fica como está
  async definirCustos(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: CustosDto) {
    const pedido = await this.exigirRascunho(escopo, empresaId, id);
    const linhas = dto.itens ? await this.validarCustos(escopo, pedido, dto.itens) : null;
    const maoDeObra = dto.mao_de_obra ? await this.validarMaoDeObra(pedido, dto.mao_de_obra) : null;
    const impostos = dto.impostos ? await this.validarImpostosPedido(pedido, dto.impostos) : null;
    const logistica = dto.logistica ? await this.validarLogistica(pedido, dto.logistica) : null;
    const depreciacoes = dto.depreciacoes ? this.validarDepreciacoes(dto.depreciacoes) : null;
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      if (linhas) {
        await cx.query('DELETE FROM pedido_custos WHERE pedido_id = ?', [id]);
        if (linhas.length) {
          await cx.query('INSERT INTO pedido_custos (id, pedido_id, tipo, referencia_id, descricao, quantidade, unidade, valor_unitario, total, ordem) VALUES ?', [
            linhas.map((l, i) => [novoId(), id, l.tipo, l.referencia_id, l.descricao, l.quantidade, l.unidade, l.valor_unitario, l.total, i + 1]),
          ]);
        }
      }
      if (maoDeObra) {
        await cx.query('DELETE FROM pedido_mao_de_obra WHERE pedido_id = ?', [id]);
        if (maoDeObra.length) {
          await cx.query('INSERT INTO pedido_mao_de_obra (id, pedido_id, categoria, valor, ordem, usuario_id) VALUES ?', [
            maoDeObra.map((m, i) => [novoId(), id, m.categoria, m.valor, i + 1, usuarioId]),
          ]);
        }
      }
      if (impostos) {
        await cx.query('DELETE FROM pedido_impostos WHERE pedido_id = ?', [id]);
        if (impostos.length) {
          await cx.query('INSERT INTO pedido_impostos (id, pedido_id, imposto_id, percentual, ordem, usuario_id) VALUES ?', [
            impostos.map((t, i) => [novoId(), id, t.imposto_id, t.percentual, i + 1, usuarioId]),
          ]);
        }
      }
      if (logistica) {
        await cx.query('DELETE FROM pedido_veiculos WHERE pedido_id = ?', [id]);
        if (logistica.length) {
          await cx.query('INSERT INTO pedido_veiculos (id, pedido_id, veiculo_id, horas, custo_hora, ordem, usuario_id) VALUES ?', [
            logistica.map((v, i) => [novoId(), id, v.veiculo_id, v.horas, v.custo_hora, i + 1, usuarioId]),
          ]);
        }
      }
      if (depreciacoes) {
        await cx.query('DELETE FROM pedido_depreciacoes WHERE pedido_id = ?', [id]);
        if (depreciacoes.length) {
          await cx.query('INSERT INTO pedido_depreciacoes (id, pedido_id, nome, valor, ordem, usuario_id) VALUES ?', [
            depreciacoes.map((d, i) => [novoId(), id, d.nome, d.valor, i + 1, usuarioId]),
          ]);
        }
      }
      await cx.commit();
    } catch (e) {
      await cx.rollback();
      throw e;
    } finally {
      cx.release();
    }
    const detalhe = await this.detalhar(escopo, empresaId, id);
    await this.auditoria.registrar(null, {
      matriz_id: pedido.matriz_id, empresa_id: pedido.empresa_id, usuario_id: usuarioId, acao: 'pedido.custos_definidos', entidade: 'pedidos', entidade_id: id,
      detalhes: {
        numero: pedido.numero, linhas: detalhe.custos.length, total: detalhe.custos_resumo.total,
        ...(maoDeObra ? { mao_de_obra: maoDeObra } : {}), ...(impostos ? { impostos: impostos.map((t) => ({ nome: t.nome, percentual: t.percentual })) } : {}),
        ...(logistica ? { logistica: logistica.map((v) => ({ veiculo: v.nome, horas: v.horas, custo_hora: v.custo_hora })) } : {}), ...(depreciacoes ? { depreciacoes } : {}),
        total_pedido: detalhe.custo_pedido.total,
      },
    });
    return detalhe;
  }

  // Categorias de mão de obra da empresa do pedido (as dos seus funcionários) ou já gravadas nele,
  // sem repetir, com valor fixo em R$. Valor zero não é gravado
  private async validarMaoDeObra(pedido: any, lista: MaoDeObraPedidoDto[]) {
    const vistas = new Set<string>();
    for (const m of lista) {
      const chave = m.categoria.trim().toLowerCase();
      if (vistas.has(chave)) throw new BadRequestException(`Categoria repetida: ${m.categoria.trim()}`);
      vistas.add(chave);
    }
    const [validas]: any = await this.pool.query(
      'SELECT DISTINCT categoria FROM funcionarios WHERE empresa_id = ? UNION SELECT categoria FROM pedido_mao_de_obra WHERE pedido_id = ?',
      [pedido.empresa_id, pedido.id],
    );
    const conhecidas = new Map<string, string>(validas.map((r: any) => [String(r.categoria).toLowerCase(), r.categoria]));
    return lista.filter((m) => Number(m.valor) > 0).map((m) => {
      const nome = conhecidas.get(m.categoria.trim().toLowerCase());
      if (!nome) throw new BadRequestException(`Categoria "${m.categoria.trim()}" não existe na mão de obra de ${pedido.empresa_nome}`);
      return { categoria: nome, valor: Math.round(Number(m.valor) * 100) / 100 };
    });
  }

  // Impostos da empresa do pedido ou da matriz, ativos (ou já no pedido), sem repetir; sem percentual, vale o do cadastro
  private async validarImpostosPedido(pedido: any, lista: ImpostoPedidoDto[]) {
    const ids = lista.map((t) => t.imposto_id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Imposto repetido na lista');
    if (!ids.length) return [];
    const [rows]: any = await this.pool.query('SELECT id, nome, percentual, ativo FROM impostos WHERE id IN (?) AND empresa_id IN (?)', [ids, this.empresasDoPedido(pedido)]);
    const [jaNoPedido]: any = await this.pool.query('SELECT imposto_id FROM pedido_impostos WHERE pedido_id = ?', [pedido.id]);
    const noPedido = new Set<string>(jaNoPedido.map((r: any) => r.imposto_id));
    const porId = new Map<string, any>(rows.map((t: any) => [t.id, t]));
    return lista.map((item) => {
      const t = porId.get(item.imposto_id);
      if (!t) throw new BadRequestException('Imposto não encontrado para a empresa do pedido');
      if (!t.ativo && !noPedido.has(t.id)) throw new BadRequestException(`Imposto "${t.nome}" está inativo`);
      return { imposto_id: t.id as string, nome: t.nome as string, percentual: item.percentual ?? Number(t.percentual) };
    });
  }

  // Veículos da empresa do pedido, ativos (ou já na logística do pedido), sem repetir; o custo-hora do cadastro fica gravado
  private async validarLogistica(pedido: any, lista: LogisticaPedidoDto[]) {
    const ids = lista.map((v) => v.veiculo_id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Veículo repetido na logística');
    if (!ids.length) return [];
    const [rows]: any = await this.pool.query(
      "SELECT id, TRIM(CONCAT_WS(' ', tipo, marca, modelo, placa)) AS nome, custo_hora, ativo FROM veiculos WHERE id IN (?) AND empresa_id = ?",
      [ids, pedido.empresa_id],
    );
    const [jaNoPedido]: any = await this.pool.query('SELECT veiculo_id FROM pedido_veiculos WHERE pedido_id = ?', [pedido.id]);
    const noPedido = new Set<string>(jaNoPedido.map((r: any) => r.veiculo_id));
    const porId = new Map<string, any>(rows.map((v: any) => [v.id, v]));
    return lista.map((item) => {
      const v = porId.get(item.veiculo_id);
      if (!v) throw new BadRequestException('Veículo não encontrado na empresa do pedido');
      if (!v.ativo && !noPedido.has(v.id)) throw new BadRequestException(`Veículo "${v.nome}" está inativo`);
      return { veiculo_id: v.id as string, nome: v.nome as string, horas: item.horas ?? null, custo_hora: Number(v.custo_hora) };
    });
  }

  // Depreciação: itens à parte, sem cadastro, com nome e valor em R$
  private validarDepreciacoes(lista: DepreciacaoPedidoDto[]) {
    return lista.map((d, i) => {
      const nome = d.nome.trim();
      if (nome.length < 2) throw new BadRequestException(`Depreciação ${i + 1}: informe o nome`);
      return { nome, valor: Math.round(Number(d.valor) * 100) / 100 };
    });
  }

  // Empresas cujos cadastros de referência a empresa do pedido usa: ela e, se for filial, a matriz
  private empresasDoPedido(pedido: any): string[] {
    return pedido.empresa_id === pedido.matriz_id ? [pedido.empresa_id] : [pedido.empresa_id, pedido.matriz_id];
  }

  private async validarCustos(escopo: EscopoSessao, pedido: any, itens: CustoDto[]) {
    const saida: Array<{ tipo: string; referencia_id: string | null; descricao: string; quantidade: number; unidade: string; valor_unitario: number; total: number }> = [];
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      let descricao = item.descricao?.trim() || '';
      let unidade = item.unidade?.trim() || '';
      let valor = item.valor_unitario;
      if (item.tipo === 'outro') {
        if (!descricao) throw new BadRequestException(`Custo ${i + 1}: descreva o custo avulso`);
      } else {
        if (!item.referencia_id) throw new BadRequestException(`Custo ${i + 1}: escolha o item do cadastro`);
        const ref = await this.referenciaCusto(escopo, pedido, item.tipo, item.referencia_id);
        descricao = ref.nome;
        if (!unidade) unidade = ref.unidade;
        if (valor == null && ref.custo_hora != null) valor = Number(ref.custo_hora);
      }
      const valorUnitario = Number(valor ?? 0);
      saida.push({
        tipo: item.tipo, referencia_id: item.referencia_id || null, descricao: descricao.slice(0, 150), quantidade: item.quantidade, unidade: unidade || 'un',
        valor_unitario: valorUnitario, total: Math.round(item.quantidade * valorUnitario * 100) / 100,
      });
    }
    return saida;
  }

  // Item do cadastro na empresa do pedido (matéria-prima e envase: visíveis para ela, inclusive da matriz)
  private async referenciaCusto(escopo: EscopoSessao, pedido: any, tipo: string, refId: string): Promise<{ nome: string; unidade: string; custo_hora?: number }> {
    if (tipo === 'materia_prima') {
      const m = await this.materias.buscar(escopo, pedido.empresa_id, refId).catch(() => null);
      if (!m) throw new BadRequestException('Matéria-prima não encontrada para a empresa do pedido');
      return { nome: m.nome, unidade: m.unidade };
    }
    if (tipo === 'envase') {
      const v = await this.envases.buscar(escopo, pedido.empresa_id, refId).catch(() => null);
      if (!v) throw new BadRequestException('Item de envase não encontrado para a empresa do pedido');
      return { nome: v.nome, unidade: 'un' };
    }
    const tabelas: Record<string, { sql: string; erro: string }> = {
      maquina: { sql: 'SELECT titulo AS nome, custo_hora FROM maquinas WHERE id = ? AND empresa_id = ?', erro: 'Máquina não encontrada na empresa do pedido' },
      mao_de_obra: { sql: 'SELECT nome, custo_hora FROM funcionarios WHERE id = ? AND empresa_id = ?', erro: 'Funcionário não encontrado na empresa do pedido' },
      veiculo: { sql: "SELECT TRIM(CONCAT_WS(' ', tipo, marca, modelo, placa)) AS nome, custo_hora FROM veiculos WHERE id = ? AND empresa_id = ?", erro: 'Veículo não encontrado na empresa do pedido' },
    };
    const t = tabelas[tipo];
    const [rows]: any = await this.pool.query(t.sql, [refId, pedido.empresa_id]);
    if (!rows.length) throw new BadRequestException(t.erro);
    return { nome: rows[0].nome, unidade: 'h', custo_hora: Number(rows[0].custo_hora) };
  }

  // Total por tipo, total geral e custo por unidade planejada e prevista
  private resumoCustos(custos: any[], planejada: number, prevista: number | null) {
    const porTipo: Record<string, number> = {};
    for (const c of custos) porTipo[c.tipo] = (porTipo[c.tipo] || 0) + Number(c.total);
    const total = Math.round(Object.values(porTipo).reduce((s, v) => s + v, 0) * 100) / 100;
    const unitario = (base: number | null) => (base && base > 0 ? Math.round((total / base) * 10000) / 10000 : null);
    return {
      por_tipo: Object.entries(porTipo).map(([tipo, valor]) => ({ tipo, total: Math.round(valor * 100) / 100 })),
      total, linhas: custos.length, custo_unitario_planejado: unitario(planejada), custo_unitario_previsto: unitario(prevista),
    };
  }

  // Etapa onde o usuário parou (o stepper), só em rascunho. Para sair da etapa 1 é preciso ter
  // formulação ativa e confirmar que o cliente a aprovou; a aprovação fica registrada nela
  async definirEtapa(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, etapa: number, clienteAprovou = false) {
    const atual = await this.exigirRascunho(escopo, empresaId, id);
    if (etapa > 1) {
      const [rows]: any = await this.pool.query('SELECT id, formulacao_id, aprovada_em FROM pedido_formulacoes WHERE pedido_id = ? AND ativa = 1 LIMIT 1', [id]);
      const ativa = rows[0];
      if (!ativa) throw new BadRequestException('Adicione uma formulação ao pedido antes de avançar');
      if (!ativa.aprovada_em) {
        if (!clienteAprovou) throw new BadRequestException('Confirme que o cliente aprovou a formulação para avançar');
        await this.pool.query('UPDATE pedido_formulacoes SET aprovada_em = NOW(), aprovada_por = ? WHERE id = ?', [usuarioId, ativa.id]);
        await this.auditoria.registrar(null, {
          matriz_id: atual.matriz_id, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'pedido.formulacao_aprovada', entidade: 'pedidos', entidade_id: id,
          detalhes: { numero: atual.numero, formulacao_id: ativa.formulacao_id },
        });
      }
    }
    if (etapa > 3 && !(Number(atual.quantidade_producao) > 0)) throw new BadRequestException('Informe a quantidade de produção para avançar');
    if (etapa !== atual.etapa) {
      await this.pool.query('UPDATE pedidos SET etapa = ? WHERE id = ?', [etapa, id]);
      await this.auditoria.registrar(null, {
        matriz_id: atual.matriz_id, empresa_id: atual.empresa_id, usuario_id: usuarioId, acao: 'pedido.etapa', entidade: 'pedidos', entidade_id: id,
        detalhes: { numero: atual.numero, de: atual.etapa, para: etapa },
      });
    }
    return this.detalhar(escopo, empresaId, id);
  }

  // Envio de amostra: formulação do histórico do pedido (padrão: a ativa), item de envase visível
  // para a empresa do pedido. Gasto informativo, fora do custo
  async registrarAmostra(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: AmostraDto) {
    const pedido = await this.exigirRascunho(escopo, empresaId, id);
    const a = await this.validarAmostra(escopo, pedido, dto);
    const amostraId = novoId();
    await this.pool.query(
      'INSERT INTO pedido_amostras (id, pedido_id, formulacao_id, quantidade, unidade, envase_id, embalagens, logistica, custo_materia_prima, custo_mp_incompleto, data_envio, observacoes, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [amostraId, id, a.formulacao_id, a.quantidade, a.unidade, a.envase_id, a.embalagens, a.logistica, a.custo_materia_prima, a.custo_mp_incompleto, a.data_envio, a.observacoes, usuarioId],
    );
    await this.auditoria.registrar(null, {
      matriz_id: pedido.matriz_id, empresa_id: pedido.empresa_id, usuario_id: usuarioId, acao: 'pedido.amostra_enviada', entidade: 'pedido_amostras', entidade_id: amostraId,
      detalhes: { numero: pedido.numero, quantidade: a.quantidade, unidade: a.unidade, embalagens: a.embalagens, logistica: a.logistica, custo_materia_prima: a.custo_materia_prima },
    });
    return this.detalhar(escopo, empresaId, id);
  }

  async atualizarAmostra(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, amostraId: string, dto: AmostraDto) {
    const pedido = await this.exigirRascunho(escopo, empresaId, id);
    await this.exigirAmostra(id, amostraId);
    const a = await this.validarAmostra(escopo, pedido, dto);
    await this.pool.query(
      'UPDATE pedido_amostras SET formulacao_id=?, quantidade=?, unidade=?, envase_id=?, embalagens=?, logistica=?, custo_materia_prima=?, custo_mp_incompleto=?, data_envio=?, observacoes=? WHERE id=? AND pedido_id=?',
      [a.formulacao_id, a.quantidade, a.unidade, a.envase_id, a.embalagens, a.logistica, a.custo_materia_prima, a.custo_mp_incompleto, a.data_envio, a.observacoes, amostraId, id],
    );
    await this.auditoria.registrar(null, {
      matriz_id: pedido.matriz_id, empresa_id: pedido.empresa_id, usuario_id: usuarioId, acao: 'pedido.amostra_alterada', entidade: 'pedido_amostras', entidade_id: amostraId,
      detalhes: { numero: pedido.numero, quantidade: a.quantidade, unidade: a.unidade, logistica: a.logistica, custo_materia_prima: a.custo_materia_prima },
    });
    return this.detalhar(escopo, empresaId, id);
  }

  // Envio lançado errado é cancelado (sai do resumo), nunca apagado
  async alterarAtivoAmostra(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, amostraId: string, ativo: boolean) {
    const pedido = await this.exigirRascunho(escopo, empresaId, id);
    await this.exigirAmostra(id, amostraId);
    await this.pool.query('UPDATE pedido_amostras SET ativo=? WHERE id=? AND pedido_id=?', [ativo ? 1 : 0, amostraId, id]);
    await this.auditoria.registrar(null, {
      matriz_id: pedido.matriz_id, empresa_id: pedido.empresa_id, usuario_id: usuarioId, acao: ativo ? 'pedido.amostra_restaurada' : 'pedido.amostra_cancelada',
      entidade: 'pedido_amostras', entidade_id: amostraId, detalhes: { numero: pedido.numero },
    });
    return this.detalhar(escopo, empresaId, id);
  }

  private async validarAmostra(escopo: EscopoSessao, pedido: any, dto: AmostraDto) {
    const formulacaoId = dto.formulacao_id || pedido.formulacao_id;
    if (!formulacaoId) throw new BadRequestException('O pedido ainda não tem formulação: adicione uma antes de registrar amostras');
    const [hist]: any = await this.pool.query('SELECT id FROM pedido_formulacoes WHERE pedido_id = ? AND formulacao_id = ?', [pedido.id, formulacaoId]);
    if (!hist.length) throw new BadRequestException('Formulação não faz parte deste pedido');
    let envaseId: string | null = null;
    if (dto.envase_id) {
      const v = await this.envases.buscar(escopo, pedido.empresa_id, dto.envase_id).catch(() => {
        throw new BadRequestException('Item de envase não encontrado para a empresa do pedido');
      });
      envaseId = v.id;
    }
    // Custo da matéria-prima gasta na amostra: a quantidade da amostra vale em unidades da formulação
    const custo = await this.custoMateriaPrimaAmostra(formulacaoId, dto.quantidade);
    return {
      formulacao_id: formulacaoId, quantidade: dto.quantidade, unidade: dto.unidade?.trim() || 'un', envase_id: envaseId,
      embalagens: dto.embalagens ?? 0, logistica: dto.logistica ?? 0, custo_materia_prima: custo.total, custo_mp_incompleto: custo.incompleto ? 1 : 0,
      data_envio: dto.data_envio, observacoes: dto.observacoes?.trim() || null,
    };
  }

  // Soma, ingrediente a ingrediente, o necessário para a quantidade da amostra × valor de compra.
  // Ingrediente sem preço ou sem conversão fica de fora e marca o custo como incompleto
  private async custoMateriaPrimaAmostra(formulacaoId: string, quantidade: number): Promise<{ total: number; incompleto: boolean }> {
    const [itens]: any = await this.pool.query(
      'SELECT i.quantidade, i.unidade, m.valor_compra, m.unidade AS unidade_compra FROM formulacao_itens i JOIN materias_primas m ON m.id = i.materia_prima_id WHERE i.formulacao_id = ?',
      [formulacaoId],
    );
    let total = 0;
    let incompleto = false;
    for (const i of itens) {
      const n = necessidade(Number(i.quantidade), i.unidade, quantidade);
      const c = custoMateriaPrima(n.quantidade, n.unidade, i.valor_compra, i.unidade_compra);
      if (c.custo == null) incompleto = true;
      else total += c.custo;
    }
    return { total: Math.round(total * 100) / 100, incompleto };
  }

  private async exigirAmostra(pedidoId: string, amostraId: string) {
    const [rows]: any = await this.pool.query('SELECT id FROM pedido_amostras WHERE id = ? AND pedido_id = ?', [amostraId, pedidoId]);
    if (!rows.length) throw new NotFoundException('Envio de amostra não encontrado');
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
    return this.detalhar(escopo, empresaId, id);
  }

  // Formulação por id (visível para a empresa do pedido e ativa) ou por nome: reaproveita a
  // existente com o mesmo nome, senão cria uma nova só com o nome, na empresa do pedido
  private async resolverFormulacao(escopo: EscopoSessao, dona: string, usuarioId: string, dto: { formulacao_id?: string; formulacao_nome?: string }): Promise<string | null> {
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

  private async exigirRascunho(escopo: EscopoSessao, empresaId: string, id: string) {
    const p = await this.exigirEditavel(escopo, empresaId, id);
    if (p.status !== 'rascunho') throw new BadRequestException(`Pedido ${p.status}: reabra para alterar`);
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

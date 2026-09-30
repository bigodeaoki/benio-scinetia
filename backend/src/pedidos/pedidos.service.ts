import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { EnvasesService } from '../envases/envases.service';
import { FormulacoesService } from '../formulacoes/formulacoes.service';
import { MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { custoMateriaPrima, necessidade, producaoPrevista } from '../shared/necessidade';
import { AmostraDto, CustoDto, CustosDto, MaquinaPedidoDto, PedidoDto, ProducaoDto, TrocaFormulacaoDto, UtilitarioPedidoDto } from './pedidos.dto';

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
    return {
      ...pedido, formulacoes, amostras, amostras_resumo: this.resumoAmostras(amostras), formulacao_ingredientes: ingredientes, maquinas,
      rendimento_combinado_pct: prevista ? prevista.rendimento_pct : null, producao_prevista: prevista ? prevista.quantidade : null,
      custos, custos_resumo: this.resumoCustos(custos, producao, prevista ? prevista.quantidade : null), custos_producao, utilitarios,
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

  // Etapa 3 (Custos): linhas de custo do pedido, regravadas por inteiro. Nome e valor
  // unitário ficam gravados na hora: mudar o cadastro depois não altera o pedido
  async definirCustos(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: CustosDto) {
    const pedido = await this.exigirRascunho(escopo, empresaId, id);
    const linhas = await this.validarCustos(escopo, pedido, dto.itens);
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      await cx.query('DELETE FROM pedido_custos WHERE pedido_id = ?', [id]);
      if (linhas.length) {
        await cx.query('INSERT INTO pedido_custos (id, pedido_id, tipo, referencia_id, descricao, quantidade, unidade, valor_unitario, total, ordem) VALUES ?', [
          linhas.map((l, i) => [novoId(), id, l.tipo, l.referencia_id, l.descricao, l.quantidade, l.unidade, l.valor_unitario, l.total, i + 1]),
        ]);
      }
      await cx.commit();
    } catch (e) {
      await cx.rollback();
      throw e;
    } finally {
      cx.release();
    }
    const total = Math.round(linhas.reduce((s, l) => s + l.total, 0) * 100) / 100;
    await this.auditoria.registrar(null, {
      matriz_id: pedido.matriz_id, empresa_id: pedido.empresa_id, usuario_id: usuarioId, acao: 'pedido.custos_definidos', entidade: 'pedidos', entidade_id: id,
      detalhes: { numero: pedido.numero, linhas: linhas.length, total },
    });
    return this.detalhar(escopo, empresaId, id);
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
    if (etapa > 2 && !(Number(atual.quantidade_producao) > 0)) throw new BadRequestException('Informe a quantidade de produção para avançar');
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

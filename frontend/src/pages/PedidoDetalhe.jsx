import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtBRL, fmtData, fmtDataHora, fmtQtd, hoje, toast, useDados } from '../ui.jsx';
import { BuscaFormulacao, ETAPAS, PODE_EDITAR_CUSTOS, PODE_EDITAR_PEDIDOS, STATUS, Stepper, custoMateriaPrima, custoTotalPedido, fmtNumero, necessidade, producaoPrevista } from './pedidos-comum.jsx';

// Página do pedido, também para criar (/pedidos/novo): stepper com as etapas
// no topo. Etapa 1: dados do pedido, histórico de formulações (a nova põe a
// anterior em desuso) e envios de amostra.
export default function PedidoDetalhe() {
  const { id } = useParams();
  const novo = id === 'novo';
  const navegar = useNavigate();
  const s = React.useContext(SessaoContext);
  const { dados: p, erro, carregando, recarregar } = useDados(() => (novo ? Promise.resolve(null) : api(`/pedidos/${id}`)), [id, s.empresaId]);
  const [vista, setVista] = React.useState(null);
  // A etapa aberta registra aqui o que precisa salvar antes de avançar
  const antesDeAvancar = React.useRef(null);
  const etapaVista = novo ? 1 : vista || p?.etapa || 1;
  const papelEdita = PODE_EDITAR_PEDIDOS.includes(s.usuario?.papel) && (novo || !!p?.editavel);
  const podeEditar = papelEdita && (novo || p?.status === 'rascunho');
  const editaCustos = PODE_EDITAR_CUSTOS.includes(s.usuario?.papel) && !!p?.editavel && p?.status === 'rascunho';
  const empresaDe = (x, campo = 'empresa') => (x[`${campo}_id`] === s.escopo?.matriz?.id ? `${x[`${campo}_nome`]} (matriz)` : x[`${campo}_nome`]);

  // Avançar salva a etapa em que o pedido está; voltar e clicar no stepper só mudam a visão.
  // Sair da etapa 1 pergunta se o cliente aprovou a formulação ativa (fica registrado nela)
  async function avancar() {
    const n = etapaVista + 1;
    if (n > ETAPAS.length) return;
    // (true, true): indo para a frente, pelo botão "Próxima etapa" (a etapa aberta pode pedir confirmação)
    if (antesDeAvancar.current && !(await antesDeAvancar.current(true, true))) return;
    if (!podeEditar || n <= p.etapa) { setVista(n); return; }
    let clienteAprovou = false;
    if (etapaVista === 1) {
      const ativa = p.formulacoes.find((f) => f.ativa);
      if (!ativa) return toast.erro('Adicione uma formulação ao pedido antes de avançar');
      if (!ativa.aprovada_em) {
        clienteAprovou = await confirmar({
          titulo: 'Cliente aprovou?',
          mensagem: `O cliente aprovou a formulação "${ativa.nome}"? Ao confirmar, a aprovação fica registrada nela e o pedido avança para a etapa 2.`,
          confirmarTexto: 'Sim, cliente aprovou', cancelarTexto: 'Ainda não',
        });
        if (!clienteAprovou) return;
      }
    }
    try {
      await api(`/pedidos/${id}/etapa`, { method: 'PUT', body: { etapa: n, ...(clienteAprovou ? { cliente_aprovou: true } : {}) } });
      setVista(n);
      recarregar();
      if (clienteAprovou) toast.sucesso('Aprovação do cliente registrada');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  // Sair da etapa aberta pelo stepper ou por "Etapa anterior" também salva o que foi alterado nela;
  // se o salvamento falhar (ex.: campo obrigatório), fica na etapa e mostra o erro
  async function irPara(n) {
    if (n === etapaVista) return;
    if (antesDeAvancar.current && !(await antesDeAvancar.current(n > etapaVista))) return;
    setVista(n);
  }

  async function mudarStatus(status) {
    const cancelar = status === 'cancelado';
    const ok = await confirmar({ titulo: cancelar ? 'Cancelar pedido' : 'Reabrir pedido', mensagem: cancelar ? `Cancelar o pedido ${fmtNumero(p.numero)}? Ele fica no histórico e pode ser reaberto.` : `Reabrir o pedido ${fmtNumero(p.numero)} como rascunho?`, confirmarTexto: cancelar ? 'Cancelar pedido' : 'Reabrir', perigo: cancelar });
    if (!ok) return;
    try {
      await api(`/pedidos/${id}/status`, { method: 'PUT', body: { status } });
      recarregar();
      toast.sucesso(cancelar ? 'Pedido cancelado' : 'Pedido reaberto');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  if (!novo && carregando && !p) return <Carregando />;
  if (!novo && erro && !p) return <div className="cartao"><Erro msg={erro} /><button className="botao botao-secundario" onClick={() => navegar('/pedidos')}>← Pedidos</button></div>;
  if (!novo && !p) return null;

  return (
    <div className="cartao">
      <div className="cartao-cabecalho">
        <h3><ClipboardList size={15} className="icone-cartao" />{novo ? 'Novo pedido' : `Pedido ${fmtNumero(p.numero)} · ${p.cliente_nome}${p.cliente_fantasia ? ` (${p.cliente_fantasia})` : ''}`}</h3>
        {!novo && <Badge cor={STATUS[p.status]?.[1] || 'cinza'}>{STATUS[p.status]?.[0] || p.status}</Badge>}
        {!novo && <span className="texto-suave">{empresaDe(p)} · criado por {p.usuario_nome || '—'} em {fmtDataHora(p.criado_em)}</span>}
        <button className="botao botao-secundario botao-mini" onClick={() => navegar('/pedidos')}>← Pedidos</button>
        {!novo && podeEditar && <button className="botao botao-perigo botao-mini" onClick={() => mudarStatus('cancelado')}>Cancelar pedido</button>}
        {!novo && papelEdita && p.status === 'cancelado' && <button className="botao botao-secundario botao-mini" onClick={() => mudarStatus('rascunho')}>Reabrir</button>}
      </div>
      <Stepper atual={novo ? 1 : p.etapa} vista={etapaVista} aoEscolher={novo ? undefined : irPara} />
      <Erro msg={erro} />
      {novo && <div className="alerta alerta-info">Etapa 1: informe o cliente e, se já souber, a formulação inicial. Ao criar, o pedido ganha número e você segue nesta página, com o histórico de formulações e os envios de amostra.</div>}
      {!novo && !podeEditar && (
        <div className="alerta alerta-info">
          {p.status !== 'rascunho' ? `Pedido ${STATUS[p.status]?.[0].toLowerCase()}: somente leitura.` : !p.editavel ? `Pedido de ${p.empresa_nome}: só essa empresa, ou a dona do grupo, altera.` : editaCustos ? 'Seu papel edita só as etapas de envase, custos e impostos; o restante é consulta.' : 'Seu papel só consulta pedidos.'}
        </div>
      )}
      {etapaVista === 1 ? (
        <>
          <Cabecalho p={p} novo={novo} podeEditar={podeEditar} s={s} recarregar={recarregar}
            aoCriar={(criado) => { toast.sucesso(`Pedido ${fmtNumero(criado.numero)} criado`); navegar(`/pedidos/${criado.id}`, { replace: true }); }} />
          {!novo && <Etapa1 p={p} podeEditar={podeEditar} recarregar={recarregar} empresaDe={empresaDe} />}
        </>
      ) : etapaVista === 2 ? (
        <EtapaEnvase key={p.id} p={p} podeEditar={editaCustos} recarregar={recarregar} antesDeAvancar={antesDeAvancar} />
      ) : etapaVista === 3 ? (
        <EtapaProducao key={p.id} p={p} podeEditar={podeEditar} recarregar={recarregar} antesDeAvancar={antesDeAvancar} />
      ) : etapaVista === 4 ? (
        <EtapaCustos key={p.id} p={p} podeEditar={editaCustos} recarregar={recarregar} antesDeAvancar={antesDeAvancar} />
      ) : etapaVista === 5 ? (
        <EtapaImpostos key={p.id} p={p} podeEditar={editaCustos} recarregar={recarregar} antesDeAvancar={antesDeAvancar} />
      ) : <div className="vazio">Etapa {etapaVista} · {ETAPAS[etapaVista - 1]?.nome}: conteúdo em definição.</div>}
      {!novo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <button className="botao botao-secundario" disabled={etapaVista <= 1} onClick={() => irPara(etapaVista - 1)}>← Etapa anterior</button>
          <button className="botao" disabled={etapaVista >= ETAPAS.length} onClick={avancar} title={podeEditar ? 'Salva a etapa em que o pedido está' : undefined}>Próxima etapa →</button>
        </div>
      )}
    </div>
  );
}

// Dados do pedido: cliente, empresa e observações. Na criação, também a formulação inicial
function Cabecalho({ p, novo, podeEditar, s, aoCriar, recarregar }) {
  const { dados: clientes } = useDados(() => api('/clientes'), []);
  const ehDono = s.usuario?.papel === 'owner';
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const empresaDoCliente = (c) => (c.empresa_id === s.escopo?.matriz?.id ? `${c.empresa_nome} (matriz)` : c.empresa_nome);
  const [f, setF] = React.useState({ cliente_id: p?.cliente_id || '', observacoes: p?.observacoes || '', empresa_id: p?.empresa_id || s.empresaId, formulacao: null });
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);
  const mudar = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));
  const alterado = novo || (p && (f.cliente_id !== p.cliente_id || (f.observacoes || '') !== (p.observacoes || '')));
  const clientesAtivos = (clientes || []).filter((c) => c.ativo || c.id === f.cliente_id);

  async function salvar() {
    setErro(null);
    if (!f.cliente_id) return setErro('Escolha o cliente');
    setSalvando(true);
    try {
      if (novo) {
        const criado = await api('/pedidos', { method: 'POST', body: {
          cliente_id: f.cliente_id, observacoes: f.observacoes.trim() || undefined, empresa_id: f.empresa_id,
          formulacao_id: f.formulacao?.id || undefined, formulacao_nome: f.formulacao?.nova ? f.formulacao.nome : undefined,
        } });
        aoCriar(criado);
        return;
      }
      await api(`/pedidos/${p.id}`, { method: 'PUT', body: { cliente_id: f.cliente_id, observacoes: f.observacoes.trim() || undefined } });
      recarregar();
      toast.sucesso('Dados do pedido salvos');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!novo && !podeEditar) return null;

  return (
    <>
      <Titulo>Dados do pedido</Titulo>
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Cliente *" dica="Clientes ativos do grupo">
          <select value={f.cliente_id} onChange={(e) => mudar('cliente_id', e.target.value)} autoFocus={novo}>
            <option value="">Escolha…</option>
            {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.razao_social}{c.nome_fantasia ? ` · ${c.nome_fantasia}` : ''} — {empresaDoCliente(c)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Empresa do pedido *" largura={240} dica={novo && ehDono ? 'Empresa do grupo que faz o pedido' : undefined}>
          {novo && ehDono
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={p ? p.empresa_nome : nomeEmpresa(s.empresas.find((e) => e.id === f.empresa_id))} readOnly />}
        </Campo>
      </div>
      {novo && (
        <div className="linha-campos">
          <Campo rotulo="Formulação inicial" dica="Digite 3 letras para buscar nesta empresa e na matriz; se não existir, crie só com o nome. Pode ficar para depois">
            <BuscaFormulacao valor={f.formulacao} aoEscolher={(v) => mudar('formulacao', v)} />
          </Campo>
        </div>
      )}
      {novo && f.formulacao && (
        <div className={`alerta ${f.formulacao.nova ? 'alerta-aviso' : 'alerta-info'}`}>
          {f.formulacao.nova
            ? <>Nova formulação <strong>{f.formulacao.nome}</strong>: será criada só com o nome nesta empresa; a farmácia completa os ingredientes depois.</>
            : <>Formulação <strong>{f.formulacao.nome}</strong>{Number(f.formulacao.itens) === 0 ? ' (ainda sem ingredientes)' : ''}.</>}
        </div>
      )}
      <div className="linha-campos">
        <Campo rotulo="Observações"><input value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} /></Campo>
      </div>
      <button className="botao" disabled={salvando || !alterado} onClick={salvar}>{novo ? (salvando ? 'Criando…' : 'Criar pedido') : (salvando ? 'Salvando…' : 'Salvar dados')}</button>
    </>
  );
}

const Titulo = ({ children }) => <h4 style={{ margin: '18px 0 8px', fontSize: 14 }}>{children}</h4>;

// Etapa 1: formulações do pedido (histórico) e envios de amostra
function Etapa1({ p, podeEditar, recarregar, empresaDe }) {
  const [trocando, setTrocando] = React.useState(false);
  const [amostra, setAmostra] = React.useState(null);
  const ativa = p.formulacoes.find((f) => f.ativa);
  const r = p.amostras_resumo;

  async function alterarAtivoAmostra(a, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Restaurar envio' : 'Cancelar envio', mensagem: ativo ? 'Restaurar este envio de amostra?' : 'Cancelar este envio de amostra? Ele sai do resumo, mas fica no histórico.', confirmarTexto: ativo ? 'Restaurar' : 'Cancelar envio', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/pedidos/${p.id}/amostras/${a.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Envio restaurado' : 'Envio cancelado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <Titulo>Formulações do pedido</Titulo>
      <div className="alerta alerta-info">
        A formulação <strong>ativa</strong> é a que vai para amostra e produção. Se o cliente não aprovar, adicione outra: a anterior entra em desuso neste pedido (o cadastro de formulações não muda).
      </div>
      {!p.formulacoes.length ? <Vazio msg="Nenhuma formulação ainda" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Formulação</th><th>Ingredientes</th><th>Cadastro</th><th>Situação</th><th>Adicionada em</th><th>Em desuso desde</th><th>Motivo</th><th>Por</th></tr></thead>
            <tbody>
              {p.formulacoes.map((f) => (
                <tr key={f.id} style={f.ativa ? undefined : { opacity: 0.6 }}>
                  <td className="negrito">{f.nome} {!f.formulacao_ativa && <Badge cor="vermelho">inativa no cadastro</Badge>}</td>
                  <td>{Number(f.itens) === 0 ? <Badge cor="amarelo">sem ingredientes</Badge> : `${f.itens} ingrediente(s)`}</td>
                  <td>{empresaDe(f, 'formulacao_empresa')}</td>
                  <td>{f.ativa ? (f.aprovada_em ? <Badge cor="verde">Ativa · aprovada pelo cliente em {fmtData(f.aprovada_em)}{f.aprovada_por_nome ? ` (${f.aprovada_por_nome})` : ''}</Badge> : <Badge cor="azul">Ativa · aguardando aprovação</Badge>) : <Badge cor="cinza">Em desuso</Badge>}</td>
                  <td>{fmtDataHora(f.criado_em)}</td>
                  <td>{f.desativada_em ? fmtDataHora(f.desativada_em) : '—'}</td>
                  <td className="texto-suave">{f.motivo || '—'}</td>
                  <td>{f.usuario_nome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && !trocando && (
        <button className="botao botao-secundario botao-mini" style={{ marginTop: 8 }} onClick={() => setTrocando(true)}>{ativa ? '+ Adicionar outra formulação (a atual entra em desuso)' : '+ Adicionar formulação'}</button>
      )}
      {trocando && <FormTroca pedidoId={p.id} temAtiva={!!ativa} aoFechar={() => setTrocando(false)} aoSalvar={() => { setTrocando(false); recarregar(); toast.sucesso('Formulação adicionada ao pedido'); }} />}

      <Titulo>Envios de amostra</Titulo>
      <div className="alerta alerta-info">
        Cada envio registra a quantidade da formulação, as embalagens usadas, o valor da logística e o custo da matéria-prima gasta, calculado no salvamento pela fórmula e pelos preços do cadastro.
        É gasto que a empresa arca: fica à parte e <strong>não entra no custo global do pedido</strong>.
      </div>
      <div className="grade-kpis">
        <div className="kpi"><div className="kpi-rotulo">Envios</div><div className="kpi-valor">{r.envios}</div><div className="kpi-extra">{r.embalagens_total} embalagem(ns)</div></div>
        <div className="kpi"><div className="kpi-rotulo">Formulação enviada</div><div className="kpi-valor" style={{ fontSize: 18 }}>{r.quantidades.length ? r.quantidades.map((q) => `${fmtQtd(q.total)} ${q.unidade}`).join(' · ') : '—'}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Matéria-prima gasta</div><div className="kpi-valor">{fmtBRL(r.materia_prima_total)}</div><div className="kpi-extra">{r.incompletos ? `${r.incompletos} envio(s) com ingrediente sem preço` : 'pela fórmula e pelos preços do cadastro'}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Logística</div><div className="kpi-valor">{fmtBRL(r.logistica_total)}</div></div>
        <div className="kpi" style={{ background: '#fdf2d9', border: '1px solid #e9c46a' }}><div className="kpi-rotulo">Custo das amostras</div><div className="kpi-valor">{fmtBRL(r.custo_total)}</div><div className="kpi-extra">a empresa arca; fora do custo global</div></div>
      </div>
      {!p.amostras.length ? <Vazio msg="Nenhum envio de amostra" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Formulação</th><th className="num">Quantidade</th><th className="num">Embalagens</th><th className="num">Matéria-prima</th><th className="num">Logística</th><th>Observações</th><th>Por</th><th>Status</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {p.amostras.map((a) => (
                <tr key={a.id} style={a.ativo ? undefined : { opacity: 0.55 }}>
                  <td>{fmtData(a.data_envio)}</td>
                  <td>{a.formulacao_nome}</td>
                  <td className="num">{fmtQtd(a.quantidade)} {a.unidade}</td>
                  <td className="num">{a.embalagens}{a.envase_nome ? <span className="texto-suave"> · {a.envase_nome}</span> : ''}</td>
                  <td className="num">{a.custo_materia_prima != null ? <>{fmtBRL(a.custo_materia_prima)}{a.custo_mp_incompleto ? <> <Badge cor="amarelo" >incompleto</Badge></> : null}</> : <span className="texto-suave">—</span>}</td>
                  <td className="num">{fmtBRL(a.logistica)}</td>
                  <td className="texto-suave">{a.observacoes || '—'}</td>
                  <td>{a.usuario_nome || '—'}</td>
                  <td><Badge cor={a.ativo ? 'verde' : 'cinza'}>{a.ativo ? 'Enviada' : 'Cancelada'}</Badge></td>
                  {podeEditar && (
                    <td className="acoes">
                      <button className="botao botao-secundario botao-mini" onClick={() => setAmostra(a)}>Editar</button>
                      {a.ativo
                        ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivoAmostra(a, false)}>Cancelar</button>
                        : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivoAmostra(a, true)}>Restaurar</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && <button className="botao botao-mini" style={{ marginTop: 8 }} disabled={!p.formulacoes.length} title={!p.formulacoes.length ? 'Adicione uma formulação antes' : undefined} onClick={() => setAmostra({ nova: true })}>+ Registrar envio de amostra</button>}
      {amostra && <FormAmostra p={p} amostra={amostra.nova ? null : amostra} aoFechar={() => setAmostra(null)} aoSalvar={() => { setAmostra(null); recarregar(); toast.sucesso('Envio de amostra salvo'); }} />}
    </>
  );
}

// Nova formulação para o pedido: busca ou cria pelo nome, com o motivo da troca
function FormTroca({ pedidoId, temAtiva, aoFechar, aoSalvar }) {
  const [formulacao, setFormulacao] = React.useState(null);
  const [motivo, setMotivo] = React.useState('');
  const [erro, setErro] = React.useState(null);

  async function salvar() {
    setErro(null);
    if (!formulacao) return setErro('Escolha uma formulação ou crie uma nova pelo nome');
    try {
      await api(`/pedidos/${pedidoId}/formulacoes`, { method: 'POST', body: { formulacao_id: formulacao.id || undefined, formulacao_nome: formulacao.nova ? formulacao.nome : undefined, motivo: motivo.trim() || undefined } });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <div className="cartao" style={{ marginTop: 10, background: '#f8fafc' }}>
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Formulação *" dica="Digite 3 letras para buscar; se não existir, crie só com o nome"><BuscaFormulacao valor={formulacao} aoEscolher={setFormulacao} autoFocus /></Campo>
        {temAtiva && <Campo rotulo="Motivo da troca" dica="ex.: cliente não aprovou a amostra"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>}
      </div>
      {formulacao?.nova && <div className="alerta alerta-aviso">Nova formulação <strong>{formulacao.nome}</strong>: será criada só com o nome; a farmácia completa os ingredientes depois.</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="botao" onClick={salvar}>{temAtiva ? 'Adicionar e pôr a atual em desuso' : 'Adicionar'}</button>
        <button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button>
      </div>
    </div>
  );
}

// Envio de amostra: formulação do histórico (padrão: a ativa), quantidade, embalagens, logística e data
function FormAmostra({ p, amostra, aoFechar, aoSalvar }) {
  const { dados: envases } = useDados(() => api('/envases'), []);
  const ativa = p.formulacoes.find((f) => f.ativa);
  const [f, setF] = React.useState(amostra
    ? { formulacao_id: amostra.formulacao_id, quantidade: amostra.quantidade, unidade: amostra.unidade, envase_id: amostra.envase_id || '', embalagens: amostra.embalagens, logistica: amostra.logistica, data_envio: amostra.data_envio, observacoes: amostra.observacoes || '' }
    : { formulacao_id: ativa?.formulacao_id || p.formulacoes[0]?.formulacao_id || '', quantidade: '', unidade: 'un', envase_id: '', embalagens: '', logistica: '', data_envio: hoje(), observacoes: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    const corpo = {
      formulacao_id: f.formulacao_id || undefined, quantidade: Number(f.quantidade), unidade: f.unidade || undefined, envase_id: f.envase_id || undefined,
      embalagens: f.embalagens === '' ? undefined : Number(f.embalagens), logistica: f.logistica === '' ? undefined : Number(f.logistica),
      data_envio: f.data_envio, observacoes: f.observacoes.trim() || undefined,
    };
    try {
      if (amostra) await api(`/pedidos/${p.id}/amostras/${amostra.id}`, { method: 'PUT', body: corpo });
      else await api(`/pedidos/${p.id}/amostras`, { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={amostra ? 'Editar envio de amostra' : 'Registrar envio de amostra'} largura={720} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar envio</button></>}
    >
      <Erro msg={erro} />
      <div className="alerta alerta-info">Gasto informativo: <strong>não entra no custo do pedido</strong>.</div>
      <div className="linha-campos">
        <Campo rotulo="Formulação *">
          <select value={f.formulacao_id} onChange={(e) => mudar('formulacao_id', e.target.value)} autoFocus>
            {p.formulacoes.map((x) => <option key={x.id} value={x.formulacao_id}>{x.nome}{x.ativa ? ' (ativa)' : ' (em desuso)'}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Quantidade *" largura={150}><input type="number" step="any" min="0" value={f.quantidade} onChange={(e) => mudar('quantidade', e.target.value)} /></Campo>
        <Campo rotulo="Unidade *" largura={110} dica="kg, L, un…"><input value={f.unidade} onChange={(e) => mudar('unidade', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Item de envase" dica="Opcional: qual embalagem foi usada">
          <select value={f.envase_id} onChange={(e) => mudar('envase_id', e.target.value)}>
            <option value="">—</option>
            {(envases || []).filter((v) => v.ativo || v.id === f.envase_id).map((v) => <option key={v.id} value={v.id}>{v.nome}{v.origem === 'matriz' ? ' (da matriz)' : ''}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Embalagens usadas" largura={160}><input type="number" step="1" min="0" value={f.embalagens} onChange={(e) => mudar('embalagens', e.target.value)} /></Campo>
        <Campo rotulo="Logística (R$)" largura={160}><input type="number" step="0.01" min="0" value={f.logistica} onChange={(e) => mudar('logistica', e.target.value)} /></Campo>
        <Campo rotulo="Data do envio *" largura={170}><input type="date" value={f.data_envio} onChange={(e) => mudar('data_envio', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Observações"><input value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} /></Campo>
      </div>
    </Modal>
  );
}


const UNIDADES_PRODUCAO = ['un', 'kg', 'g', 'L', 'mL'];
const assinatura = (lista) => JSON.stringify((lista || []).map((m) => [m.maquina_id, Number(m.rendimento_pct), Number(m.horas) || 0]));
const assinaturaUt = (lista) => JSON.stringify((lista || []).map((u) => [u.utilitario_id, Number(u.quantidade) || 0]));
const custoMaquina = (m) => Math.round((Number(m.horas) || 0) * (Number(m.custo_hora) || 0) * 100) / 100;
const custoUtilitario = (u) => Math.round((Number(u.quantidade) || 0) * (Number(u.valor) || 0) * 100) / 100;

// Divisória entre os blocos da etapa: número, título e uma linha
const Divisoria = ({ numero, titulo, primeiro }) => (
  <div style={{ marginTop: primeiro ? 6 : 28, paddingTop: primeiro ? 0 : 16, borderTop: primeiro ? 0 : '2px solid #dfe5ee', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
    <span className="badge badge-azul" style={{ width: 24, height: 24, display: 'inline-grid', placeItems: 'center', borderRadius: '50%', padding: 0, fontSize: 12 }}>{numero}</span>
    <h4 style={{ margin: 0, fontSize: 14 }}>{titulo}</h4>
  </div>
);

// Etapa 3, Produção, em quatro blocos: formulação e quantidade, matérias-primas necessárias (com o custo
// pelo valor de compra), maquinário com rendimento e horas, e utilitários consumidos. No fim, o custo global
function EtapaProducao({ p, podeEditar, recarregar, antesDeAvancar }) {
  const ativa = p.formulacoes.find((x) => x.ativa);
  const ingredientes = p.formulacao_ingredientes || [];
  const { dados: cadastro } = useDados(() => api(`/maquinas?empresa=${p.empresa_id}`).catch(() => []), [p.empresa_id]);
  const { dados: cadastroUt } = useDados(() => api(`/utilitarios?empresa=${p.empresa_id}`).catch(() => []), [p.empresa_id]);
  const [f, setF] = React.useState({
    quantidade: p.quantidade_producao ?? '', unidade: p.unidade_producao || 'un',
    maquinas: (p.maquinas || []).map((m) => ({ maquina_id: m.maquina_id, titulo: m.titulo, modelo: m.modelo, rendimento_padrao: m.rendimento_padrao, rendimento_pct: m.rendimento_pct, horas: m.horas ?? '', custo_hora: m.custo_hora_pedido ?? m.custo_hora })),
    utilitarios: (p.utilitarios || []).map((u) => ({ utilitario_id: u.utilitario_id, nome: u.nome, descricao: u.descricao, valor: u.valor, quantidade: u.quantidade ?? '' })),
  });
  const [escolhida, setEscolhida] = React.useState('');
  const [escolhidoUt, setEscolhidoUt] = React.useState('');
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);
  const mudar = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));
  const producao = Number(f.quantidade) > 0 ? Number(f.quantidade) : 0;
  // O rendimento das máquinas reduz o que sai, não a matéria-prima
  const prevista = producaoPrevista(producao, f.maquinas.map((m) => Number(m.rendimento_pct)).filter((r) => r > 0 && r <= 100));
  const alterado = String(f.quantidade) !== String(p.quantidade_producao ?? '') || f.unidade.trim() !== (p.unidade_producao || 'un') || assinatura(f.maquinas) !== assinatura(p.maquinas) || assinaturaUt(f.utilitarios) !== assinaturaUt(p.utilitarios);
  const disponiveis = (cadastro || []).filter((m) => m.ativo && !f.maquinas.some((x) => x.maquina_id === m.id));
  const disponiveisUt = (cadastroUt || []).filter((u) => u.ativo && !f.utilitarios.some((x) => x.utilitario_id === u.id));
  // Custos calculados ao vivo: matéria-prima pelo valor de compra, máquinas por horas × custo-hora, utilitários por quantidade × valor
  const linhasMp = ingredientes.map((i) => {
    const n = producao ? necessidade(i.quantidade, i.unidade, producao) : null;
    const c = n ? custoMateriaPrima(n.quantidade, n.unidade, i.valor_compra, i.unidade_compra) : { custo: null, aviso: null };
    return { ...i, n, custo: c.custo, aviso: c.aviso };
  });
  const custoMp = Math.round(linhasMp.reduce((s, l) => s + (l.custo || 0), 0) * 100) / 100;
  const semCusto = producao ? linhasMp.filter((l) => l.custo == null).length : 0;
  const custoMaq = Math.round(f.maquinas.reduce((s, m) => s + custoMaquina(m), 0) * 100) / 100;
  const horasTotal = f.maquinas.reduce((s, m) => s + (Number(m.horas) || 0), 0);
  const custoUt = Math.round(f.utilitarios.reduce((s, u) => s + custoUtilitario(u), 0) * 100) / 100;
  const custoGlobal = Math.round((custoMp + custoMaq + custoUt) * 100) / 100;
  // O envase (etapa 2) já soma no custo global; a produção desta etapa vem por cima
  const custoEnvase = Number(p.custo_pedido?.envase) || 0;
  const custoAcumulado = Math.round((custoEnvase + custoGlobal) * 100) / 100;

  function adicionarMaquina() {
    const m = (cadastro || []).find((x) => x.id === escolhida);
    if (!m) return;
    setF((x) => ({ ...x, maquinas: [...x.maquinas, { maquina_id: m.id, titulo: m.titulo, modelo: m.modelo, rendimento_padrao: m.rendimento_pct, rendimento_pct: m.rendimento_pct, horas: '', custo_hora: m.custo_hora }] }));
    setEscolhida('');
  }
  function adicionarUtilitario() {
    const u = (cadastroUt || []).find((x) => x.id === escolhidoUt);
    if (!u) return;
    setF((x) => ({ ...x, utilitarios: [...x.utilitarios, { utilitario_id: u.id, nome: u.nome, descricao: u.descricao, valor: u.valor, quantidade: 1 }] }));
    setEscolhidoUt('');
  }
  const mudarMaquina = (i, campo, valor) => setF((x) => ({ ...x, maquinas: x.maquinas.map((m, j) => (j === i ? { ...m, [campo]: valor } : m)) }));
  const removerMaquina = (i) => setF((x) => ({ ...x, maquinas: x.maquinas.filter((_, j) => j !== i) }));
  const mudarUtilitario = (i, valor) => setF((x) => ({ ...x, utilitarios: x.utilitarios.map((u, j) => (j === i ? { ...u, quantidade: valor } : u)) }));
  const removerUtilitario = (i) => setF((x) => ({ ...x, utilitarios: x.utilitarios.filter((_, j) => j !== i) }));

  async function salvar() {
    setErro(null);
    if (!(Number(f.quantidade) > 0)) { setErro('Informe a quantidade a produzir'); return false; }
    if (!f.unidade.trim()) { setErro('Informe a unidade'); return false; }
    const fora = f.maquinas.find((m) => !(Number(m.rendimento_pct) > 0 && Number(m.rendimento_pct) <= 100));
    if (fora) { setErro(`Rendimento de ${fora.titulo}: entre 0,01 e 100 %`); return false; }
    const horasRuim = f.maquinas.find((m) => m.horas !== '' && !(Number(m.horas) >= 0));
    if (horasRuim) { setErro(`Horas de ${horasRuim.titulo}: informe um número`); return false; }
    const utRuim = f.utilitarios.find((u) => u.quantidade !== '' && !(Number(u.quantidade) >= 0));
    if (utRuim) { setErro(`Quantidade de ${utRuim.nome}: informe um número`); return false; }
    setSalvando(true);
    try {
      await api(`/pedidos/${p.id}/producao`, { method: 'PUT', body: {
        quantidade: Number(f.quantidade), unidade: f.unidade.trim(),
        maquinas: f.maquinas.map((m) => ({ maquina_id: m.maquina_id, rendimento_pct: Number(m.rendimento_pct), horas: m.horas === '' ? undefined : Number(m.horas) })),
        utilitarios: f.utilitarios.map((u) => ({ utilitario_id: u.utilitario_id, quantidade: u.quantidade === '' ? undefined : Number(u.quantidade) })),
      } });
      recarregar();
      toast.sucesso('Produção salva');
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // "Próxima etapa" abre a confirmação: salva a etapa 2 e vai para a próxima. O stepper e "Etapa anterior"
  // só salvam, se algo mudou
  React.useEffect(() => {
    antesDeAvancar.current = podeEditar ? async (frente, pelaProxima) => {
      const naoSalva = !(Number(p.quantidade_producao) > 0);
      if (!pelaProxima) return alterado || (frente && naoSalva) ? salvar() : true;
      if (!(Number(f.quantidade) > 0)) { setErro('Informe a quantidade a produzir'); return false; }
      if (!f.unidade.trim()) { setErro('Informe a unidade'); return false; }
      const perda = f.maquinas.length && prevista.rendimento_pct < 100 ? `, ${fmtQtd(prevista.quantidade)} ${f.unidade} previstas pelo rendimento de ${fmtQtd(prevista.rendimento_pct, 2)} %` : '';
      const ok = await confirmar({
        titulo: `Salvar a produção e ir para a etapa 4?`,
        mensagem: `A etapa 3 será salva com ${fmtQtd(producao)} ${f.unidade.trim()} planejadas${perda}, custo da produção de ${fmtBRL(custoGlobal)} e custo global acumulado de ${fmtBRL(custoAcumulado)}. Depois o pedido vai para a etapa 4, ${ETAPAS[3]?.nome || 'Custos'}. Você pode voltar e alterar quando quiser.`,
        confirmarTexto: `Salvar e ir para ${ETAPAS[3]?.nome || 'a etapa 4'}`, cancelarTexto: 'Continuar na etapa 3',
      });
      if (!ok) return false;
      return alterado || naoSalva ? salvar() : true;
    } : null;
    return () => { antesDeAvancar.current = null; };
  });

  return (
    <>
      <Divisoria numero={1} titulo="Formulação e quantidade" primeiro />
      {!ativa ? <div className="alerta alerta-aviso">O pedido não tem formulação ativa: volte à etapa 1 e adicione uma.</div> : (
        <div className="alerta alerta-info">
          <strong>{ativa.nome}</strong> · {ativa.aprovada_em ? `aprovada pelo cliente em ${fmtData(ativa.aprovada_em)}` : 'ainda sem a aprovação do cliente'}
        </div>
      )}
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Quantidade a produzir *" largura={220}>
          <input type="number" step="any" min="0" value={f.quantidade} onChange={(e) => mudar('quantidade', e.target.value)} readOnly={!podeEditar} autoFocus={podeEditar} />
        </Campo>
        <Campo rotulo="Unidade *" largura={170} dica="un, kg, g, L, mL ou outra">
          <input list="unidades-producao" value={f.unidade} onChange={(e) => mudar('unidade', e.target.value)} readOnly={!podeEditar} />
          <datalist id="unidades-producao">{UNIDADES_PRODUCAO.map((u) => <option key={u} value={u} />)}</datalist>
        </Campo>
      </div>

      <Divisoria numero={2} titulo="Matérias-primas necessárias" />
      {!ingredientes.length ? (
        <div className="alerta alerta-aviso">A formulação ainda não tem ingredientes: a farmácia precisa completar a fórmula em Cadastros › Formulações para a lista aparecer.</div>
      ) : (
        <>
          <div className="alerta alerta-info">As quantidades da fórmula valem para <strong>1 unidade</strong> produzida. O necessário é a quantidade da fórmula vezes a quantidade a produzir, e o custo usa o valor de compra do cadastro da matéria-prima.</div>
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead><tr><th>Matéria-prima</th><th className="num">Na fórmula (por 1 unidade)</th><th className="num">Necessário{producao ? ` para ${fmtQtd(producao)} ${f.unidade}` : ''}</th><th className="num">Valor de compra</th><th className="num">Custo</th></tr></thead>
              <tbody>
                {linhasMp.map((i) => (
                  <tr key={i.materia_prima_id}>
                    <td className="negrito">{i.materia_prima}</td>
                    <td className="num">{fmtQtd(i.quantidade, 4)} {i.unidade}</td>
                    <td className="num negrito">{i.n ? `${fmtQtd(i.n.quantidade)} ${i.n.unidade}` : <span className="texto-suave">informe a quantidade</span>}</td>
                    <td className="num">{i.valor_compra != null ? `${fmtBRL(i.valor_compra)}/${i.unidade_compra}` : <Badge cor="amarelo">sem preço</Badge>}</td>
                    <td className="num negrito">{i.custo != null ? fmtBRL(i.custo) : <span className="texto-suave" title={i.aviso || ''}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {semCusto > 0 && <div className="alerta alerta-aviso">{semCusto} matéria(s)-prima(s) sem custo: {linhasMp.filter((l) => l.custo == null).map((l) => `${l.materia_prima} (${l.aviso})`).join('; ')}. Preencha o valor de compra em Cadastros › Matérias-primas.</div>}
        </>
      )}

      <Divisoria numero={3} titulo="Maquinário" />
      <div className="alerta alerta-info">Máquinas de {p.empresa_nome} que serão usadas, com as horas de produção. O rendimento e o custo por hora vêm do cadastro; o rendimento pode ser ajustado só para este pedido.</div>
      {!f.maquinas.length ? <Vazio msg="Nenhuma máquina no pedido" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Máquina</th><th className="num">Rendimento (%)</th><th className="num">Horas</th><th className="num">Custo/hora</th><th className="num">Custo</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {f.maquinas.map((m, i) => (
                <tr key={m.maquina_id}>
                  <td className="negrito">{m.titulo}{m.modelo ? <span className="texto-suave"> · {m.modelo}</span> : ''}</td>
                  <td className="num">
                    {podeEditar
                      ? <input type="number" step="0.01" min="0.01" max="100" value={m.rendimento_pct} onChange={(e) => mudarMaquina(i, 'rendimento_pct', e.target.value)} style={{ width: 100, textAlign: 'right' }} />
                      : `${fmtQtd(m.rendimento_pct, 2)} %`}
                    {Number(m.rendimento_pct) !== Number(m.rendimento_padrao) && <> <Badge cor="amarelo">ajustado</Badge></>}
                  </td>
                  <td className="num">
                    {podeEditar
                      ? <input type="number" step="0.25" min="0" value={m.horas} onChange={(e) => mudarMaquina(i, 'horas', e.target.value)} style={{ width: 90, textAlign: 'right' }} placeholder="0" />
                      : m.horas !== '' && m.horas != null ? `${fmtQtd(m.horas, 2)} h` : '—'}
                  </td>
                  <td className="num">{fmtBRL(m.custo_hora)}</td>
                  <td className="num negrito">{fmtBRL(custoMaquina(m))}</td>
                  {podeEditar && <td className="acoes"><button type="button" className="botao botao-perigo botao-mini" onClick={() => removerMaquina(i)}>Remover</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <Campo rotulo="Adicionar máquina" dica={disponiveis.length ? undefined : 'Todas as máquinas ativas desta empresa já estão no pedido, ou não há máquinas cadastradas'}>
            <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} disabled={!disponiveis.length}>
              <option value="">Escolha…</option>
              {disponiveis.map((m) => <option key={m.id} value={m.id}>{m.titulo}{m.modelo ? ` · ${m.modelo}` : ''} — rendimento {fmtQtd(m.rendimento_pct, 2)} % · {fmtBRL(m.custo_hora)}/h</option>)}
            </select>
          </Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} disabled={!escolhida} onClick={adicionarMaquina}>+ Adicionar</button>
        </div>
      )}

      <Divisoria numero={4} titulo="Utilitários" />
      <div className="alerta alerta-info">Energia, água, gás e outros utilitários de {p.empresa_nome} consumidos na produção. O valor unitário vem do cadastro e fica gravado no pedido; informe a quantidade consumida.</div>
      {!f.utilitarios.length ? <Vazio msg="Nenhum utilitário no pedido" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Utilitário</th><th className="num">Quantidade</th><th className="num">Valor unitário</th><th className="num">Custo</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {f.utilitarios.map((u, i) => (
                <tr key={u.utilitario_id}>
                  <td className="negrito">{u.nome}{u.descricao ? <span className="texto-suave"> · {u.descricao}</span> : ''}</td>
                  <td className="num">
                    {podeEditar
                      ? <input type="number" step="any" min="0" value={u.quantidade} onChange={(e) => mudarUtilitario(i, e.target.value)} style={{ width: 110, textAlign: 'right' }} placeholder="0" />
                      : u.quantidade !== '' && u.quantidade != null ? fmtQtd(u.quantidade) : '—'}
                  </td>
                  <td className="num">{fmtBRL(u.valor)}</td>
                  <td className="num negrito">{fmtBRL(custoUtilitario(u))}</td>
                  {podeEditar && <td className="acoes"><button type="button" className="botao botao-perigo botao-mini" onClick={() => removerUtilitario(i)}>Remover</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <Campo rotulo="Adicionar utilitário" dica={disponiveisUt.length ? undefined : 'Todos os utilitários ativos desta empresa já estão no pedido, ou não há utilitários cadastrados'}>
            <select value={escolhidoUt} onChange={(e) => setEscolhidoUt(e.target.value)} disabled={!disponiveisUt.length}>
              <option value="">Escolha…</option>
              {disponiveisUt.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.descricao ? ` · ${u.descricao}` : ''} — {fmtBRL(u.valor)}</option>)}
            </select>
          </Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} disabled={!escolhidoUt} onClick={adicionarUtilitario}>+ Adicionar</button>
        </div>
      )}
      {podeEditar && <button className="botao botao-secundario" style={{ marginTop: 6 }} disabled={salvando || !alterado} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar produção'}</button>}

      {/* Resumão da produção: o que vai ser produzido depois do rendimento das máquinas */}
      <div style={{ marginTop: 24, padding: '14px 16px 4px', borderRadius: 12, background: 'var(--azul-100)', border: '1px solid #b9d0f0' }}>
        <div className="texto-suave negrito" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4, marginBottom: 10 }}>Resumo da produção</div>
        <div className="grade-kpis">
          <div className="kpi"><div className="kpi-rotulo">Formulação</div><div className="kpi-valor" style={{ fontSize: 17 }}>{ativa?.nome || '—'}</div><div className="kpi-extra">{ingredientes.length ? `${ingredientes.length} matéria(s)-prima(s)` : 'sem ingredientes cadastrados'}</div></div>
          <div className="kpi"><div className="kpi-rotulo">Quantidade planejada</div><div className="kpi-valor">{producao ? `${fmtQtd(producao)} ${f.unidade}` : '—'}</div><div className="kpi-extra">base da matéria-prima necessária</div></div>
          <div className="kpi"><div className="kpi-rotulo">Rendimento das máquinas</div><div className="kpi-valor">{f.maquinas.length ? `${fmtQtd(prevista.rendimento_pct, 2)} %` : '—'}</div><div className="kpi-extra">{f.maquinas.length > 1 ? f.maquinas.map((m) => `${fmtQtd(m.rendimento_pct, 2)} %`).join(' × ') : f.maquinas.length === 1 ? f.maquinas[0].titulo : 'nenhuma máquina no pedido'}</div></div>
          <div className="kpi" style={producao && prevista.rendimento_pct < 100 ? { background: '#fdf2d9', border: '1px solid #e9c46a' } : undefined}><div className="kpi-rotulo">Produção prevista</div><div className="kpi-valor">{producao ? `${fmtQtd(prevista.quantidade)} ${f.unidade}` : '—'}</div><div className="kpi-extra">{producao && prevista.rendimento_pct < 100 ? `${fmtQtd(producao - prevista.quantidade)} ${f.unidade} a menos pelo rendimento` : 'sem perda pelo rendimento'}</div></div>
        </div>
      </div>

      {/* Custo global até aqui: o envase (etapa 2) mais a produção desta etapa, em R$ */}
      <div style={{ marginTop: 14, padding: '14px 16px 4px', borderRadius: 12, background: '#eef9ef', border: '1px solid #b7e0bb' }}>
        <div className="texto-suave negrito" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4, marginBottom: 10 }}>Custo global até aqui</div>
        <div className="grade-kpis">
          <div className="kpi"><div className="kpi-rotulo">Envase</div><div className="kpi-valor">{fmtBRL(custoEnvase)}</div><div className="kpi-extra">etapa 2</div></div>
          <div className="kpi"><div className="kpi-rotulo">Matérias-primas</div><div className="kpi-valor">{producao ? fmtBRL(custoMp) : '—'}</div><div className="kpi-extra">{semCusto ? `${semCusto} sem custo: preencha o valor de compra` : 'necessário × valor de compra'}</div></div>
          <div className="kpi"><div className="kpi-rotulo">Máquinas</div><div className="kpi-valor">{fmtBRL(custoMaq)}</div><div className="kpi-extra">{f.maquinas.length ? `${fmtQtd(horasTotal, 2)} h × custo-hora` : 'nenhuma máquina no pedido'}</div></div>
          <div className="kpi"><div className="kpi-rotulo">Utilitários</div><div className="kpi-valor">{fmtBRL(custoUt)}</div><div className="kpi-extra">{f.utilitarios.length ? `${f.utilitarios.length} utilitário(s) × valor` : 'nenhum utilitário no pedido'}</div></div>
          <div className="kpi" style={{ background: '#fff', border: '2px solid #2f9e44' }}><div className="kpi-rotulo">Custo global acumulado</div><div className="kpi-valor">{fmtBRL(custoAcumulado)}</div><div className="kpi-extra">envase + produção, sem impostos</div></div>
          <div className="kpi"><div className="kpi-rotulo">Por unidade</div><div className="kpi-valor">{producao ? fmtBRL(custoAcumulado / producao) : '—'}</div><div className="kpi-extra">{producao && prevista.quantidade > 0 && prevista.rendimento_pct < 100 ? `${fmtBRL(custoAcumulado / prevista.quantidade)} por unidade prevista` : producao ? 'planejada = prevista' : 'informe a quantidade'}</div></div>
        </div>
      </div>
    </>
  );
}

// Custos avulsos: linhas em R$ com descrição. Os demais tipos aparecem só em lançamentos antigos
// (envase tem etapa própria; produção vem da etapa 3; mão de obra e logística têm bloco próprio)
const TIPOS_CUSTO = [
  { valor: 'outro', rotulo: 'Custos avulsos', adicionavel: true },
  { valor: 'envase', rotulo: 'Envase (lançamento antigo)' },
  { valor: 'veiculo', rotulo: 'Logística (lançamento antigo)' },
  { valor: 'materia_prima', rotulo: 'Matérias-primas (lançamento antigo)' },
  { valor: 'maquina', rotulo: 'Máquinas (lançamento antigo)' },
  { valor: 'mao_de_obra', rotulo: 'Mão de obra por pessoa (lançamento antigo)' },
];
const tipoDe = (v) => TIPOS_CUSTO.find((t) => t.valor === v) || { valor: v, rotulo: v };
const linhaDe = (c, k) => ({ k, tipo: c.tipo, referencia_id: c.referencia_id || '', descricao: c.descricao, quantidade: c.quantidade, unidade: c.unidade, valor_unitario: c.valor_unitario });
const assinaturaCustos = (ls) => JSON.stringify(ls.map((l) => [l.tipo, l.referencia_id || '', l.descricao, Number(l.quantidade) || 0, l.unidade, Number(l.valor_unitario) || 0]));
const assinaturaMo = (ls) => JSON.stringify(ls.filter((m) => Number(m.valor) > 0).map((m) => [m.categoria, Number(m.valor)]).sort());
const assinaturaIm = (ls) => JSON.stringify(ls.map((t) => [t.imposto_id, Number(t.percentual) || 0]));
const assinaturaLog = (ls) => JSON.stringify(ls.map((v) => [v.veiculo_id, Number(v.horas) || 0]));
const assinaturaDep = (ls) => JSON.stringify(ls.map((d) => [String(d.nome).trim(), Number(d.valor) || 0]));
const assinaturaEnv = (ls) => JSON.stringify(ls.map((e) => [e.envase_id, Number(e.quantidade) || 0, String(e.unidade || '').trim(), Number(e.valor_unitario) || 0]));
const totalLinha = (l) => Math.round((Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0) * 100) / 100;
const custoVeiculo = (v) => Math.round((Number(v.horas) || 0) * (Number(v.custo_hora) || 0) * 100) / 100;
const nomeVeiculo = (x) => [x.tipo, x.marca, x.modelo, x.placa].filter(Boolean).join(' ');
const somar = (xs) => Math.round(xs.reduce((s, x) => s + (Number(x) || 0), 0) * 100) / 100;

// Áreas da mão de obra: as dos funcionários ativos da empresa do pedido, mais as já gravadas nele
function categoriasDoPedido(p) {
  const salvas = new Map((p.mao_de_obra || []).map((m) => [m.categoria, m]));
  const lista = (p.categorias_mao_de_obra || []).map((c) => ({ categoria: c.categoria, funcionarios: Number(c.funcionarios), valor: salvas.get(c.categoria)?.valor ?? '' }));
  for (const m of p.mao_de_obra || []) if (!lista.some((c) => c.categoria === m.categoria)) lista.push({ categoria: m.categoria, funcionarios: 0, valor: m.valor });
  return lista;
}

// Cartão de destaque no topo das etapas de custo, logo abaixo do stepper
function BannerCusto({ esquerda, centro, direita }) {
  const Bloco = ({ b, alinhar }) => (
    <div style={{ textAlign: alinhar }}>
      <div className="texto-suave negrito" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4 }}>{b.rotulo}</div>
      <div style={{ fontSize: b.grande ? 26 : 22, fontWeight: 700, lineHeight: 1.2 }}>{b.valor}</div>
      {b.extra && <div className="texto-suave" style={{ fontSize: 12.5 }}>{b.extra}</div>}
    </div>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24, padding: '12px 18px', borderRadius: 12, background: '#eef9ef', border: '2px solid #2f9e44', marginBottom: 4 }}>
      <Bloco b={esquerda} />
      {centro && <div className="texto-suave" style={{ fontSize: 13 }}>{centro}</div>}
      <div style={{ marginLeft: 'auto' }}><Bloco b={direita} alinhar="right" /></div>
    </div>
  );
}

// Cards de resumo no fim das etapas de custo
function Resumo({ titulo, cards }) {
  return (
    <div style={{ marginTop: 24, padding: '14px 16px 4px', borderRadius: 12, background: 'var(--azul-100)', border: '1px solid #b9d0f0' }}>
      <div className="texto-suave negrito" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4, marginBottom: 10 }}>{titulo}</div>
      <div className="grade-kpis">
        {cards.map((c) => (
          <div key={c.rotulo} className="kpi" style={c.destaque ? { background: '#fff', border: '2px solid #2f9e44' } : c.alerta ? { background: '#fdf2d9', border: '1px solid #e9c46a' } : undefined}>
            <div className="kpi-rotulo">{c.rotulo}</div><div className="kpi-valor">{c.valor}</div>{c.extra && <div className="kpi-extra">{c.extra}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Etapa 4, Custos: valores fixos em R$ que somam no custo global, depois do envase (etapa 2) e
// da produção (etapa 3): mão de obra por área, logística por horas de cada veículo, depreciação
// (nome e valor) e custos avulsos. Os impostos ficam na etapa 5
function EtapaCustos({ p, podeEditar, recarregar, antesDeAvancar }) {
  const cpd = p.custo_pedido || {};
  const ateEtapa3 = somar([cpd.envase, cpd.producao]);
  const planejada = Number(p.quantidade_producao) || 0;
  const prevista = Number(p.producao_prevista) || 0;
  const [maoDeObra, setMaoDeObra] = React.useState(() => categoriasDoPedido(p));
  const [logistica, setLogistica] = React.useState(() => (p.logistica || []).map((v) => ({ veiculo_id: v.veiculo_id, nome: v.nome, horas: v.horas ?? '', custo_hora: v.custo_hora })));
  const [depreciacoes, setDepreciacoes] = React.useState(() => (p.depreciacoes || []).map((d, i) => ({ k: i + 1, nome: d.nome, valor: d.valor })));
  const [linhas, setLinhas] = React.useState((p.custos || []).map((c, i) => linhaDe(c, i + 1)));
  const proximaChave = React.useRef((p.custos || []).length + (p.depreciacoes || []).length + 1);
  const { dados: veiculos } = useDados(() => api(`/veiculos?empresa=${p.empresa_id}`).catch(() => []), [p.empresa_id]);
  const [novoAvulso, setNovoAvulso] = React.useState('');
  const [veiculoEscolhido, setVeiculoEscolhido] = React.useState('');
  const [novaDep, setNovaDep] = React.useState({ nome: '', valor: '' });
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);

  function adicionarAvulso() {
    setErro(null);
    if (!novoAvulso.trim()) return setErro('Descreva o custo avulso');
    setLinhas((ls) => [...ls, { k: proximaChave.current++, tipo: 'outro', referencia_id: '', descricao: novoAvulso.trim(), quantidade: 1, unidade: 'un', valor_unitario: '' }]);
    setNovoAvulso('');
  }
  function adicionarVeiculo() {
    const v = (veiculos || []).find((x) => x.id === veiculoEscolhido);
    if (!v) return;
    // O custo-hora vem do cadastro do veículo; as horas, quem lança informa
    setLogistica((ls) => [...ls, { veiculo_id: v.id, nome: nomeVeiculo(v), horas: '', custo_hora: v.custo_hora }]);
    setVeiculoEscolhido('');
  }
  function adicionarDepreciacao() {
    setErro(null);
    if (novaDep.nome.trim().length < 2) return setErro('Depreciação: informe o nome');
    if (novaDep.valor === '' || !(Number(novaDep.valor) >= 0)) return setErro('Depreciação: informe o valor');
    setDepreciacoes((ds) => [...ds, { k: proximaChave.current++, nome: novaDep.nome.trim(), valor: novaDep.valor }]);
    setNovaDep({ nome: '', valor: '' });
  }
  const mudarLinha = (k, campo, valor) => setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, [campo]: valor } : l)));
  const removerLinha = (k) => setLinhas((ls) => ls.filter((l) => l.k !== k));
  const mudarMaoDeObra = (i, valor) => setMaoDeObra((ls) => ls.map((m, j) => (j === i ? { ...m, valor } : m)));
  const mudarVeiculo = (i, valor) => setLogistica((ls) => ls.map((v, j) => (j === i ? { ...v, horas: valor } : v)));
  const removerVeiculo = (i) => setLogistica((ls) => ls.filter((_, j) => j !== i));
  const mudarDepreciacao = (k, campo, valor) => setDepreciacoes((ds) => ds.map((d) => (d.k === k ? { ...d, [campo]: valor } : d)));
  const removerDepreciacao = (k) => setDepreciacoes((ds) => ds.filter((d) => d.k !== k));

  const alterado = assinaturaCustos(linhas) !== assinaturaCustos((p.custos || []).map((c, i) => linhaDe(c, i)))
    || assinaturaMo(maoDeObra) !== assinaturaMo(p.mao_de_obra || []) || assinaturaLog(logistica) !== assinaturaLog(p.logistica || [])
    || assinaturaDep(depreciacoes) !== assinaturaDep(p.depreciacoes || []);
  const custoMo = somar(maoDeObra.map((m) => m.valor));
  const custoLog = somar(logistica.map(custoVeiculo));
  const custoDep = somar(depreciacoes.map((d) => d.valor));
  const avulsos = somar(linhas.map(totalLinha));
  const tot = custoTotalPedido({ envase: cpd.envase, producao: cpd.producao, mao_de_obra: custoMo, logistica: custoLog, depreciacao: custoDep, outros: avulsos }, []);
  const impostosSalvos = Number(cpd.impostos) || 0;
  const disponiveis = (veiculos || []).filter((v) => v.ativo && !logistica.some((x) => x.veiculo_id === v.id));

  async function salvar() {
    setErro(null);
    const moRuim = maoDeObra.find((m) => m.valor !== '' && !(Number(m.valor) >= 0));
    if (moRuim) { setErro(`Mão de obra ${moRuim.categoria}: informe um valor em R$`); return false; }
    const logRuim = logistica.find((v) => v.horas !== '' && !(Number(v.horas) >= 0));
    if (logRuim) { setErro(`Horas de ${logRuim.nome}: informe um número`); return false; }
    const depRuim = depreciacoes.find((d) => String(d.nome).trim().length < 2 || d.valor === '' || !(Number(d.valor) >= 0));
    if (depRuim) { setErro('Depreciação: confira nome e valor de cada item'); return false; }
    const invalida = linhas.find((l) => !(Number(l.quantidade) >= 0) || !(Number(l.valor_unitario) >= 0) || (l.tipo === 'outro' && !String(l.descricao).trim()));
    if (invalida) { setErro('Custos avulsos: confira quantidade, valor unitário e descrição das linhas'); return false; }
    setSalvando(true);
    try {
      await api(`/pedidos/${p.id}/custos`, { method: 'PUT', body: {
        mao_de_obra: maoDeObra.filter((m) => Number(m.valor) > 0).map((m) => ({ categoria: m.categoria, valor: Number(m.valor) })),
        logistica: logistica.map((v) => ({ veiculo_id: v.veiculo_id, horas: v.horas === '' ? undefined : Number(v.horas) })),
        depreciacoes: depreciacoes.map((d) => ({ nome: String(d.nome).trim(), valor: Number(d.valor) })),
        itens: linhas.map((l) => ({
          tipo: l.tipo, referencia_id: l.referencia_id || undefined, descricao: l.tipo === 'outro' ? String(l.descricao).trim() : undefined,
          quantidade: Number(l.quantidade) || 0, unidade: l.unidade || undefined, valor_unitario: Number(l.valor_unitario) || 0,
        })),
      } });
      recarregar();
      toast.sucesso('Custos salvos');
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // Sair da etapa (próxima, anterior ou stepper) salva antes, se algo mudou
  React.useEffect(() => {
    antesDeAvancar.current = podeEditar ? async () => (alterado ? salvar() : true) : null;
    return () => { antesDeAvancar.current = null; };
  });

  const grupos = TIPOS_CUSTO.map((t) => ({ t, itens: linhas.filter((l) => l.tipo === t.valor) })).filter((g) => g.itens.length);

  return (
    <>
      <BannerCusto
        esquerda={{ rotulo: 'Custo global até a etapa 3', valor: fmtBRL(ateEtapa3), grande: true, extra: `envase ${fmtBRL(cpd.envase || 0)} · produção ${fmtBRL(cpd.producao || 0)}` }}
        centro={planejada ? `${fmtQtd(planejada)} ${p.unidade_producao} planejadas` : 'sem quantidade na etapa 3'}
        direita={{ rotulo: 'Custo global sem impostos', valor: fmtBRL(tot.subtotal), extra: alterado ? 'com as alterações ainda não salvas' : impostosSalvos ? `+ ${fmtBRL(impostosSalvos)} de impostos na etapa 5` : 'impostos na etapa 5' }}
      />
      {!podeEditar && <div className="alerta alerta-info">Só dono, administrativo e financeiro editam os custos.</div>}
      <Erro msg={erro} />

      <Divisoria numero={1} titulo="Mão de obra por área" primeiro />
      <div className="alerta alerta-info">Áreas da mão de obra de <strong>{p.empresa_nome}</strong>, a empresa que criou o pedido, conforme a aba Mão de obra. Informe o valor em R$ de cada uma.</div>
      {!maoDeObra.length ? <div className="alerta alerta-aviso">Nenhum funcionário ativo em {p.empresa_nome}: as áreas vêm do cadastro de Mão de obra.</div> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Área</th><th className="num">Funcionários</th><th className="num">Valor (R$)</th></tr></thead>
            <tbody>
              {maoDeObra.map((m, i) => (
                <tr key={m.categoria}>
                  <td className="negrito">{m.categoria}</td>
                  <td className="num">{m.funcionarios || <span className="texto-suave">nenhum ativo</span>}</td>
                  <td className="num">{podeEditar
                    ? <input type="number" step="0.01" min="0" value={m.valor} onChange={(e) => mudarMaoDeObra(i, e.target.value)} style={{ width: 140, textAlign: 'right' }} placeholder="0,00" />
                    : fmtBRL(Number(m.valor) || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Divisoria numero={2} titulo="Logística" />
      <div className="alerta alerta-info">Veículos de {p.empresa_nome} usados no pedido, com as horas de uso. O custo por hora vem do cadastro de Logística.</div>
      {!logistica.length ? <Vazio msg="Nenhum veículo no pedido" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Veículo</th><th className="num">Horas</th><th className="num">Custo/hora</th><th className="num">Custo</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {logistica.map((v, i) => (
                <tr key={v.veiculo_id}>
                  <td className="negrito">{v.nome}</td>
                  <td className="num">{podeEditar
                    ? <input type="number" step="0.25" min="0" value={v.horas} onChange={(e) => mudarVeiculo(i, e.target.value)} style={{ width: 90, textAlign: 'right' }} placeholder="0" />
                    : v.horas !== '' && v.horas != null ? `${fmtQtd(v.horas, 2)} h` : '—'}</td>
                  <td className="num">{fmtBRL(v.custo_hora)}</td>
                  <td className="num negrito">{fmtBRL(custoVeiculo(v))}</td>
                  {podeEditar && <td className="acoes"><button type="button" className="botao botao-perigo botao-mini" onClick={() => removerVeiculo(i)}>Remover</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <Campo rotulo="Adicionar veículo" dica={disponiveis.length ? undefined : 'Todos os veículos ativos desta empresa já estão no pedido, ou não há veículos cadastrados'}>
            <select value={veiculoEscolhido} onChange={(e) => setVeiculoEscolhido(e.target.value)} disabled={!disponiveis.length}>
              <option value="">Escolha…</option>
              {disponiveis.map((v) => <option key={v.id} value={v.id}>{nomeVeiculo(v)} — {fmtBRL(v.custo_hora)}/h</option>)}
            </select>
          </Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} disabled={!veiculoEscolhido} onClick={adicionarVeiculo}>+ Adicionar</button>
        </div>
      )}

      <Divisoria numero={3} titulo="Depreciação" />
      <div className="alerta alerta-info">Item à parte do pedido, sem cadastro: dê um nome e o valor em R$.</div>
      {!depreciacoes.length ? <Vazio msg="Nenhuma depreciação lançada" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Nome</th><th className="num">Valor (R$)</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {depreciacoes.map((d) => (
                <tr key={d.k}>
                  <td>{podeEditar ? <input value={d.nome} onChange={(e) => mudarDepreciacao(d.k, 'nome', e.target.value)} /> : <span className="negrito">{d.nome}</span>}</td>
                  <td className="num">{podeEditar
                    ? <input type="number" step="0.01" min="0" value={d.valor} onChange={(e) => mudarDepreciacao(d.k, 'valor', e.target.value)} style={{ width: 140, textAlign: 'right' }} />
                    : fmtBRL(d.valor)}</td>
                  {podeEditar && <td className="acoes"><button type="button" className="botao botao-perigo botao-mini" onClick={() => removerDepreciacao(d.k)}>Remover</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <Campo rotulo="Nome"><input value={novaDep.nome} onChange={(e) => setNovaDep((n) => ({ ...n, nome: e.target.value }))} placeholder="ex.: depreciação da linha de envase" /></Campo>
          <Campo rotulo="Valor (R$)" largura={160}><input type="number" step="0.01" min="0" value={novaDep.valor} onChange={(e) => setNovaDep((n) => ({ ...n, valor: e.target.value }))} /></Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} onClick={adicionarDepreciacao}>+ Adicionar</button>
        </div>
      )}

      <Divisoria numero={4} titulo="Custos avulsos" />
      <div className="alerta alerta-info">Outros custos do pedido em R$, com descrição, quantidade e valor unitário.</div>
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end' }}>
          <Campo rotulo="Descrição"><input value={novoAvulso} onChange={(e) => setNovoAvulso(e.target.value)} placeholder="ex.: análise de laboratório, frete" /></Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} onClick={adicionarAvulso}>+ Adicionar</button>
        </div>
      )}
      {!linhas.length ? <Vazio msg="Nenhum custo avulso lançado" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Item</th><th className="num">Quantidade</th><th>Unidade</th><th className="num">Valor unitário (R$)</th><th className="num">Total</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {grupos.map(({ t, itens }) => (
                <React.Fragment key={t.valor}>
                  <tr style={{ background: '#f4f6fa' }}><td colSpan={4} className="negrito">{t.rotulo}</td><td className="num negrito">{fmtBRL(somar(itens.map(totalLinha)))}</td>{podeEditar && <td />}</tr>
                  {itens.map((l) => (
                    <tr key={l.k}>
                      <td>{podeEditar && l.tipo === 'outro' ? <input value={l.descricao} onChange={(e) => mudarLinha(l.k, 'descricao', e.target.value)} /> : l.descricao}</td>
                      <td className="num">{podeEditar ? <input type="number" step="any" min="0" value={l.quantidade} onChange={(e) => mudarLinha(l.k, 'quantidade', e.target.value)} style={{ width: 110, textAlign: 'right' }} /> : fmtQtd(l.quantidade)}</td>
                      <td>{podeEditar ? <input value={l.unidade} onChange={(e) => mudarLinha(l.k, 'unidade', e.target.value)} style={{ width: 70 }} /> : l.unidade}</td>
                      <td className="num">{podeEditar ? <input type="number" step="0.0001" min="0" value={l.valor_unitario} onChange={(e) => mudarLinha(l.k, 'valor_unitario', e.target.value)} style={{ width: 120, textAlign: 'right' }} /> : fmtBRL(l.valor_unitario)}</td>
                      <td className="num negrito">{fmtBRL(totalLinha(l))}</td>
                      {podeEditar && <td className="acoes"><button type="button" className="botao botao-perigo botao-mini" onClick={() => removerLinha(l.k)}>Remover</button></td>}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && <button className="botao botao-secundario" style={{ marginTop: 8 }} disabled={salvando || !alterado} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar custos'}</button>}

      <Resumo titulo="Resumo dos custos" cards={[
        { rotulo: 'Até a etapa 3', valor: fmtBRL(ateEtapa3), extra: 'envase + produção' },
        { rotulo: 'Mão de obra', valor: fmtBRL(custoMo), extra: `${maoDeObra.filter((m) => Number(m.valor) > 0).length} área(s)` },
        { rotulo: 'Logística', valor: fmtBRL(custoLog), extra: logistica.length ? `${fmtQtd(somar(logistica.map((v) => v.horas)), 2)} h × custo-hora` : 'nenhum veículo' },
        { rotulo: 'Depreciação', valor: fmtBRL(custoDep), extra: `${depreciacoes.length} item(ns)` },
        { rotulo: 'Custos avulsos', valor: fmtBRL(avulsos), extra: `${linhas.length} linha(s)` },
        { rotulo: 'Custo global sem impostos', valor: fmtBRL(tot.subtotal), extra: alterado ? 'ainda não salvo' : 'impostos na etapa 5', destaque: true },
        {
          rotulo: 'Por unidade, sem impostos', valor: planejada ? fmtBRL(tot.subtotal / planejada) : '—', alerta: prevista && prevista < planejada,
          extra: prevista && prevista < planejada ? `${fmtBRL(tot.subtotal / prevista)} por unidade prevista` : planejada ? `${fmtQtd(planejada)} ${p.unidade_producao} planejadas` : 'sem quantidade na etapa 3',
        },
      ]} />
    </>
  );
}

// Etapa 5, Impostos: a única etapa com percentual. Os impostos do cadastro incidem sobre o custo
// global sem impostos (etapas 2 a 4). O percentual vem do cadastro e pode ser ajustado só no pedido
function EtapaImpostos({ p, podeEditar, recarregar, antesDeAvancar }) {
  const cpd = p.custo_pedido || {};
  const semImpostos = Number(cpd.subtotal) || 0;
  const planejada = Number(p.quantidade_producao) || 0;
  const prevista = Number(p.producao_prevista) || 0;
  const [impostos, setImpostos] = React.useState(() => (p.impostos || []).map((t) => ({ imposto_id: t.imposto_id, nome: t.nome, percentual_cadastro: t.percentual_cadastro, percentual: t.percentual })));
  const [impostoEscolhido, setImpostoEscolhido] = React.useState('');
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);
  const ehFilial = p.empresa_id !== p.matriz_id;

  function adicionarImposto() {
    const t = (p.impostos_disponiveis || []).find((x) => x.id === impostoEscolhido);
    if (!t) return;
    // O percentual nasce do cadastro e pode ser ajustado só para este pedido
    setImpostos((ls) => [...ls, { imposto_id: t.id, nome: t.nome, percentual_cadastro: t.percentual, percentual: t.percentual }]);
    setImpostoEscolhido('');
  }
  const mudarImposto = (i, valor) => setImpostos((ls) => ls.map((t, j) => (j === i ? { ...t, percentual: valor } : t)));
  const removerImposto = (i) => setImpostos((ls) => ls.filter((_, j) => j !== i));
  const alterado = assinaturaIm(impostos) !== assinaturaIm(p.impostos || []);
  const tot = custoTotalPedido({ semImpostos }, impostos.map((t) => t.percentual));
  const disponiveis = (p.impostos_disponiveis || []).filter((t) => !impostos.some((x) => x.imposto_id === t.id));

  async function salvar() {
    setErro(null);
    const ruim = impostos.find((t) => !(Number(t.percentual) >= 0 && Number(t.percentual) <= 100));
    if (ruim) { setErro(`Imposto ${ruim.nome}: de 0 a 100 %`); return false; }
    setSalvando(true);
    try {
      await api(`/pedidos/${p.id}/custos`, { method: 'PUT', body: { impostos: impostos.map((t) => ({ imposto_id: t.imposto_id, percentual: Number(t.percentual) })) } });
      recarregar();
      toast.sucesso('Impostos salvos');
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // Sair da etapa (anterior ou stepper) salva antes, se algo mudou
  React.useEffect(() => {
    antesDeAvancar.current = podeEditar ? async () => (alterado ? salvar() : true) : null;
    return () => { antesDeAvancar.current = null; };
  });

  return (
    <>
      <BannerCusto
        esquerda={{ rotulo: 'Custo global sem impostos (etapas 2 a 4)', valor: fmtBRL(semImpostos), grande: true, extra: 'base dos impostos' }}
        centro={planejada ? `${fmtBRL(semImpostos / planejada)} por unidade, sem impostos` : null}
        direita={{ rotulo: 'Custo total do pedido com impostos', valor: fmtBRL(tot.total), extra: alterado ? 'com as alterações ainda não salvas' : `${fmtBRL(tot.impostos)} de impostos` }}
      />
      {!podeEditar && <div className="alerta alerta-info">Só dono, administrativo e financeiro editam os impostos do pedido.</div>}
      <Erro msg={erro} />

      <Divisoria numero={1} titulo="Impostos" primeiro />
      <div className="alerta alerta-info">Impostos de {p.empresa_nome}{ehFilial ? ' e da matriz' : ''}, do cadastro de Impostos. O percentual vem do cadastro, pode ser ajustado só para este pedido e incide sobre o custo global sem impostos ({fmtBRL(semImpostos)}).</div>
      {!impostos.length ? <Vazio msg="Nenhum imposto no pedido" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Imposto</th><th className="num">% do cadastro</th><th className="num">% neste pedido</th><th className="num">Valor</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {impostos.map((t, i) => (
                <tr key={t.imposto_id}>
                  <td className="negrito">{t.nome}</td>
                  <td className="num">{fmtQtd(t.percentual_cadastro, 4)} %</td>
                  <td className="num">
                    {podeEditar
                      ? <input type="number" step="0.01" min="0" max="100" value={t.percentual} onChange={(e) => mudarImposto(i, e.target.value)} style={{ width: 100, textAlign: 'right' }} />
                      : `${fmtQtd(t.percentual, 4)} %`}
                    {Number(t.percentual) !== Number(t.percentual_cadastro) && <> <Badge cor="amarelo">ajustado</Badge></>}
                  </td>
                  <td className="num negrito">{fmtBRL(tot.linhasImpostos[i])}</td>
                  {podeEditar && <td className="acoes"><button type="button" className="botao botao-perigo botao-mini" onClick={() => removerImposto(i)}>Remover</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <Campo rotulo="Adicionar imposto" dica={disponiveis.length ? undefined : (p.impostos_disponiveis || []).length ? 'Todos os impostos já estão no pedido' : 'Nenhum imposto cadastrado: cadastre em Cadastros › Impostos'}>
            <select value={impostoEscolhido} onChange={(e) => setImpostoEscolhido(e.target.value)} disabled={!disponiveis.length}>
              <option value="">Escolha…</option>
              {disponiveis.map((t) => <option key={t.id} value={t.id}>{t.nome} — {fmtQtd(t.percentual, 4)} %{t.origem === 'matriz' ? ' (da matriz)' : ''}</option>)}
            </select>
          </Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} disabled={!impostoEscolhido} onClick={adicionarImposto}>+ Adicionar</button>
        </div>
      )}
      {podeEditar && <button className="botao botao-secundario" style={{ marginTop: 6 }} disabled={salvando || !alterado} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar impostos'}</button>}

      <Resumo titulo="Resumo do pedido" cards={[
        { rotulo: 'Custo global sem impostos', valor: fmtBRL(semImpostos), extra: 'etapas 2 a 4' },
        { rotulo: 'Impostos', valor: fmtBRL(tot.impostos), extra: `${fmtQtd(tot.impostosPct, 4)} % do custo global` },
        { rotulo: 'Custo total do pedido', valor: fmtBRL(tot.total), extra: alterado ? 'ainda não salvo' : 'com impostos', destaque: true },
        {
          rotulo: 'Por unidade', valor: planejada ? fmtBRL(tot.total / planejada) : '—', alerta: prevista && prevista < planejada,
          extra: prevista && prevista < planejada ? `${fmtBRL(tot.total / prevista)} por unidade prevista` : planejada ? `${fmtQtd(planejada)} ${p.unidade_producao} planejadas` : 'sem quantidade na etapa 3',
        },
      ]} />
    </>
  );
}

// Etapa 2, Envase: itens do cadastro de Envase com quantidade e valor unitário em R$. O total
// soma no custo global, como a produção (etapa 3) e os custos (etapa 4)
function EtapaEnvase({ p, podeEditar, recarregar, antesDeAvancar }) {
  const cpd = p.custo_pedido || {};
  const planejada = Number(p.quantidade_producao) || 0;
  const { dados: envases } = useDados(() => api('/envases').catch(() => null), [p.id]);
  const [itens, setItens] = React.useState(() => (p.envase_itens || []).map((e, i) => ({ k: i + 1, envase_id: e.envase_id, descricao: e.descricao, quantidade: e.quantidade, unidade: e.unidade, valor_unitario: e.valor_unitario })));
  const proximaChave = React.useRef((p.envase_itens || []).length + 1);
  const [escolhido, setEscolhido] = React.useState('');
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);

  function adicionar() {
    const x = (envases || []).find((e) => e.id === escolhido);
    if (!x) return;
    // Quantidade sugerida: uma por unidade planejada, se a produção já foi definida
    setItens((ls) => [...ls, { k: proximaChave.current++, envase_id: x.id, descricao: x.nome, quantidade: planejada || 1, unidade: 'un', valor_unitario: '' }]);
    setEscolhido('');
  }
  const mudar = (k, campo, valor) => setItens((ls) => ls.map((e) => (e.k === k ? { ...e, [campo]: valor } : e)));
  const remover = (k) => setItens((ls) => ls.filter((e) => e.k !== k));
  const alterado = assinaturaEnv(itens) !== assinaturaEnv(p.envase_itens || []);
  const custoEnvase = somar(itens.map(totalLinha));
  // Custo global: o que já existe nas etapas 3 e 4 mais o envase desta tela
  const custoGlobal = somar([Number(cpd.subtotal) - Number(cpd.envase || 0), custoEnvase]);
  const disponiveis = (envases || []).filter((e) => e.ativo !== 0 && !itens.some((x) => x.envase_id === e.id));

  async function salvar() {
    setErro(null);
    const ruim = itens.find((e) => e.quantidade === '' || !(Number(e.quantidade) >= 0) || e.valor_unitario === '' || !(Number(e.valor_unitario) >= 0));
    if (ruim) { setErro(`Envase ${ruim.descricao}: informe quantidade e valor unitário`); return false; }
    setSalvando(true);
    try {
      await api(`/pedidos/${p.id}/envase`, { method: 'PUT', body: { itens: itens.map((e) => ({ envase_id: e.envase_id, quantidade: Number(e.quantidade), unidade: String(e.unidade || '').trim() || undefined, valor_unitario: Number(e.valor_unitario) })) } });
      recarregar();
      toast.sucesso('Envase salvo');
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // Sair da etapa (próxima, anterior ou stepper) salva antes, se algo mudou
  React.useEffect(() => {
    antesDeAvancar.current = podeEditar ? async () => (alterado ? salvar() : true) : null;
    return () => { antesDeAvancar.current = null; };
  });

  return (
    <>
      <BannerCusto
        esquerda={{ rotulo: 'Custo do envase', valor: fmtBRL(custoEnvase), grande: true, extra: `${itens.length} item(ns) de envase` }}
        centro="soma no custo global, como a produção e os custos das etapas 3 e 4"
        direita={{ rotulo: 'Custo global acumulado', valor: fmtBRL(custoGlobal), extra: alterado ? 'com as alterações ainda não salvas' : 'sem impostos' }}
      />
      {!podeEditar && <div className="alerta alerta-info">Só dono, administrativo e financeiro editam o envase do pedido.</div>}
      <Erro msg={erro} />

      <Divisoria numero={1} titulo="Itens de envase" primeiro />
      <div className="alerta alerta-info">Frascos, tampas, rótulos e caixas do cadastro de Envase, com a quantidade e o valor unitário em R$. Nome e valor ficam gravados no pedido.</div>
      {!itens.length ? <Vazio msg="Nenhum item de envase no pedido" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Item</th><th className="num">Quantidade</th><th>Unidade</th><th className="num">Valor unitário (R$)</th><th className="num">Total</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {itens.map((e) => (
                <tr key={e.k}>
                  <td className="negrito">{e.descricao}</td>
                  <td className="num">{podeEditar ? <input type="number" step="any" min="0" value={e.quantidade} onChange={(ev) => mudar(e.k, 'quantidade', ev.target.value)} style={{ width: 110, textAlign: 'right' }} /> : fmtQtd(e.quantidade)}</td>
                  <td>{podeEditar ? <input value={e.unidade} onChange={(ev) => mudar(e.k, 'unidade', ev.target.value)} style={{ width: 70 }} /> : e.unidade}</td>
                  <td className="num">{podeEditar ? <input type="number" step="0.0001" min="0" value={e.valor_unitario} onChange={(ev) => mudar(e.k, 'valor_unitario', ev.target.value)} style={{ width: 120, textAlign: 'right' }} placeholder="0,00" /> : fmtBRL(e.valor_unitario)}</td>
                  <td className="num negrito">{fmtBRL(totalLinha(e))}</td>
                  {podeEditar && <td className="acoes"><button type="button" className="botao botao-perigo botao-mini" onClick={() => remover(e.k)}>Remover</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <Campo rotulo="Adicionar item de envase" dica={disponiveis.length ? undefined : envases && !envases.length ? 'Nenhum item de envase cadastrado: cadastre em Cadastros › Envase' : 'Todos os itens de envase já estão no pedido'}>
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} disabled={!disponiveis.length}>
              <option value="">Escolha…</option>
              {disponiveis.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.origem === 'matriz' ? ' (da matriz)' : ''}</option>)}
            </select>
          </Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} disabled={!escolhido} onClick={adicionar}>+ Adicionar</button>
        </div>
      )}
      {podeEditar && <button className="botao botao-secundario" style={{ marginTop: 6 }} disabled={salvando || !alterado} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar envase'}</button>}

      <Resumo titulo="Resumo do envase" cards={[
        { rotulo: 'Custo do envase', valor: fmtBRL(custoEnvase), extra: `${itens.length} item(ns)` },
        { rotulo: 'Custo global acumulado', valor: fmtBRL(custoGlobal), extra: alterado ? 'ainda não salvo' : 'sem impostos', destaque: true },
        { rotulo: 'Envase por unidade', valor: planejada ? fmtBRL(custoEnvase / planejada) : '—', extra: planejada ? `${fmtQtd(planejada)} ${p.unidade_producao} planejadas` : 'quantidade definida na etapa 3' },
      ]} />
    </>
  );
}

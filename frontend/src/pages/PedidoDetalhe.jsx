import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtBRL, fmtData, fmtDataHora, fmtQtd, hoje, toast, useDados } from '../ui.jsx';
import { BuscaFormulacao, ETAPAS, PODE_EDITAR_CUSTOS, PODE_EDITAR_PEDIDOS, STATUS, Stepper, fmtNumero, necessidade, producaoPrevista } from './pedidos-comum.jsx';

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
    if (antesDeAvancar.current && !(await antesDeAvancar.current())) return;
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
      <Stepper atual={novo ? 1 : p.etapa} vista={etapaVista} aoEscolher={novo ? undefined : setVista} />
      <Erro msg={erro} />
      {novo && <div className="alerta alerta-info">Etapa 1: informe o cliente e, se já souber, a formulação inicial. Ao criar, o pedido ganha número e você segue nesta página, com o histórico de formulações e os envios de amostra.</div>}
      {!novo && !podeEditar && (
        <div className="alerta alerta-info">
          {p.status !== 'rascunho' ? `Pedido ${STATUS[p.status]?.[0].toLowerCase()}: somente leitura.` : !p.editavel ? `Pedido de ${p.empresa_nome}: só essa empresa, ou a dona do grupo, altera.` : editaCustos ? 'Seu papel edita só a etapa de custos; o restante é consulta.' : 'Seu papel só consulta pedidos.'}
        </div>
      )}
      {etapaVista === 1 ? (
        <>
          <Cabecalho p={p} novo={novo} podeEditar={podeEditar} s={s} recarregar={recarregar}
            aoCriar={(criado) => { toast.sucesso(`Pedido ${fmtNumero(criado.numero)} criado`); navegar(`/pedidos/${criado.id}`, { replace: true }); }} />
          {!novo && <Etapa1 p={p} podeEditar={podeEditar} recarregar={recarregar} empresaDe={empresaDe} />}
        </>
      ) : etapaVista === 2 ? (
        <Etapa2 key={p.id} p={p} podeEditar={podeEditar} recarregar={recarregar} antesDeAvancar={antesDeAvancar} />
      ) : etapaVista === 3 ? (
        <Etapa3 key={p.id} p={p} podeEditar={editaCustos} recarregar={recarregar} antesDeAvancar={antesDeAvancar} />
      ) : <div className="vazio">Etapa {etapaVista} · {ETAPAS[etapaVista - 1]?.nome}: conteúdo em definição.</div>}
      {!novo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <button className="botao botao-secundario" disabled={etapaVista <= 1} onClick={() => setVista(etapaVista - 1)}>← Etapa anterior</button>
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
        Cada envio registra a quantidade da formulação, as embalagens usadas e o valor da logística. É só para saber quanto foi gasto em amostras: <strong>não entra no custo do pedido</strong>.
      </div>
      <div className="grade-kpis">
        <div className="kpi"><div className="kpi-rotulo">Envios</div><div className="kpi-valor">{r.envios}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Logística</div><div className="kpi-valor">{fmtBRL(r.logistica_total)}</div><div className="kpi-extra">fora do custo do pedido</div></div>
        <div className="kpi"><div className="kpi-rotulo">Embalagens</div><div className="kpi-valor">{r.embalagens_total}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Formulação enviada</div><div className="kpi-valor" style={{ fontSize: 18 }}>{r.quantidades.length ? r.quantidades.map((q) => `${fmtQtd(q.total)} ${q.unidade}`).join(' · ') : '—'}</div></div>
      </div>
      {!p.amostras.length ? <Vazio msg="Nenhum envio de amostra" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Formulação</th><th className="num">Quantidade</th><th className="num">Embalagens</th><th className="num">Logística</th><th>Observações</th><th>Por</th><th>Status</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {p.amostras.map((a) => (
                <tr key={a.id} style={a.ativo ? undefined : { opacity: 0.55 }}>
                  <td>{fmtData(a.data_envio)}</td>
                  <td>{a.formulacao_nome}</td>
                  <td className="num">{fmtQtd(a.quantidade)} {a.unidade}</td>
                  <td className="num">{a.embalagens}{a.envase_nome ? <span className="texto-suave"> · {a.envase_nome}</span> : ''}</td>
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
const assinatura = (lista) => JSON.stringify((lista || []).map((m) => [m.maquina_id, Number(m.rendimento_pct)]));

// Etapa 2, Produção: quantidade a produzir, matérias-primas necessárias (fórmula por
// 1 unidade × quantidade) e o maquinário, com o rendimento ajustável para este pedido
function Etapa2({ p, podeEditar, recarregar, antesDeAvancar }) {
  const ativa = p.formulacoes.find((x) => x.ativa);
  const ingredientes = p.formulacao_ingredientes || [];
  const { dados: cadastro } = useDados(() => api(`/maquinas?empresa=${p.empresa_id}`).catch(() => []), [p.empresa_id]);
  const [f, setF] = React.useState({
    quantidade: p.quantidade_producao ?? '', unidade: p.unidade_producao || 'un',
    maquinas: (p.maquinas || []).map((m) => ({ maquina_id: m.maquina_id, titulo: m.titulo, modelo: m.modelo, rendimento_padrao: m.rendimento_padrao, rendimento_pct: m.rendimento_pct })),
  });
  const [escolhida, setEscolhida] = React.useState('');
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);
  const mudar = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));
  const producao = Number(f.quantidade) > 0 ? Number(f.quantidade) : 0;
  // O rendimento das máquinas reduz o que sai, não a matéria-prima: fica avisado ao lado da quantidade
  const prevista = producaoPrevista(producao, f.maquinas.map((m) => Number(m.rendimento_pct)).filter((r) => r > 0 && r <= 100));
  const alterado = String(f.quantidade) !== String(p.quantidade_producao ?? '') || f.unidade.trim() !== (p.unidade_producao || 'un') || assinatura(f.maquinas) !== assinatura(p.maquinas);
  const disponiveis = (cadastro || []).filter((m) => m.ativo && !f.maquinas.some((x) => x.maquina_id === m.id));

  function adicionarMaquina() {
    const m = (cadastro || []).find((x) => x.id === escolhida);
    if (!m) return;
    // O rendimento nasce do cadastro da máquina e pode ser ajustado só para este pedido
    setF((x) => ({ ...x, maquinas: [...x.maquinas, { maquina_id: m.id, titulo: m.titulo, modelo: m.modelo, rendimento_padrao: m.rendimento_pct, rendimento_pct: m.rendimento_pct }] }));
    setEscolhida('');
  }
  const mudarRendimento = (i, valor) => setF((x) => ({ ...x, maquinas: x.maquinas.map((m, j) => (j === i ? { ...m, rendimento_pct: valor } : m)) }));
  const removerMaquina = (i) => setF((x) => ({ ...x, maquinas: x.maquinas.filter((_, j) => j !== i) }));

  async function salvar() {
    setErro(null);
    if (!(Number(f.quantidade) > 0)) { setErro('Informe a quantidade a produzir'); return false; }
    if (!f.unidade.trim()) { setErro('Informe a unidade'); return false; }
    const fora = f.maquinas.find((m) => !(Number(m.rendimento_pct) > 0 && Number(m.rendimento_pct) <= 100));
    if (fora) { setErro(`Rendimento de ${fora.titulo}: entre 0,01 e 100 %`); return false; }
    setSalvando(true);
    try {
      await api(`/pedidos/${p.id}/producao`, { method: 'PUT', body: {
        quantidade: Number(f.quantidade), unidade: f.unidade.trim(),
        maquinas: f.maquinas.map((m) => ({ maquina_id: m.maquina_id, rendimento_pct: Number(m.rendimento_pct) })),
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

  // "Próxima etapa" salva antes de sair, se algo mudou ou a quantidade ainda não foi salva
  React.useEffect(() => {
    antesDeAvancar.current = podeEditar ? async () => (alterado || !(Number(p.quantidade_producao) > 0) ? salvar() : true) : null;
    return () => { antesDeAvancar.current = null; };
  });

  return (
    <>
      <Titulo>Formulação a produzir</Titulo>
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

      <Titulo>Matérias-primas necessárias</Titulo>
      {!ingredientes.length ? (
        <div className="alerta alerta-aviso">A formulação ainda não tem ingredientes: a farmácia precisa completar a fórmula em Cadastros › Formulações para a lista aparecer.</div>
      ) : (
        <>
          <div className="alerta alerta-info">As quantidades da fórmula valem para <strong>1 unidade</strong> produzida. O necessário é a quantidade da fórmula vezes a quantidade a produzir.</div>
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead><tr><th>Matéria-prima</th><th className="num">Na fórmula (por 1 unidade)</th><th className="num">Necessário{producao ? ` para ${fmtQtd(producao)} ${f.unidade}` : ''}</th></tr></thead>
              <tbody>
                {ingredientes.map((i) => {
                  const n = producao ? necessidade(i.quantidade, i.unidade, producao) : null;
                  return (
                    <tr key={i.materia_prima_id}>
                      <td className="negrito">{i.materia_prima}</td>
                      <td className="num">{fmtQtd(i.quantidade, 4)} {i.unidade}</td>
                      <td className="num negrito">{n ? `${fmtQtd(n.quantidade)} ${n.unidade}` : <span className="texto-suave">informe a quantidade</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Titulo>Maquinário</Titulo>
      <div className="alerta alerta-info">Máquinas de {p.empresa_nome} que serão usadas. O rendimento vem do cadastro da máquina e pode ser ajustado só para este pedido.</div>
      {!f.maquinas.length ? <Vazio msg="Nenhuma máquina no pedido" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Máquina</th><th>Modelo</th><th className="num">Rendimento do cadastro</th><th className="num">Rendimento neste pedido (%)</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {f.maquinas.map((m, i) => (
                <tr key={m.maquina_id}>
                  <td className="negrito">{m.titulo}</td>
                  <td>{m.modelo || '—'}</td>
                  <td className="num">{fmtQtd(m.rendimento_padrao, 2)} %</td>
                  <td className="num">
                    {podeEditar
                      ? <input type="number" step="0.01" min="0.01" max="100" value={m.rendimento_pct} onChange={(e) => mudarRendimento(i, e.target.value)} style={{ width: 110, textAlign: 'right' }} />
                      : `${fmtQtd(m.rendimento_pct, 2)} %`}
                    {Number(m.rendimento_pct) !== Number(m.rendimento_padrao) && <> <Badge cor="amarelo">ajustado</Badge></>}
                  </td>
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
              {disponiveis.map((m) => <option key={m.id} value={m.id}>{m.titulo}{m.modelo ? ` · ${m.modelo}` : ''} — rendimento {fmtQtd(m.rendimento_pct, 2)} %</option>)}
            </select>
          </Campo>
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} disabled={!escolhida} onClick={adicionarMaquina}>+ Adicionar</button>
        </div>
      )}
      {podeEditar && <button className="botao botao-secundario" style={{ marginTop: 6 }} disabled={salvando || !alterado} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar produção'}</button>}
      {/* Resumão da etapa, no fim de tudo: o que vai ser produzido depois do rendimento das máquinas */}
      <div style={{ marginTop: 20, padding: '14px 16px 4px', borderRadius: 12, background: 'var(--azul-100)', border: '1px solid #b9d0f0' }}>
        <div className="texto-suave negrito" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4, marginBottom: 10 }}>Resumo da produção</div>
        <div className="grade-kpis">
          <div className="kpi">
            <div className="kpi-rotulo">Formulação</div>
            <div className="kpi-valor" style={{ fontSize: 17 }}>{ativa?.nome || '—'}</div>
            <div className="kpi-extra">{ingredientes.length ? `${ingredientes.length} matéria(s)-prima(s)` : 'sem ingredientes cadastrados'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-rotulo">Quantidade planejada</div>
            <div className="kpi-valor">{producao ? `${fmtQtd(producao)} ${f.unidade}` : '—'}</div>
            <div className="kpi-extra">base da matéria-prima necessária</div>
          </div>
          <div className="kpi">
            <div className="kpi-rotulo">Rendimento das máquinas</div>
            <div className="kpi-valor">{f.maquinas.length ? `${fmtQtd(prevista.rendimento_pct, 2)} %` : '—'}</div>
            <div className="kpi-extra">{f.maquinas.length > 1 ? f.maquinas.map((m) => `${fmtQtd(m.rendimento_pct, 2)} %`).join(' × ') : f.maquinas.length === 1 ? f.maquinas[0].titulo : 'nenhuma máquina no pedido'}</div>
          </div>
          <div className="kpi" style={producao && prevista.rendimento_pct < 100 ? { background: '#fdf2d9', border: '1px solid #e9c46a' } : undefined}>
            <div className="kpi-rotulo">Produção prevista</div>
            <div className="kpi-valor">{producao ? `${fmtQtd(prevista.quantidade)} ${f.unidade}` : '—'}</div>
            <div className="kpi-extra">{producao && prevista.rendimento_pct < 100 ? `${fmtQtd(producao - prevista.quantidade)} ${f.unidade} a menos pelo rendimento` : 'sem perda pelo rendimento'}</div>
          </div>
        </div>
      </div>
    </>
  );
}

// Tipos de custo: de onde vem o item, como nomear e o que preencher por padrão
const TIPOS_CUSTO = [
  { valor: 'materia_prima', rotulo: 'Matérias-primas', rota: () => '/materias', nome: (x) => x.nome, unidade: (x) => x.unidade || 'un', valorPadrao: () => '' },
  { valor: 'envase', rotulo: 'Envase', rota: () => '/envases', nome: (x) => x.nome, unidade: () => 'un', valorPadrao: () => '' },
  { valor: 'maquina', rotulo: 'Máquinas', rota: (p) => `/maquinas?empresa=${p.empresa_id}`, nome: (x) => x.titulo, unidade: () => 'h', valorPadrao: (x) => x.custo_hora ?? '' },
  { valor: 'mao_de_obra', rotulo: 'Mão de obra', rota: (p) => `/funcionarios?empresa=${p.empresa_id}`, nome: (x) => `${x.nome}${x.categoria ? ` · ${x.categoria}` : ''}`, unidade: () => 'h', valorPadrao: (x) => x.custo_hora ?? '' },
  { valor: 'veiculo', rotulo: 'Logística', rota: (p) => `/veiculos?empresa=${p.empresa_id}`, nome: (x) => [x.tipo, x.marca, x.modelo, x.placa].filter(Boolean).join(' '), unidade: () => 'h', valorPadrao: (x) => x.custo_hora ?? '' },
  { valor: 'outro', rotulo: 'Outros custos', rota: null },
];
const tipoDe = (v) => TIPOS_CUSTO.find((t) => t.valor === v);
const linhaDe = (c, k) => ({ k, tipo: c.tipo, referencia_id: c.referencia_id || '', descricao: c.descricao, quantidade: c.quantidade, unidade: c.unidade, valor_unitario: c.valor_unitario });
const assinaturaCustos = (ls) => JSON.stringify(ls.map((l) => [l.tipo, l.referencia_id || '', l.descricao, Number(l.quantidade) || 0, l.unidade, Number(l.valor_unitario) || 0]));
const totalLinha = (l) => Math.round((Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0) * 100) / 100;

// Etapa 3, Custos: linhas de custo do pedido, puxadas dos cadastros ou avulsas, com o
// total e o custo por unidade produzida. Nome e valor ficam gravados no pedido
function Etapa3({ p, podeEditar, recarregar, antesDeAvancar }) {
  const [linhas, setLinhas] = React.useState((p.custos || []).map((c, i) => linhaDe(c, i + 1)));
  const proximaChave = React.useRef((p.custos || []).length + 1);
  const [catalogos, setCatalogos] = React.useState({});
  const [novo, setNovo] = React.useState({ tipo: 'materia_prima', referencia_id: '', descricao: '' });
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);

  // Cadastros da empresa do pedido, cada um por conta própria: um 403 (ex.: mão de obra) não derruba os outros
  React.useEffect(() => {
    let vivo = true;
    Promise.all(TIPOS_CUSTO.filter((t) => t.rota).map((t) => api(t.rota(p)).then((l) => [t.valor, (l || []).filter((x) => x.ativo !== 0)]).catch(() => [t.valor, null])))
      .then((pares) => { if (vivo) setCatalogos(Object.fromEntries(pares)); });
    return () => { vivo = false; };
  }, [p.id]);

  function adicionar(tipoValor, item, extra = {}) {
    const t = tipoDe(tipoValor);
    setLinhas((ls) => [...ls, {
      k: proximaChave.current++, tipo: tipoValor, referencia_id: item?.id || '', descricao: item ? t.nome(item) : extra.descricao || '',
      quantidade: extra.quantidade ?? (tipoValor === 'outro' ? 1 : ''), unidade: extra.unidade ?? (item ? t.unidade(item) : 'un'), valor_unitario: extra.valor_unitario ?? (item ? t.valorPadrao(item) : ''),
    }]);
  }

  function adicionarNovo() {
    setErro(null);
    if (novo.tipo === 'outro') {
      if (!novo.descricao.trim()) return setErro('Descreva o custo avulso');
      adicionar('outro', null, { descricao: novo.descricao.trim() });
      setNovo((n) => ({ ...n, descricao: '' }));
      return;
    }
    const item = (catalogos[novo.tipo] || []).find((x) => x.id === novo.referencia_id);
    if (!item) return setErro('Escolha o item do cadastro');
    adicionar(novo.tipo, item);
    setNovo((n) => ({ ...n, referencia_id: '' }));
  }

  // Puxa da etapa 2 o que ainda não está na lista: matérias-primas necessárias e máquinas do pedido
  function trazerMateriasPrimas() {
    for (const i of p.formulacao_ingredientes || []) {
      if (linhas.some((l) => l.tipo === 'materia_prima' && l.referencia_id === i.materia_prima_id)) continue;
      adicionar('materia_prima', { id: i.materia_prima_id, nome: i.materia_prima, unidade: i.necessario_unidade || i.unidade }, { quantidade: i.necessario ?? '', unidade: i.necessario_unidade || i.unidade });
    }
  }
  function trazerMaquinas() {
    for (const m of p.maquinas || []) {
      if (linhas.some((l) => l.tipo === 'maquina' && l.referencia_id === m.maquina_id)) continue;
      adicionar('maquina', { id: m.maquina_id, titulo: m.titulo, custo_hora: m.custo_hora }, { quantidade: '' });
    }
  }
  const mudarLinha = (k, campo, valor) => setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, [campo]: valor } : l)));
  const removerLinha = (k) => setLinhas((ls) => ls.filter((l) => l.k !== k));
  const alterado = assinaturaCustos(linhas) !== assinaturaCustos((p.custos || []).map((c, i) => linhaDe(c, i)));
  const total = Math.round(linhas.reduce((s, l) => s + totalLinha(l), 0) * 100) / 100;
  const planejada = Number(p.quantidade_producao) || 0;
  const prevista = Number(p.producao_prevista) || 0;

  async function salvar() {
    setErro(null);
    const invalida = linhas.find((l) => !(Number(l.quantidade) >= 0) || !(Number(l.valor_unitario) >= 0) || (l.tipo === 'outro' && !String(l.descricao).trim()));
    if (invalida) { setErro('Confira quantidade, valor unitário e descrição das linhas'); return false; }
    setSalvando(true);
    try {
      await api(`/pedidos/${p.id}/custos`, { method: 'PUT', body: { itens: linhas.map((l) => ({
        tipo: l.tipo, referencia_id: l.referencia_id || undefined, descricao: l.tipo === 'outro' ? String(l.descricao).trim() : undefined,
        quantidade: Number(l.quantidade) || 0, unidade: l.unidade || undefined, valor_unitario: Number(l.valor_unitario) || 0,
      })) } });
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

  // "Próxima etapa" salva antes de sair, se algo mudou
  React.useEffect(() => {
    antesDeAvancar.current = podeEditar ? async () => (alterado ? salvar() : true) : null;
    return () => { antesDeAvancar.current = null; };
  });

  const grupos = TIPOS_CUSTO.map((t) => ({ t, itens: linhas.filter((l) => l.tipo === t.valor) })).filter((g) => g.itens.length);
  const itensDoTipo = catalogos[novo.tipo];
  const subtotal = (itens) => itens.reduce((s, l) => s + totalLinha(l), 0);

  return (
    <>
      <Titulo>Custos do pedido</Titulo>
      <div className="alerta alerta-info">
        Adicione as linhas de custo. Matérias-primas e máquinas podem vir da etapa 2; mão de obra, veículos e envase vêm dos cadastros, com o custo por hora já preenchido.
        Nome e valor ficam gravados no pedido: mudar o cadastro depois não altera este custo.
      </div>
      {!podeEditar && <div className="alerta alerta-info">Só dono, administrativo e financeiro editam os custos.</div>}
      <Erro msg={erro} />
      {podeEditar && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button type="button" className="botao botao-secundario botao-mini" disabled={!(p.formulacao_ingredientes || []).length} onClick={trazerMateriasPrimas}>Trazer matérias-primas da etapa 2</button>
          <button type="button" className="botao botao-secundario botao-mini" disabled={!(p.maquinas || []).length} onClick={trazerMaquinas}>Trazer máquinas da etapa 2</button>
        </div>
      )}
      {podeEditar && (
        <div className="linha-campos" style={{ alignItems: 'flex-end' }}>
          <Campo rotulo="Tipo" largura={170}>
            <select value={novo.tipo} onChange={(e) => setNovo({ tipo: e.target.value, referencia_id: '', descricao: '' })}>{TIPOS_CUSTO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}</select>
          </Campo>
          {novo.tipo === 'outro' ? (
            <Campo rotulo="Descrição"><input value={novo.descricao} onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))} placeholder="ex.: frete, análise de laboratório" /></Campo>
          ) : (
            <Campo rotulo="Item" dica={itensDoTipo === null ? 'Seu papel não acessa este cadastro' : itensDoTipo && !itensDoTipo.length ? 'Nenhum item ativo neste cadastro' : undefined}>
              <select value={novo.referencia_id} onChange={(e) => setNovo((n) => ({ ...n, referencia_id: e.target.value }))} disabled={!itensDoTipo || !itensDoTipo.length}>
                <option value="">Escolha…</option>
                {(itensDoTipo || []).map((x) => <option key={x.id} value={x.id}>{tipoDe(novo.tipo).nome(x)}{x.custo_hora != null ? ` — ${fmtBRL(x.custo_hora)}/h` : ''}{x.origem === 'matriz' ? ' (da matriz)' : ''}</option>)}
              </select>
            </Campo>
          )}
          <button type="button" className="botao botao-secundario" style={{ marginBottom: 10 }} onClick={adicionarNovo}>+ Adicionar</button>
        </div>
      )}
      {!linhas.length ? <Vazio msg="Nenhum custo lançado" /> : (
        <div className="tabela-envolucro">
          <table className="tabela">
            <thead><tr><th>Item</th><th className="num">Quantidade</th><th>Unidade</th><th className="num">Valor unitário (R$)</th><th className="num">Total</th>{podeEditar && <th className="acoes">Ações</th>}</tr></thead>
            <tbody>
              {grupos.map(({ t, itens }) => (
                <React.Fragment key={t.valor}>
                  <tr style={{ background: '#f4f6fa' }}><td colSpan={4} className="negrito">{t.rotulo}</td><td className="num negrito">{fmtBRL(subtotal(itens))}</td>{podeEditar && <td />}</tr>
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
      {/* Resumão da etapa, no fim de tudo */}
      <div style={{ marginTop: 20, padding: '14px 16px 4px', borderRadius: 12, background: 'var(--azul-100)', border: '1px solid #b9d0f0' }}>
        <div className="texto-suave negrito" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.4, marginBottom: 10 }}>Resumo dos custos</div>
        <div className="grade-kpis">
          <div className="kpi">
            <div className="kpi-rotulo">Custo total</div>
            <div className="kpi-valor">{fmtBRL(total)}</div>
            <div className="kpi-extra">{linhas.length} linha(s){alterado ? ' · ainda não salvo' : ''}</div>
          </div>
          <div className="kpi">
            <div className="kpi-rotulo">Por unidade planejada</div>
            <div className="kpi-valor">{planejada ? fmtBRL(total / planejada) : '—'}</div>
            <div className="kpi-extra">{planejada ? `${fmtQtd(planejada)} ${p.unidade_producao}` : 'sem quantidade na etapa 2'}</div>
          </div>
          <div className="kpi" style={prevista && prevista < planejada ? { background: '#fdf2d9', border: '1px solid #e9c46a' } : undefined}>
            <div className="kpi-rotulo">Por unidade prevista</div>
            <div className="kpi-valor">{prevista ? fmtBRL(total / prevista) : '—'}</div>
            <div className="kpi-extra">{prevista ? `${fmtQtd(prevista)} ${p.unidade_producao} depois do rendimento` : 'sem produção prevista'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-rotulo">Composição</div>
            <div className="kpi-valor" style={{ fontSize: 13, lineHeight: 1.5 }}>{grupos.length ? grupos.map(({ t, itens }) => `${t.rotulo}: ${fmtBRL(subtotal(itens))}`).join(' · ') : '—'}</div>
          </div>
        </div>
      </div>
    </>
  );
}

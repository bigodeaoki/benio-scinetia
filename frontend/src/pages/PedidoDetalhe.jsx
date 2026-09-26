import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtBRL, fmtData, fmtDataHora, fmtQtd, hoje, toast, useDados } from '../ui.jsx';
import { BuscaFormulacao, ETAPAS, PODE_EDITAR_PEDIDOS, STATUS, Stepper, fmtNumero } from './pedidos-comum.jsx';

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
  const etapaVista = novo ? 1 : vista || p?.etapa || 1;
  const papelEdita = PODE_EDITAR_PEDIDOS.includes(s.usuario?.papel) && (novo || !!p?.editavel);
  const podeEditar = papelEdita && (novo || p?.status === 'rascunho');
  const empresaDe = (x, campo = 'empresa') => (x[`${campo}_id`] === s.escopo?.matriz?.id ? `${x[`${campo}_nome`]} (matriz)` : x[`${campo}_nome`]);

  // Avançar salva a etapa em que o pedido está; voltar e clicar no stepper só mudam a visão.
  // Sair da etapa 1 pergunta se o cliente aprovou a formulação ativa (fica registrado nela)
  async function avancar() {
    const n = etapaVista + 1;
    if (n > ETAPAS.length) return;
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
          {p.status !== 'rascunho' ? `Pedido ${STATUS[p.status]?.[0].toLowerCase()}: somente leitura.` : !p.editavel ? `Pedido de ${p.empresa_nome}: só essa empresa, ou a dona do grupo, altera.` : 'Seu papel só consulta pedidos.'}
        </div>
      )}
      {etapaVista === 1 ? (
        <>
          <Cabecalho p={p} novo={novo} podeEditar={podeEditar} s={s} recarregar={recarregar}
            aoCriar={(criado) => { toast.sucesso(`Pedido ${fmtNumero(criado.numero)} criado`); navegar(`/pedidos/${criado.id}`, { replace: true }); }} />
          {!novo && <Etapa1 p={p} podeEditar={podeEditar} recarregar={recarregar} empresaDe={empresaDe} />}
        </>
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

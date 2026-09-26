import React from 'react';
import { ClipboardList } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'vendas', 'administrativo'];
const STATUS = { rascunho: ['Rascunho', 'amarelo'], concluido: ['Concluído', 'verde'], cancelado: ['Cancelado', 'cinza'] };
// Etapas do pedido; as próximas entram aqui conforme forem definidas
const ETAPAS = [{ numero: 1, nome: 'Cliente e formulação' }];
const fmtNumero = (n) => `#${String(n).padStart(4, '0')}`;

// Pedidos: entrada em etapas, salva no meio. Cada empresa cria os seus e todo
// o grupo enxerga; altera a empresa dona, ou a dona do grupo.
export default function Pedidos() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState('');
  const consulta = ['/pedidos', [filtroEmpresa && `empresa=${filtroEmpresa}`, filtroStatus && `status=${filtroStatus}`].filter(Boolean).join('&')].filter(Boolean).join('?');
  const { dados, erro, carregando, recarregar } = useDados(() => api(consulta), [s.empresaId, filtroEmpresa, filtroStatus]);
  const [aberto, setAberto] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const grupo = s.empresas.length > 1;
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const empresaDe = (p) => (p.empresa_id === s.escopo?.matriz?.id ? `${p.empresa_nome} (matriz)` : p.empresa_nome);

  async function mudarStatus(p, status) {
    const cancelar = status === 'cancelado';
    const ok = await confirmar({ titulo: cancelar ? 'Cancelar pedido' : 'Reabrir pedido', mensagem: cancelar ? `Cancelar o pedido ${fmtNumero(p.numero)} de ${p.cliente_nome}? Ele fica no histórico e pode ser reaberto.` : `Reabrir o pedido ${fmtNumero(p.numero)} como rascunho?`, confirmarTexto: cancelar ? 'Cancelar pedido' : 'Reabrir', perigo: cancelar });
    if (!ok) return;
    try {
      await api(`/pedidos/${p.id}/status`, { method: 'PUT', body: { status } });
      recarregar();
      toast.sucesso(cancelar ? 'Pedido cancelado' : 'Pedido reaberto');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><ClipboardList size={15} className="icone-cartao" />Pedidos do grupo {s.escopo?.matriz?.nome || ''}</h3>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={{ width: 'auto', minWidth: 160 }} title="Filtrar por status">
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([v, [rotulo]]) => <option key={v} value={v}>{rotulo}</option>)}
          </select>
          {grupo && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ width: 'auto', minWidth: 220 }} title="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          )}
          {podeEditar && <button className="botao" onClick={() => setAberto({ novo: true })}>+ Novo pedido</button>}
        </div>
        <div className="alerta alerta-info">
          O pedido é preenchido em etapas e pode ser salvo no meio: fica como <strong>rascunho</strong> na etapa em que parou.
          Você está como <strong>{empresa?.nome}</strong>; todo o grupo enxerga os pedidos, e altera a empresa que criou (ou a dona do grupo).
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum pedido" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Nº</th><th>Cliente</th><th>Formulação</th><th>Empresa</th><th>Status</th><th>Etapa</th><th>Criado por</th><th>Criado em</th><th className="acoes">Ações</th></tr>
              </thead>
              <tbody>
                {dados.map((p) => (
                  <tr key={p.id} style={p.status === 'cancelado' ? { opacity: 0.55 } : undefined}>
                    <td className="mono negrito">{fmtNumero(p.numero)}</td>
                    <td><div className="negrito">{p.cliente_nome}</div>{p.cliente_fantasia && <div className="texto-suave">{p.cliente_fantasia}</div>}</td>
                    <td>{p.formulacao_nome ? <>{p.formulacao_nome} {Number(p.formulacao_itens) === 0 && <Badge cor="amarelo">sem ingredientes</Badge>}</> : <span className="texto-suave">—</span>}</td>
                    <td>{empresaDe(p)}</td>
                    <td><Badge cor={STATUS[p.status]?.[1] || 'cinza'}>{STATUS[p.status]?.[0] || p.status}</Badge></td>
                    <td>{p.etapa}/{ETAPAS.length} <span className="texto-suave">{ETAPAS[p.etapa - 1]?.nome}</span></td>
                    <td>{p.usuario_nome || '—'}</td>
                    <td>{fmtDataHora(p.criado_em)}</td>
                    <td className="acoes">
                      {podeEditar && p.editavel ? (
                        <>
                          {p.status === 'rascunho' && <button className="botao botao-mini" onClick={() => setAberto(p)}>Continuar</button>}
                          {p.status !== 'rascunho' && <button className="botao botao-secundario botao-mini" onClick={() => setAberto({ ...p, somenteLeitura: true })}>Ver</button>}
                          {p.status === 'cancelado'
                            ? <button className="botao botao-secundario botao-mini" onClick={() => mudarStatus(p, 'rascunho')}>Reabrir</button>
                            : <button className="botao botao-perigo botao-mini" onClick={() => mudarStatus(p, 'cancelado')}>Cancelar</button>}
                        </>
                      ) : (
                        <button className="botao botao-secundario botao-mini" onClick={() => setAberto({ ...p, somenteLeitura: true })}>Ver</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {aberto && (
        <FormPedido pedido={aberto.novo ? null : aberto} somenteLeitura={!!aberto.somenteLeitura} empresas={s.empresas} empresaAtiva={s.empresaId}
          ehDono={s.usuario?.papel === 'owner'} nomeEmpresa={nomeEmpresa} matrizId={s.escopo?.matriz?.id} aoFechar={() => setAberto(null)}
          aoSalvar={() => { setAberto(null); recarregar(); toast.sucesso('Pedido salvo'); }} />
      )}
    </>
  );
}

// Indicador de etapas do pedido
function Etapas({ atual }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '4px 0 14px', flexWrap: 'wrap' }}>
      {ETAPAS.map((e) => (
        <div key={e.numero} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: e.numero === atual ? 1 : 0.55 }}>
          <span className="badge badge-azul" style={{ width: 24, height: 24, display: 'inline-grid', placeItems: 'center', borderRadius: '50%', padding: 0 }}>{e.numero}</span>
          <span className={e.numero === atual ? 'negrito' : undefined}>{e.nome}</span>
        </div>
      ))}
      <div className="texto-suave" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.55 }}>
        <span className="badge badge-cinza" style={{ width: 24, height: 24, display: 'inline-grid', placeItems: 'center', borderRadius: '50%', padding: 0 }}>…</span>
        <span>próximas etapas em definição</span>
      </div>
    </div>
  );
}

function FormPedido({ pedido, somenteLeitura, empresas, empresaAtiva, ehDono, nomeEmpresa, matrizId, aoFechar, aoSalvar }) {
  const ro = somenteLeitura;
  const { dados: clientes } = useDados(() => api('/clientes'), []);
  const [f, setF] = React.useState(pedido
    ? { cliente_id: pedido.cliente_id, formulacao: pedido.formulacao_id ? { id: pedido.formulacao_id, nome: pedido.formulacao_nome, itens: pedido.formulacao_itens } : null, observacoes: pedido.observacoes || '', empresa_id: pedido.empresa_id }
    : { cliente_id: '', formulacao: null, observacoes: '', empresa_id: empresaAtiva });
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const etapa = pedido?.etapa || 1;
  const empresaDe = (c) => (c.empresa_id === matrizId ? `${c.empresa_nome} (matriz)` : c.empresa_nome);
  const clientesAtivos = (clientes || []).filter((c) => c.ativo || c.id === f.cliente_id);

  async function salvar() {
    setErro(null);
    if (!f.cliente_id) return setErro('Escolha o cliente');
    const corpo = {
      cliente_id: f.cliente_id, observacoes: f.observacoes.trim() || undefined, etapa,
      formulacao_id: f.formulacao?.id || undefined, formulacao_nome: f.formulacao?.nova ? f.formulacao.nome : undefined,
      ...(pedido ? {} : { empresa_id: f.empresa_id }),
    };
    setSalvando(true);
    try {
      if (pedido) await api(`/pedidos/${pedido.id}`, { method: 'PUT', body: corpo });
      else await api('/pedidos', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={pedido ? `Pedido ${fmtNumero(pedido.numero)} · ${pedido.cliente_nome}` : 'Novo pedido'} largura={760} onFechar={aoFechar}
      rodape={<>
        <button className="botao botao-secundario" onClick={aoFechar}>{ro ? 'Fechar' : 'Cancelar'}</button>
        {!ro && <button className="botao botao-secundario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar rascunho'}</button>}
        {!ro && <button className="botao" disabled title="As próximas etapas ainda serão definidas">Próxima etapa →</button>}
      </>}
    >
      <Etapas atual={etapa} />
      <Erro msg={erro} />
      {ro && <div className="alerta alerta-info">Pedido de <strong>{pedido.empresa_nome}</strong>, {STATUS[pedido.status]?.[0].toLowerCase()}. {pedido.editavel ? 'Reabra para alterar.' : 'Só essa empresa, ou a dona do grupo, altera.'}</div>}
      <div className="linha-campos">
        <Campo rotulo="Cliente *" dica="Clientes ativos do grupo">
          {ro ? <input value={`${pedido.cliente_nome}${pedido.cliente_fantasia ? ` · ${pedido.cliente_fantasia}` : ''}`} readOnly /> : (
            <select value={f.cliente_id} onChange={(e) => mudar('cliente_id', e.target.value)} autoFocus>
              <option value="">Escolha…</option>
              {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.razao_social}{c.nome_fantasia ? ` · ${c.nome_fantasia}` : ''} — {empresaDe(c)}</option>)}
            </select>
          )}
        </Campo>
        <Campo rotulo="Empresa do pedido *" largura={240} dica={!pedido && ehDono ? 'Empresa do grupo que faz o pedido' : undefined}>
          {!pedido && ehDono
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={pedido ? pedido.empresa_nome : nomeEmpresa(empresas.find((e) => e.id === f.empresa_id))} readOnly />}
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Formulação" dica={ro ? undefined : 'Digite 3 letras para buscar nas formulações desta empresa e da matriz; se não existir, crie só com o nome'}>
          {ro ? <input value={pedido.formulacao_nome || '—'} readOnly /> : <BuscaFormulacao valor={f.formulacao} aoEscolher={(v) => mudar('formulacao', v)} />}
        </Campo>
      </div>
      {!ro && f.formulacao && (
        <div className={`alerta ${f.formulacao.nova ? 'alerta-aviso' : 'alerta-info'}`}>
          {f.formulacao.nova
            ? <>Nova formulação <strong>{f.formulacao.nome}</strong>: será criada só com o nome nesta empresa; a farmácia completa os ingredientes depois.</>
            : <>Formulação <strong>{f.formulacao.nome}</strong>{Number(f.formulacao.itens) === 0 ? ' (ainda sem ingredientes)' : ''}.</>}
        </div>
      )}
      <div className="linha-campos">
        <Campo rotulo="Observações"><input value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} readOnly={ro} /></Campo>
      </div>
      {pedido && (
        <div className="linha-campos">
          <Campo rotulo="Criado por" largura={220}><input value={pedido.usuario_nome || '—'} readOnly /></Campo>
          <Campo rotulo="Criado em" largura={170}><input value={fmtDataHora(pedido.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizado em" largura={170}><input value={fmtDataHora(pedido.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

// Busca de formulação: a partir do 3º caractere procura nas formulações da
// empresa (e da matriz); sem resultado exato, oferece criar uma nova só com o nome
function BuscaFormulacao({ valor, aoEscolher }) {
  const [texto, setTexto] = React.useState(valor?.nome || '');
  const [opcoes, setOpcoes] = React.useState(null);
  const [buscando, setBuscando] = React.useState(false);
  const timer = React.useRef(null);
  const pedido = React.useRef(0);

  function buscar(t) {
    const q = t.trim();
    clearTimeout(timer.current);
    if (q.length < 3) { setOpcoes(null); return; }
    timer.current = setTimeout(async () => {
      const n = ++pedido.current;
      setBuscando(true);
      try {
        const lista = await api(`/formulacoes?q=${encodeURIComponent(q)}`);
        if (n === pedido.current) setOpcoes(lista);
      } catch {
        if (n === pedido.current) setOpcoes([]);
      } finally {
        if (n === pedido.current) setBuscando(false);
      }
    }, 250);
  }

  function mudar(t) {
    setTexto(t);
    if (valor) aoEscolher(null);
    buscar(t);
  }

  function escolher(o) {
    aoEscolher({ id: o.id, nome: o.nome, itens: o.itens });
    setTexto(o.nome);
    setOpcoes(null);
  }

  function criar() {
    aoEscolher({ id: null, nome: texto.trim(), nova: true });
    setOpcoes(null);
  }

  const q = texto.trim();
  const existeExata = (opcoes || []).some((o) => o.nome.toLowerCase() === q.toLowerCase());

  return (
    <div className="autocomplete">
      <input value={texto} onChange={(e) => mudar(e.target.value)} placeholder="Digite 3 letras para buscar…" autoComplete="off"
        onFocus={() => q.length >= 3 && !valor && buscar(texto)} onBlur={() => setTimeout(() => setOpcoes(null), 150)} />
      {opcoes && (
        <div className="autocomplete-lista">
          {opcoes.map((o) => (
            <button type="button" className="autocomplete-opcao" key={o.id} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(o)}>
              <span className="negrito">{o.nome}</span>
              <span className="texto-suave"> · {o.origem === 'matriz' ? 'da matriz' : 'desta empresa'}{Number(o.itens) === 0 ? ' · sem ingredientes' : ` · ${o.itens} ingrediente(s)`}</span>
            </button>
          ))}
          {!existeExata && q.length >= 2 && (
            <button type="button" className="autocomplete-opcao" onMouseDown={(e) => e.preventDefault()} onClick={criar}>
              + Criar nova formulação <span className="negrito">“{q}”</span> <span className="texto-suave">(só com o nome)</span>
            </button>
          )}
          {buscando && <div className="autocomplete-vazio">Buscando…</div>}
          {!buscando && !opcoes.length && existeExata && <div className="autocomplete-vazio">Nenhuma formulação encontrada</div>}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';
import { BuscaFormulacao, ETAPAS, PODE_EDITAR_PEDIDOS, STATUS, fmtNumero } from './pedidos-comum.jsx';

// Pedidos: entrada em etapas, salva no meio. Cada empresa cria os seus e todo
// o grupo enxerga; altera a empresa dona, ou a dona do grupo. "Continuar"
// abre a página do pedido, com o stepper das etapas.
export default function Pedidos() {
  const s = React.useContext(SessaoContext);
  const navegar = useNavigate();
  const podeEditar = PODE_EDITAR_PEDIDOS.includes(s.usuario?.papel);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState('');
  const consulta = ['/pedidos', [filtroEmpresa && `empresa=${filtroEmpresa}`, filtroStatus && `status=${filtroStatus}`].filter(Boolean).join('&')].filter(Boolean).join('?');
  const { dados, erro, carregando, recarregar } = useDados(() => api(consulta), [s.empresaId, filtroEmpresa, filtroStatus]);
  const [novo, setNovo] = React.useState(false);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const grupo = s.empresas.length > 1;
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const empresaDe = (p) => (p.empresa_id === s.escopo?.matriz?.id ? `${p.empresa_nome} (matriz)` : p.empresa_nome);
  const abrir = (p) => navegar(`/pedidos/${p.id}`);

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
          {podeEditar && <button className="botao" onClick={() => setNovo(true)}>+ Novo pedido</button>}
        </div>
        <div className="alerta alerta-info">
          O pedido é preenchido em {ETAPAS.length} etapas e pode ser salvo no meio: fica como <strong>rascunho</strong> na etapa em que parou.
          Você está como <strong>{empresa?.nome}</strong>; todo o grupo enxerga os pedidos, e altera a empresa que criou (ou a dona do grupo).
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum pedido" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Nº</th><th>Cliente</th><th>Formulação atual</th><th>Empresa</th><th>Status</th><th>Etapa</th><th>Criado por</th><th>Criado em</th><th className="acoes">Ações</th></tr>
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
                      {podeEditar && p.editavel && p.status === 'rascunho'
                        ? <button className="botao botao-mini" onClick={() => abrir(p)}>Continuar</button>
                        : <button className="botao botao-secundario botao-mini" onClick={() => abrir(p)}>Ver</button>}
                      {podeEditar && p.editavel && (p.status === 'cancelado'
                        ? <button className="botao botao-secundario botao-mini" onClick={() => mudarStatus(p, 'rascunho')}>Reabrir</button>
                        : <button className="botao botao-perigo botao-mini" onClick={() => mudarStatus(p, 'cancelado')}>Cancelar</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {novo && (
        <FormNovoPedido empresas={s.empresas} empresaAtiva={s.empresaId} ehDono={s.usuario?.papel === 'owner'} nomeEmpresa={nomeEmpresa} matrizId={s.escopo?.matriz?.id}
          aoFechar={() => setNovo(false)} aoSalvar={(p) => { setNovo(false); toast.sucesso(`Pedido ${fmtNumero(p.numero)} criado`); navegar(`/pedidos/${p.id}`); }} />
      )}
    </>
  );
}

// Criação: cliente, empresa do pedido e formulação inicial (opcional). O resto é feito na página do pedido
function FormNovoPedido({ empresas, empresaAtiva, ehDono, nomeEmpresa, matrizId, aoFechar, aoSalvar }) {
  const { dados: clientes } = useDados(() => api('/clientes'), []);
  const [f, setF] = React.useState({ cliente_id: '', formulacao: null, observacoes: '', empresa_id: empresaAtiva });
  const [erro, setErro] = React.useState(null);
  const [salvando, setSalvando] = React.useState(false);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const empresaDe = (c) => (c.empresa_id === matrizId ? `${c.empresa_nome} (matriz)` : c.empresa_nome);

  async function salvar() {
    setErro(null);
    if (!f.cliente_id) return setErro('Escolha o cliente');
    const corpo = {
      cliente_id: f.cliente_id, observacoes: f.observacoes.trim() || undefined, empresa_id: f.empresa_id,
      formulacao_id: f.formulacao?.id || undefined, formulacao_nome: f.formulacao?.nova ? f.formulacao.nome : undefined,
    };
    setSalvando(true);
    try {
      aoSalvar(await api('/pedidos', { method: 'POST', body: corpo }));
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Novo pedido" largura={720} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" disabled={salvando} onClick={salvar}>{salvando ? 'Criando…' : 'Criar e abrir o pedido'}</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Cliente *" dica="Clientes ativos do grupo">
          <select value={f.cliente_id} onChange={(e) => mudar('cliente_id', e.target.value)} autoFocus>
            <option value="">Escolha…</option>
            {(clientes || []).filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.razao_social}{c.nome_fantasia ? ` · ${c.nome_fantasia}` : ''} — {empresaDe(c)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Empresa do pedido *" largura={240} dica={ehDono ? 'Empresa do grupo que faz o pedido' : undefined}>
          {ehDono
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={nomeEmpresa(empresas.find((e) => e.id === f.empresa_id))} readOnly />}
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Formulação inicial" dica="Digite 3 letras para buscar nesta empresa e na matriz; se não existir, crie só com o nome. Pode ficar para depois">
          <BuscaFormulacao valor={f.formulacao} aoEscolher={(v) => mudar('formulacao', v)} />
        </Campo>
      </div>
      {f.formulacao && (
        <div className={`alerta ${f.formulacao.nova ? 'alerta-aviso' : 'alerta-info'}`}>
          {f.formulacao.nova
            ? <>Nova formulação <strong>{f.formulacao.nome}</strong>: será criada só com o nome nesta empresa; a farmácia completa os ingredientes depois.</>
            : <>Formulação <strong>{f.formulacao.nome}</strong>{Number(f.formulacao.itens) === 0 ? ' (ainda sem ingredientes)' : ''}.</>}
        </div>
      )}
      <div className="linha-campos">
        <Campo rotulo="Observações"><input value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} /></Campo>
      </div>
    </Modal>
  );
}

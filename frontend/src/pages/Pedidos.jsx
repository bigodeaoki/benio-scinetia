import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Carregando, Erro, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';
import { ETAPAS, PODE_EDITAR_PEDIDOS, STATUS, fmtNumero } from './pedidos-comum.jsx';

// Pedidos: entrada em etapas, salva no meio. Cada empresa cria os seus e todo
// o grupo enxerga; altera a empresa dona, ou a dona do grupo. Criar e
// continuar abrem a página do pedido, com o stepper das etapas.
export default function Pedidos() {
  const s = React.useContext(SessaoContext);
  const navegar = useNavigate();
  const podeEditar = PODE_EDITAR_PEDIDOS.includes(s.usuario?.papel);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState('');
  const consulta = ['/pedidos', [filtroEmpresa && `empresa=${filtroEmpresa}`, filtroStatus && `status=${filtroStatus}`].filter(Boolean).join('&')].filter(Boolean).join('?');
  const { dados, erro, carregando, recarregar } = useDados(() => api(consulta), [s.empresaId, filtroEmpresa, filtroStatus]);
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
          {podeEditar && <button className="botao" onClick={() => navegar('/pedidos/novo')}>+ Novo pedido</button>}
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
    </>
  );
}


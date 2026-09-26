import React from 'react';
import { Box } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'compras', 'producao', 'administrativo'];

// Itens de envase: frascos, tampas, rótulos, caixas. A quantidade fica no
// estoque; aqui é só o cadastro. Mesma visibilidade das matérias-primas.
export default function Envases() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  // Tela de cadastro: a dona vê o grupo inteiro (com filtro por empresa); os demais, a sua empresa e a matriz
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const { dados, erro, carregando, recarregar } = useDados(() => api(filtroEmpresa ? `/envases?empresa=${filtroEmpresa}` : '/envases?grupo=1'), [s.empresaId, filtroEmpresa]);
  const [editando, setEditando] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const ehFilial = !!empresa?.filial;
  const grupo = s.empresas.length > 1;
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const empresaDe = (x) => (x.empresa_id === s.escopo?.matriz?.id ? `${x.empresa_nome} (matriz)` : x.empresa_nome);
  const tituloEscopo = grupo ? `do grupo ${s.escopo?.matriz?.nome || ''}` : `de ${nomeEmpresa(empresa)}`;

  async function alterarAtivo(v, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar item' : 'Inativar item', mensagem: ativo ? `Reativar ${v.nome}?` : `Inativar ${v.nome}? Ele some das escolhas, mas o histórico fica.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/envases/${v.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Item reativado' : 'Item inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Box size={15} className="icone-cartao" />Itens de envase {tituloEscopo}</h3>
          {grupo && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ width: 'auto', minWidth: 220 }} title="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          )}
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Novo item</button>}
        </div>
        <div className="alerta alerta-info">
          Frascos, tampas, rótulos, caixas: aqui é só o cadastro. A quantidade entra pelo <strong>Estoque</strong>, como entrada de compra.
          {ehFilial && <> Esta filial enxerga também os itens da matriz; só a matriz altera os dela.</>}
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum item de envase cadastrado" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Item</th><th>Empresa</th><th>Descrição</th><th>Status</th><th>Criado em</th><th>Atualizado em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((v) => (
                  <tr key={v.id} style={v.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{v.nome}</td>
                    <td>{empresaDe(v)}</td>
                    <td className="texto-suave">{v.descricao || '—'}</td>
                    <td><Badge cor={v.ativo ? 'verde' : 'cinza'}>{v.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td>{fmtDataHora(v.criado_em)}</td>
                    <td>{fmtDataHora(v.atualizado_em)}</td>
                    {podeEditar && v.origem === 'matriz' && <td className="acoes"><span className="texto-suave">só a matriz altera</span></td>}
                    {podeEditar && v.origem !== 'matriz' && (
                      <td className="acoes">
                        <button className="botao botao-secundario botao-mini" onClick={() => setEditando(v)}>Editar</button>
                        {v.ativo
                          ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(v, false)}>Inativar</button>
                          : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(v, true)}>Reativar</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && (
        <FormEnvase envase={editando.novo ? null : editando} aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Item salvo'); }} />
      )}
    </>
  );
}

function FormEnvase({ envase, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(envase ? { nome: envase.nome, descricao: envase.descricao || '' } : { nome: '', descricao: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    const corpo = { nome: f.nome, descricao: f.descricao || undefined };
    try {
      if (envase) await api(`/envases/${envase.id}`, { method: 'PUT', body: corpo });
      else await api('/envases', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={envase ? `Editar ${envase.nome}` : 'Novo item de envase'} largura={560} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus placeholder="ex.: Frasco 500 ml, Caixa 12 un" /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} /></Campo>
      </div>
      {envase && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={envase.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criado em" largura={170}><input value={fmtDataHora(envase.criado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

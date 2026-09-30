import React from 'react';
import { Percent } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, fmtQtd, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'administrativo', 'financeiro'];

// Impostos: nome e percentual, de cada empresa. A filial enxerga os da matriz; só a dona altera.
// Na etapa de custos do pedido, o percentual incide sobre o custo global da produção
export default function Impostos() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const { dados, erro, carregando, recarregar } = useDados(() => api(filtroEmpresa ? `/impostos?empresa=${filtroEmpresa}` : '/impostos?grupo=1'), [s.empresaId, filtroEmpresa]);
  const [editando, setEditando] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const grupo = s.empresas.length > 1;
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const empresaDe = (x) => (x.empresa_id === s.escopo?.matriz?.id ? `${x.empresa_nome} (matriz)` : x.empresa_nome);
  const tituloEscopo = grupo ? `do grupo ${s.escopo?.matriz?.nome || ''}` : `de ${nomeEmpresa(empresa)}`;

  async function alterarAtivo(t, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar imposto' : 'Inativar imposto', mensagem: ativo ? `Reativar ${t.nome}?` : `Inativar ${t.nome}? Ele some das escolhas; os pedidos que já o usam continuam com o percentual gravado.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/impostos/${t.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Imposto reativado' : 'Imposto inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Percent size={15} className="icone-cartao" />Impostos {tituloEscopo}</h3>
          {grupo && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ width: 'auto', minWidth: 220 }} title="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          )}
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Novo imposto</button>}
        </div>
        <div className="alerta alerta-info">
          Impostos com o percentual, usados na etapa de custos do pedido sobre o custo global da produção. A filial enxerga os impostos da matriz; só a matriz altera os dela.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum imposto cadastrado" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Imposto</th><th>Empresa</th><th className="num">Percentual</th><th>Status</th><th>Criado em</th><th>Atualizado em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((t) => (
                  <tr key={t.id} style={t.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{t.nome}</td>
                    <td>{empresaDe(t)}</td>
                    <td className="num">{fmtQtd(t.percentual, 4)} %</td>
                    <td><Badge cor={t.ativo ? 'verde' : 'cinza'}>{t.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td>{fmtDataHora(t.criado_em)}</td>
                    <td>{fmtDataHora(t.atualizado_em)}</td>
                    {podeEditar && t.origem === 'matriz' && <td className="acoes"><span className="texto-suave">só a matriz altera</span></td>}
                    {podeEditar && t.origem !== 'matriz' && (
                      <td className="acoes">
                        <button className="botao botao-secundario botao-mini" onClick={() => setEditando(t)}>Editar</button>
                        {t.ativo
                          ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(t, false)}>Inativar</button>
                          : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(t, true)}>Reativar</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && <FormImposto imposto={editando.novo ? null : editando} empresa={empresa} nomeEmpresa={nomeEmpresa} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Imposto salvo'); }} />}
    </>
  );
}

function FormImposto({ imposto, empresa, nomeEmpresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(imposto ? { nome: imposto.nome, percentual: imposto.percentual } : { nome: '', percentual: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));

  async function salvar() {
    setErro(null);
    const corpo = { nome: f.nome, percentual: Number(f.percentual) };
    try {
      if (imposto) await api(`/impostos/${imposto.id}`, { method: 'PUT', body: corpo });
      else await api('/impostos', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={imposto ? `Editar ${imposto.nome}` : 'Novo imposto'} largura={560} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus placeholder="ex.: ICMS, PIS, COFINS" /></Campo>
        <Campo rotulo="Percentual (%) *" largura={160}><input type="number" step="0.01" min="0" max="100" value={f.percentual} onChange={(e) => mudar('percentual', e.target.value)} /></Campo>
      </div>
      {!imposto && <div className="texto-suave">O imposto será cadastrado em <strong>{nomeEmpresa(empresa)}</strong>, a empresa ativa.</div>}
      {imposto && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={imposto.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criado em" largura={170}><input value={fmtDataHora(imposto.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizado em" largura={170}><input value={fmtDataHora(imposto.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

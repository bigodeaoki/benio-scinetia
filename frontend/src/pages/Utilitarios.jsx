import React from 'react';
import { Zap } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtBRL, fmtDataHora, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'administrativo', 'financeiro'];

// Utilitários: itens de utilidade de cada empresa (energia, água, gás…) com um valor em R$.
// Mesmo escopo do maquinário: a dona vê o grupo inteiro; os demais, a sua empresa.
export default function Utilitarios() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const { dados, erro, carregando, recarregar } = useDados(() => api('/utilitarios' + (filtroEmpresa ? `?empresa=${filtroEmpresa}` : '')), [s.empresaId, filtroEmpresa]);
  const [editando, setEditando] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const grupo = s.empresas.length > 1;
  const tituloEscopo = grupo ? `do grupo ${s.escopo?.matriz?.nome || ''}` : `de ${nomeEmpresa(empresa)}`;

  async function alterarAtivo(u, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar utilitário' : 'Inativar utilitário', mensagem: ativo ? `Reativar ${u.nome}?` : `Inativar ${u.nome}? Ele some das escolhas, mas o histórico fica.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/utilitarios/${u.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Utilitário reativado' : 'Utilitário inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Zap size={15} className="icone-cartao" />Utilitários {tituloEscopo}</h3>
          {grupo && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ width: 'auto', minWidth: 220 }} title="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          )}
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Novo utilitário</button>}
        </div>
        <div className="alerta alerta-info">
          Energia, água, gás, vapor e outros itens de utilidade de cada empresa, com o <strong>valor</strong> em R$. Cada utilitário pertence a uma empresa, matriz ou filial.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum utilitário cadastrado" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Utilitário</th><th>Empresa</th><th>Descrição</th><th className="num">Valor</th><th>Status</th><th>Criado em</th><th>Atualizado em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((u) => (
                  <tr key={u.id} style={u.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{u.nome}</td>
                    <td>{nomeEmpresa(s.empresas.find((x) => x.id === u.empresa_id)) || u.empresa_nome}</td>
                    <td className="texto-suave">{u.descricao || '—'}</td>
                    <td className="num">{fmtBRL(u.valor)}</td>
                    <td><Badge cor={u.ativo ? 'verde' : 'cinza'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td>{fmtDataHora(u.criado_em)}</td>
                    <td>{fmtDataHora(u.atualizado_em)}</td>
                    {podeEditar && (
                      <td className="acoes">
                        <button className="botao botao-secundario botao-mini" onClick={() => setEditando(u)}>Editar</button>
                        {u.ativo
                          ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(u, false)}>Inativar</button>
                          : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(u, true)}>Reativar</button>}
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
        <FormUtilitario utilitario={editando.novo ? null : editando} empresas={s.empresas} empresaAtiva={s.empresaId} ehDono={s.usuario?.papel === 'owner'}
          nomeEmpresa={nomeEmpresa} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Utilitário salvo'); }} />
      )}
    </>
  );
}

function FormUtilitario({ utilitario, empresas, empresaAtiva, ehDono, nomeEmpresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(utilitario
    ? { nome: utilitario.nome, descricao: utilitario.descricao || '', valor: utilitario.valor, empresa_id: utilitario.empresa_id }
    : { nome: '', descricao: '', valor: '', empresa_id: empresaAtiva });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }));
  const empresaEscolhida = empresas.find((e) => e.id === f.empresa_id);

  async function salvar() {
    setErro(null);
    const corpo = { nome: f.nome, descricao: f.descricao || undefined, valor: Number(f.valor), empresa_id: f.empresa_id };
    try {
      if (utilitario) await api(`/utilitarios/${utilitario.id}`, { method: 'PUT', body: corpo });
      else await api('/utilitarios', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={utilitario ? `Editar ${utilitario.nome}` : 'Novo utilitário'} largura={620} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus placeholder="ex.: Energia elétrica, Água, Gás" /></Campo>
        <Campo rotulo="Valor (R$) *" largura={170}><input type="number" step="0.0001" min="0" value={f.valor} onChange={(e) => mudar('valor', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Descrição" dica="Opcional: ex.: preço do kWh, do m³…"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Empresa *" dica={ehDono ? 'O utilitário pertence a esta empresa do grupo' : 'Utilitários pertencem à sua empresa'}>
          {ehDono
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={nomeEmpresa(empresaEscolhida)} readOnly />}
        </Campo>
      </div>
      {utilitario && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={utilitario.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criado em" largura={170}><input value={fmtDataHora(utilitario.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizado em" largura={170}><input value={fmtDataHora(utilitario.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

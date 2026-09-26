import React from 'react';
import { Cog } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtBRL, fmtDataHora, fmtQtd, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'producao', 'administrativo', 'financeiro'];

// Maquinário: máquinas e equipamentos da empresa ativa, com custo por hora
// (R$) e rendimento (%). Bem físico: a filial não vê as máquinas da matriz.
export default function Maquinas() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const { dados, erro, carregando, recarregar } = useDados(() => api('/maquinas' + (filtroEmpresa ? `?empresa=${filtroEmpresa}` : '')), [s.empresaId, filtroEmpresa]);
  const [editando, setEditando] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const grupo = s.empresas.length > 1;
  const tituloEscopo = grupo ? `do grupo ${s.escopo?.matriz?.nome || ''}` : `de ${nomeEmpresa(empresa)}`;

  async function alterarAtivo(m, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar máquina' : 'Inativar máquina', mensagem: ativo ? `Reativar ${m.titulo}?` : `Inativar ${m.titulo}? Ela some das escolhas, mas o histórico fica.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/maquinas/${m.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Máquina reativada' : 'Máquina inativada');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  function salvo(m) {
    setEditando(null);
    recarregar();
    toast.sucesso('Máquina salva');
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Cog size={15} className="icone-cartao" />Maquinário {tituloEscopo}</h3>
          {grupo && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ width: 'auto', minWidth: 220 }} title="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          )}
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Nova máquina</button>}
        </div>
        <div className="alerta alerta-info">
          Máquinas e equipamentos de cada empresa, com o <strong>custo por hora</strong> (energia, manutenção, depreciação…) e o <strong>rendimento</strong> em %:
          100 % é sem perda; 90 % quer dizer que 10 % do que entra se perde. Cada máquina pertence a uma empresa; a filial não enxerga as da matriz.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhuma máquina cadastrada" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Máquina</th><th>Empresa</th><th>Modelo</th><th>Descrição</th><th className="num">Custo/hora</th><th className="num">Rendimento</th><th>Status</th><th>Criada em</th><th>Atualizada em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((m) => (
                  <tr key={m.id} style={m.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{m.titulo}</td>
                    <td>{nomeEmpresa(s.empresas.find((x) => x.id === m.empresa_id)) || m.empresa_nome}</td>
                    <td>{m.modelo || '—'}</td>
                    <td className="texto-suave">{m.descricao || '—'}</td>
                    <td className="num">{fmtBRL(m.custo_hora)}</td>
                    <td className="num">{fmtQtd(m.rendimento_pct, 2)} %</td>
                    <td><Badge cor={m.ativo ? 'verde' : 'cinza'}>{m.ativo ? 'Ativa' : 'Inativa'}</Badge></td>
                    <td>{fmtDataHora(m.criado_em)}</td>
                    <td>{fmtDataHora(m.atualizado_em)}</td>
                    {podeEditar && (
                      <td className="acoes">
                        <button className="botao botao-secundario botao-mini" onClick={() => setEditando(m)}>Editar</button>
                        {m.ativo
                          ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(m, false)}>Inativar</button>
                          : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(m, true)}>Reativar</button>}
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
        <FormMaquina maquina={editando.novo ? null : editando} empresas={s.empresas} empresaAtiva={s.empresaId} ehDono={s.usuario?.papel === 'owner'}
          nomeEmpresa={nomeEmpresa} aoFechar={() => setEditando(null)} aoSalvar={salvo} />
      )}
    </>
  );
}

function FormMaquina({ maquina, empresas, empresaAtiva, ehDono, nomeEmpresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(maquina
    ? { titulo: maquina.titulo, modelo: maquina.modelo || '', descricao: maquina.descricao || '', empresa_id: maquina.empresa_id, custo_hora: maquina.custo_hora, rendimento_pct: maquina.rendimento_pct }
    : { titulo: '', modelo: '', descricao: '', empresa_id: empresaAtiva, custo_hora: '', rendimento_pct: 100 });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const empresaEscolhida = empresas.find((e) => e.id === f.empresa_id);

  async function salvar() {
    setErro(null);
    const corpo = {
      titulo: f.titulo, modelo: f.modelo || undefined, descricao: f.descricao || undefined, empresa_id: f.empresa_id,
      custo_hora: Number(f.custo_hora), rendimento_pct: Number(f.rendimento_pct),
    };
    try {
      const salva = maquina ? await api(`/maquinas/${maquina.id}`, { method: 'PUT', body: corpo }) : await api('/maquinas', { method: 'POST', body: corpo });
      aoSalvar(salva);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={maquina ? `Editar ${maquina.titulo}` : 'Nova máquina'} largura={680} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Título *"><input value={f.titulo} onChange={(e) => mudar('titulo', e.target.value)} autoFocus placeholder="ex.: Envasadora 01, Misturador 500 L" /></Campo>
        <Campo rotulo="Modelo" largura={220}><input value={f.modelo} onChange={(e) => mudar('modelo', e.target.value)} placeholder="ex.: EV-200" /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Empresa *" dica={ehDono ? 'A máquina pertence a esta empresa do grupo' : 'Máquinas pertencem à sua empresa'}>
          {ehDono
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={nomeEmpresa(empresaEscolhida)} readOnly />}
        </Campo>
        <Campo rotulo="Custo por hora (R$) *" largura={180}><input type="number" step="0.01" min="0" value={f.custo_hora} onChange={(e) => mudar('custo_hora', e.target.value)} /></Campo>
        <Campo rotulo="Rendimento (%) *" largura={160} dica="100 = sem perda"><input type="number" step="0.01" min="0.01" max="100" value={f.rendimento_pct} onChange={(e) => mudar('rendimento_pct', e.target.value)} /></Campo>
      </div>
      {maquina && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={maquina.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criada em" largura={170}><input value={fmtDataHora(maquina.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizada em" largura={170}><input value={fmtDataHora(maquina.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

import React from 'react';
import { Package } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'compras', 'producao', 'administrativo'];

export default function Materias() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  // Tela de cadastro: a dona vê o grupo inteiro (com filtro por empresa); os demais, a sua empresa e a matriz
  const [filtroEmpresa, setFiltroEmpresa] = React.useState('');
  const { dados, erro, carregando, recarregar } = useDados(() => api(filtroEmpresa ? `/materias?empresa=${filtroEmpresa}` : '/materias?grupo=1'), [s.empresaId, filtroEmpresa]);
  const [editando, setEditando] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const ehFilial = !!empresa?.filial;
  const grupo = s.empresas.length > 1;
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');
  const empresaDe = (x) => (x.empresa_id === s.escopo?.matriz?.id ? `${x.empresa_nome} (matriz)` : x.empresa_nome);
  const tituloEscopo = grupo ? `do grupo ${s.escopo?.matriz?.nome || ''}` : `de ${nomeEmpresa(empresa)}`;

  async function alterarAtivo(m, ativo) {
    const ok = await confirmar({
      titulo: ativo ? 'Reativar matéria-prima' : 'Inativar matéria-prima',
      mensagem: ativo ? `Reativar ${m.nome}?` : `Inativar ${m.nome}? Ela some das escolhas, mas o histórico fica.`,
      confirmarTexto: ativo ? 'Reativar' : 'Inativar',
      perigo: !ativo,
    });
    if (!ok) return;
    try {
      await api(`/materias/${m.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Matéria-prima reativada' : 'Matéria-prima inativada');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Package size={15} className="icone-cartao" />Matérias-primas {tituloEscopo}</h3>
          {grupo && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} style={{ width: 'auto', minWidth: 220 }} title="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
            </select>
          )}
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Nova matéria-prima</button>}
        </div>
        {ehFilial && (
          <div className="alerta alerta-info">
            Esta filial enxerga as matérias-primas da <strong>matriz</strong> ({s.escopo.matriz?.nome}) além das suas. As da matriz só a matriz altera.
          </div>
        )}
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhuma matéria-prima cadastrada" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Nome</th><th>Empresa</th><th>Unidade</th><th>Descrição</th><th>Status</th><th>Criada em</th><th>Atualizada em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((m) => (
                  <tr key={m.id} style={m.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{m.nome}</td>
                    <td>{empresaDe(m)}</td>
                    <td>{m.unidade}</td>
                    <td className="texto-suave">{m.descricao || '—'}</td>
                    <td><Badge cor={m.ativo ? 'verde' : 'cinza'}>{m.ativo ? 'Ativa' : 'Inativa'}</Badge></td>
                    <td>{fmtDataHora(m.criado_em)}</td>
                    <td>{fmtDataHora(m.atualizado_em)}</td>
                    {podeEditar && m.origem === 'matriz' && <td className="acoes"><span className="texto-suave">só a matriz altera</span></td>}
                    {podeEditar && m.origem !== 'matriz' && (
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
        <FormMateria
          materia={editando.novo ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Matéria-prima salva'); }}
        />
      )}
    </>
  );
}

function FormMateria({ materia, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(materia
    ? { nome: materia.nome, unidade: materia.unidade, descricao: materia.descricao || '' }
    : { nome: '', unidade: 'kg', descricao: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    const corpo = { nome: f.nome, unidade: f.unidade, descricao: f.descricao || undefined };
    try {
      if (materia) await api(`/materias/${materia.id}`, { method: 'PUT', body: corpo });
      else await api('/materias', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={materia ? `Editar ${materia.nome}` : 'Nova matéria-prima'} largura={620} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Unidade *" largura={120} dica="kg, L, un…"><input value={f.unidade} onChange={(e) => mudar('unidade', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} /></Campo>
      </div>
      {materia && (
        <div className="linha-campos">
          <Campo rotulo="Identificador" dica="UUID, usado em integrações e na auditoria"><input value={materia.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criada em" largura={170}><input value={fmtDataHora(materia.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizada em" largura={170}><input value={fmtDataHora(materia.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

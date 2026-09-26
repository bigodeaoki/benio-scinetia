import React from 'react';
import { FlaskConical } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, fmtQtd, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'farmacia'];

// Formulações: fórmulas da empresa (e da matriz, para a filial ver). O papel
// farmácia é o responsável; os demais consultam.
export default function Formulacoes() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const { dados, erro, carregando, recarregar } = useDados(() => api('/formulacoes'), [s.empresaId]);
  const { dados: materias } = useDados(() => api('/materias'), [s.empresaId]);
  const [editando, setEditando] = React.useState(null);
  const [aberta, setAberta] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const ehFilial = !!empresa?.filial;

  async function abrirEditar(f) {
    try {
      setEditando(await api(`/formulacoes/${f.id}`));
    } catch (e) {
      toast.erro(e.message);
    }
  }

  async function alterarAtivo(f, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar formulação' : 'Inativar formulação', mensagem: ativo ? `Reativar ${f.nome}?` : `Inativar ${f.nome}? Ela some das escolhas, mas o histórico fica.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/formulacoes/${f.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Formulação reativada' : 'Formulação inativada');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><FlaskConical size={15} className="icone-cartao" />Formulações de {empresa ? (empresa.matriz ? `${empresa.nome} (matriz)` : empresa.nome) : ''}</h3>
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Nova formulação</button>}
        </div>
        <div className="alerta alerta-info">
          Uma formulação é a lista de matérias-primas com quantidade, na ordem de adição. Quem mantém é o papel <strong>Farmácia</strong> (e o dono).
          {ehFilial && <> Esta filial enxerga também as formulações da matriz; só a matriz altera as dela.</>}
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhuma formulação cadastrada" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th style={{ width: 34 }}></th><th>Formulação</th>{ehFilial && <th>Origem</th>}<th className="num">Matérias-primas</th><th>Descrição</th><th>Status</th><th>Atualizada em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((f) => (
                  <React.Fragment key={f.id}>
                    <tr style={f.ativo ? undefined : { opacity: 0.55 }}>
                      <td>
                        <button className="botao botao-secundario botao-mini" style={{ width: 26, height: 26, padding: 0, justifyContent: 'center', lineHeight: 1 }}
                          title={aberta === f.id ? 'Ocultar itens' : 'Ver matérias-primas'} onClick={() => setAberta(aberta === f.id ? null : f.id)}>
                          {aberta === f.id ? '−' : '+'}
                        </button>
                      </td>
                      <td className="negrito">{f.nome}</td>
                      {ehFilial && <td><Badge cor={f.origem === 'matriz' ? 'azul' : 'cinza'}>{f.origem === 'matriz' ? 'Matriz' : 'Própria'}</Badge></td>}
                      <td className="num">{Number(f.itens) === 0 ? <Badge cor="amarelo">sem ingredientes</Badge> : f.itens}</td>
                      <td className="texto-suave">{f.descricao || '—'}</td>
                      <td><Badge cor={f.ativo ? 'verde' : 'cinza'}>{f.ativo ? 'Ativa' : 'Inativa'}</Badge></td>
                      <td>{fmtDataHora(f.atualizado_em)}</td>
                      {podeEditar && f.origem === 'matriz' && <td className="acoes"><span className="texto-suave">só a matriz altera</span></td>}
                      {podeEditar && f.origem !== 'matriz' && (
                        <td className="acoes">
                          <button className="botao botao-secundario botao-mini" onClick={() => abrirEditar(f)}>Editar</button>
                          {f.ativo
                            ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(f, false)}>Inativar</button>
                            : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(f, true)}>Reativar</button>}
                        </td>
                      )}
                    </tr>
                    {aberta === f.id && (
                      <tr><td colSpan={podeEditar ? 8 : 7} style={{ background: '#f8fafc' }}><Itens id={f.id} /></td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && (
        <FormFormulacao formulacao={editando.novo ? null : editando} materias={(materias || []).filter((m) => m.ativo)}
          aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Formulação salva'); }} />
      )}
    </>
  );
}

// Itens da formulação, carregados ao abrir a linha
function Itens({ id }) {
  const { dados, erro, carregando } = useDados(() => api(`/formulacoes/${id}`), [id]);
  if (carregando) return <Carregando />;
  if (erro) return <Erro msg={erro} />;
  return (
    <table className="tabela" style={{ margin: '6px 0' }}>
      <thead><tr><th className="num">#</th><th>Matéria-prima</th><th className="num">Quantidade</th></tr></thead>
      <tbody>
        {dados.itens.map((i) => (
          <tr key={i.materia_prima_id}>
            <td className="num">{i.ordem}</td>
            <td>{i.materia_nome}{!i.materia_ativa && <Badge cor="cinza"> inativa</Badge>}</td>
            <td className="num">{fmtQtd(i.quantidade, 4)} {i.unidade}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FormFormulacao({ formulacao, materias, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(formulacao
    ? { nome: formulacao.nome, descricao: formulacao.descricao || '', itens: formulacao.itens.map((i) => ({ materia_prima_id: i.materia_prima_id, quantidade: i.quantidade, unidade: i.unidade })) }
    : { nome: '', descricao: '', itens: [{ materia_prima_id: materias[0]?.id || '', quantidade: '', unidade: materias[0]?.unidade || '' }] });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const mudarItem = (i, campo, valor) => setF((s) => ({ ...s, itens: s.itens.map((it, j) => (j === i ? { ...it, [campo]: valor } : it)) }));
  // Trocar a matéria-prima sugere a unidade dela
  const mudarMateria = (i, id) => {
    const mp = materias.find((m) => m.id === id);
    setF((s) => ({ ...s, itens: s.itens.map((it, j) => (j === i ? { ...it, materia_prima_id: id, unidade: mp?.unidade || it.unidade } : it)) }));
  };
  const remover = (i) => setF((s) => ({ ...s, itens: s.itens.filter((_, j) => j !== i) }));
  const adicionar = () => setF((s) => ({ ...s, itens: [...s.itens, { materia_prima_id: materias[0]?.id || '', quantidade: '', unidade: materias[0]?.unidade || '' }] }));
  const mover = (i, delta) => setF((s) => {
    const itens = s.itens.slice();
    const j = i + delta;
    if (j < 0 || j >= itens.length) return s;
    [itens[i], itens[j]] = [itens[j], itens[i]];
    return { ...s, itens };
  });

  async function salvar() {
    setErro(null);
    const corpo = {
      nome: f.nome, descricao: f.descricao || undefined,
      itens: f.itens.map((it) => ({ materia_prima_id: it.materia_prima_id, quantidade: Number(it.quantidade), unidade: it.unidade || undefined })),
    };
    try {
      if (formulacao) await api(`/formulacoes/${formulacao.id}`, { method: 'PUT', body: corpo });
      else await api('/formulacoes', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={formulacao ? `Editar ${formulacao.nome}` : 'Nova formulação'} largura={760} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar formulação</button></>}
    >
      <Erro msg={erro} />
      {!materias.length && <div className="alerta alerta-aviso">Cadastre matérias-primas antes de montar uma formulação.</div>}
      <div className="linha-campos">
        <Campo rotulo="Nome *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} /></Campo>
      </div>
      <h3 style={{ margin: '12px 0 8px' }}>Matérias-primas, na ordem de adição</h3>
      {f.itens.map((it, i) => (
        <div className="linha-campos" key={i}>
          <Campo rotulo={i === 0 ? '#' : ''} largura={36}><input value={i + 1} readOnly /></Campo>
          <Campo rotulo={i === 0 ? 'Matéria-prima' : ''}>
            <select value={it.materia_prima_id} onChange={(e) => mudarMateria(i, e.target.value)}>
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.origem === 'matriz' ? ' (da matriz)' : ''}</option>)}
            </select>
          </Campo>
          <Campo rotulo={i === 0 ? 'Quantidade' : ''} largura={130}><input type="number" step="any" min="0" value={it.quantidade} onChange={(e) => mudarItem(i, 'quantidade', e.target.value)} /></Campo>
          <Campo rotulo={i === 0 ? 'Unidade' : ''} largura={100}><input value={it.unidade} onChange={(e) => mudarItem(i, 'unidade', e.target.value)} /></Campo>
          <Campo rotulo={i === 0 ? ' ' : ''} largura={118}>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="botao botao-secundario botao-mini" style={{ height: 34 }} title="Subir" onClick={() => mover(i, -1)}>↑</button>
              <button type="button" className="botao botao-secundario botao-mini" style={{ height: 34 }} title="Descer" onClick={() => mover(i, 1)}>↓</button>
              <button type="button" className="botao botao-perigo botao-mini" style={{ height: 34 }} title="Remover" onClick={() => remover(i)}>×</button>
            </span>
          </Campo>
        </div>
      ))}
      <button type="button" className="botao botao-secundario botao-mini" onClick={adicionar}>+ Adicionar matéria-prima</button>
      {formulacao && (
        <div className="linha-campos" style={{ marginTop: 12 }}>
          <Campo rotulo="Identificador"><input value={formulacao.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criada em" largura={170}><input value={fmtDataHora(formulacao.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizada em" largura={170}><input value={fmtDataHora(formulacao.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

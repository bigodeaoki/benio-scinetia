import React from 'react';
import { Boxes } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtData, fmtDataHora, fmtQtd, hoje, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'compras', 'producao', 'administrativo', 'operador'];

// Vencimento: vermelho se passou, amarelo se vence em 30 dias
function Vencimento({ e }) {
  if (!e.data_vencimento) return <span className="texto-suave">—</span>;
  const dias = Number(e.dias_para_vencer);
  const cor = dias < 0 ? 'vermelho' : dias <= 30 ? 'amarelo' : 'verde';
  const texto = dias < 0 ? `vencida há ${-dias} dia(s)` : dias === 0 ? 'vence hoje' : `${dias} dia(s)`;
  return <>{fmtData(e.data_vencimento)} <Badge cor={cor}>{texto}</Badge></>;
}

export default function Estoque() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const { dados, erro, carregando, recarregar } = useDados(() => api('/estoque'), [s.empresaId]);
  const { dados: resumo, recarregar: recarregarResumo } = useDados(() => api('/estoque/resumo'), [s.empresaId]);
  const { dados: materias } = useDados(() => api('/materias'), [s.empresaId]);
  const [editando, setEditando] = React.useState(null);
  const [filtro, setFiltro] = React.useState('');
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const atualizar = () => { recarregar(); recarregarResumo(); };
  const linhas = (dados || []).filter((e) => !filtro || e.materia_prima_id === filtro);

  async function alterarAtivo(e, ativo) {
    const ok = await confirmar({
      titulo: ativo ? 'Restaurar entrada' : 'Cancelar entrada',
      mensagem: ativo ? `Restaurar a entrada de ${fmtQtd(e.quantidade)} ${e.unidade} de ${e.materia_nome}?` : `Cancelar a entrada de ${fmtQtd(e.quantidade)} ${e.unidade} de ${e.materia_nome}? Ela sai dos totais, mas fica no histórico.`,
      confirmarTexto: ativo ? 'Restaurar' : 'Cancelar entrada',
      perigo: !ativo,
    });
    if (!ok) return;
    try {
      await api(`/estoque/${e.id}/ativo`, { method: 'PUT', body: { ativo } });
      atualizar();
      toast.sucesso(ativo ? 'Entrada restaurada' : 'Entrada cancelada');
    } catch (err) {
      toast.erro(err.message);
    }
  }

  return (
    <>
      {!!resumo?.length && (
        <div className="grade-kpis">
          {resumo.map((r) => (
            <div className="kpi" key={`${r.materia_prima_id}-${r.unidade}`}>
              <div className="kpi-rotulo">{r.materia_nome}</div>
              <div className="kpi-valor">{fmtQtd(r.total)} <span style={{ fontSize: 14 }}>{r.unidade}</span></div>
              <div className="kpi-extra">
                {r.entradas} entrada(s)
                {r.proximo_vencimento ? ` · próximo vencimento ${fmtData(r.proximo_vencimento)}` : ''}
                {Number(r.entradas_vencidas) > 0 ? ` · ${r.entradas_vencidas} vencida(s)` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Boxes size={15} className="icone-cartao" />Estoque de {empresa ? (empresa.matriz ? `${empresa.nome} (matriz)` : empresa.nome) : ''}</h3>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 'auto', minWidth: 200 }} title="Filtrar por matéria-prima">
            <option value="">Todas as matérias-primas</option>
            {(materias || []).map((m) => <option key={m.id} value={m.id}>{m.nome}{m.origem === 'matriz' ? ' (matriz)' : ''}</option>)}
          </select>
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Nova entrada</button>}
        </div>
        <div className="alerta alerta-info">
          Cada entrada é uma compra: quantidade na unidade que você usar, data da compra e vencimento. O estoque é de cada empresa;
          a matéria-prima pode ser própria ou da matriz. Entrada errada é <strong>cancelada</strong>, nunca apagada.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !linhas.length ? <Vazio msg="Nenhuma entrada de estoque" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Matéria-prima</th><th className="num">Quantidade</th><th>Compra</th><th>Vencimento</th><th>Status</th><th>Criada em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {linhas.map((e) => (
                  <tr key={e.id} style={e.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{e.materia_nome}</td>
                    <td className="num">{fmtQtd(e.quantidade)} {e.unidade}</td>
                    <td>{fmtData(e.data_compra)}</td>
                    <td><Vencimento e={e} /></td>
                    <td><Badge cor={e.ativo ? 'verde' : 'cinza'}>{e.ativo ? 'Ativa' : 'Cancelada'}</Badge></td>
                    <td>{fmtDataHora(e.criado_em)}</td>
                    {podeEditar && (
                      <td className="acoes">
                        <button className="botao botao-secundario botao-mini" onClick={() => setEditando(e)}>Editar</button>
                        {e.ativo
                          ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(e, false)}>Cancelar</button>
                          : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(e, true)}>Restaurar</button>}
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
        <FormEntrada entrada={editando.novo ? null : editando} materias={(materias || []).filter((m) => m.ativo)}
          aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); atualizar(); toast.sucesso('Entrada salva'); }} />
      )}
    </>
  );
}

function FormEntrada({ entrada, materias, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(entrada
    ? { materia_prima_id: entrada.materia_prima_id, quantidade: entrada.quantidade, unidade: entrada.unidade, data_compra: String(entrada.data_compra).slice(0, 10), data_vencimento: entrada.data_vencimento ? String(entrada.data_vencimento).slice(0, 10) : '' }
    : { materia_prima_id: materias[0]?.id || '', quantidade: '', unidade: materias[0]?.unidade || '', data_compra: hoje(), data_vencimento: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  // Trocar a matéria-prima sugere a unidade dela; a empresa pode sobrescrever
  const mudarMateria = (id) => {
    const mp = materias.find((m) => m.id === id);
    setF((s) => ({ ...s, materia_prima_id: id, unidade: mp?.unidade || s.unidade }));
  };

  async function salvar() {
    setErro(null);
    const corpo = { materia_prima_id: f.materia_prima_id, quantidade: Number(f.quantidade), unidade: f.unidade || undefined, data_compra: f.data_compra, data_vencimento: f.data_vencimento || undefined };
    try {
      if (entrada) await api(`/estoque/${entrada.id}`, { method: 'PUT', body: corpo });
      else await api('/estoque', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={entrada ? 'Editar entrada' : 'Nova entrada de estoque'} largura={640} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar entrada</button></>}
    >
      <Erro msg={erro} />
      {!materias.length && <div className="alerta alerta-aviso">Cadastre uma matéria-prima antes de lançar estoque.</div>}
      <div className="linha-campos">
        <Campo rotulo="Matéria-prima *">
          <select value={f.materia_prima_id} onChange={(e) => mudarMateria(e.target.value)} autoFocus>
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.origem === 'matriz' ? ' (da matriz)' : ''}</option>)}
          </select>
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Quantidade *" largura={160}><input type="number" step="any" min="0" value={f.quantidade} onChange={(e) => mudar('quantidade', e.target.value)} /></Campo>
        <Campo rotulo="Unidade *" largura={120} dica="kg, L, un…"><input value={f.unidade} onChange={(e) => mudar('unidade', e.target.value)} /></Campo>
        <Campo rotulo="Data da compra *" largura={170}><input type="date" value={f.data_compra} onChange={(e) => mudar('data_compra', e.target.value)} /></Campo>
        <Campo rotulo="Vencimento" largura={170}><input type="date" value={f.data_vencimento} onChange={(e) => mudar('data_vencimento', e.target.value)} /></Campo>
      </div>
      {entrada && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={entrada.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criada em" largura={170}><input value={fmtDataHora(entrada.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizada em" largura={170}><input value={fmtDataHora(entrada.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

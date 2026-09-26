import React from 'react';
import { Truck } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtBRL, fmtData, fmtDataHora, hoje, toast, useDados } from '../ui.jsx';

const PODE_EDITAR = ['owner', 'administrativo', 'financeiro'];
const STATUS = { disponivel: ['Disponível', 'verde'], em_uso: ['Em uso', 'azul'], manutencao: ['Em manutenção', 'amarelo'] };
const TIPOS_SUGERIDOS = ['Caminhão', 'Carro', 'Van', 'Utilitário', 'Moto', 'Empilhadeira'];
const nomeVeiculo = (v) => [v.tipo, v.marca, v.modelo, v.ano].filter(Boolean).join(' ');

// Logística: veículos da empresa ativa (caminhão, carro ou qualquer meio de
// transporte), com custo por hora, status operacional e última manutenção.
export default function Logistica() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_EDITAR.includes(s.usuario?.papel);
  const { dados, erro, carregando, recarregar } = useDados(() => api('/veiculos'), [s.empresaId]);
  const [editando, setEditando] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');

  async function alterarAtivo(v, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar veículo' : 'Inativar veículo', mensagem: ativo ? `Reativar ${nomeVeiculo(v)}?` : `Inativar ${nomeVeiculo(v)}? Ele some das escolhas, mas o histórico fica.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/veiculos/${v.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Veículo reativado' : 'Veículo inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  function salvo(v) {
    setEditando(null);
    recarregar();
    toast.sucesso(v.empresa_id === s.empresaId ? 'Veículo salvo' : `Veículo salvo em ${v.empresa_nome}: troque a empresa ativa para vê-lo`);
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Truck size={15} className="icone-cartao" />Logística de {nomeEmpresa(empresa)}</h3>
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Novo veículo</button>}
        </div>
        <div className="alerta alerta-info">
          Caminhões, carros, vans ou qualquer meio de transporte da empresa, com o <strong>custo por hora</strong> (combustível, motorista, depreciação…), o status do momento e a última manutenção.
          Cada veículo pertence a uma empresa; a filial não enxerga os da matriz.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum veículo cadastrado" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Tipo</th><th>Marca / modelo</th><th className="num">Ano</th><th>Placa</th><th className="num">Custo/hora</th><th>Status</th><th>Última manutenção</th><th>Criado em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((v) => (
                  <tr key={v.id} style={v.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{v.tipo}</td>
                    <td>{[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}</td>
                    <td className="num">{v.ano || '—'}</td>
                    <td className="mono">{v.placa || '—'}</td>
                    <td className="num">{fmtBRL(v.custo_hora)}</td>
                    <td>{v.ativo ? <Badge cor={STATUS[v.status]?.[1] || 'cinza'}>{STATUS[v.status]?.[0] || v.status}</Badge> : <Badge cor="cinza">Inativo</Badge>}</td>
                    <td>{v.ultima_manutencao ? <>{fmtData(v.ultima_manutencao)} <Badge cor={Number(v.dias_desde_manutencao) > 180 ? 'amarelo' : 'cinza'}>há {v.dias_desde_manutencao} dia(s)</Badge></> : <span className="texto-suave">—</span>}</td>
                    <td>{fmtDataHora(v.criado_em)}</td>
                    {podeEditar && (
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
        <FormVeiculo veiculo={editando.novo ? null : editando} empresas={s.empresas} empresaAtiva={s.empresaId} ehDono={s.usuario?.papel === 'owner'}
          nomeEmpresa={nomeEmpresa} aoFechar={() => setEditando(null)} aoSalvar={salvo} />
      )}
    </>
  );
}

function FormVeiculo({ veiculo, empresas, empresaAtiva, ehDono, nomeEmpresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(veiculo
    ? { tipo: veiculo.tipo, marca: veiculo.marca || '', modelo: veiculo.modelo || '', ano: veiculo.ano || '', placa: veiculo.placa || '', empresa_id: veiculo.empresa_id, custo_hora: veiculo.custo_hora, status: veiculo.status, ultima_manutencao: veiculo.ultima_manutencao || '' }
    : { tipo: '', marca: '', modelo: '', ano: '', placa: '', empresa_id: empresaAtiva, custo_hora: '', status: 'disponivel', ultima_manutencao: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const empresaEscolhida = empresas.find((e) => e.id === f.empresa_id);

  async function salvar() {
    setErro(null);
    const corpo = {
      tipo: f.tipo, marca: f.marca || undefined, modelo: f.modelo || undefined, ano: f.ano === '' ? undefined : Number(f.ano), placa: f.placa || undefined,
      empresa_id: f.empresa_id, custo_hora: Number(f.custo_hora), status: f.status, ultima_manutencao: f.ultima_manutencao || undefined,
    };
    try {
      const salvo = veiculo ? await api(`/veiculos/${veiculo.id}`, { method: 'PUT', body: corpo }) : await api('/veiculos', { method: 'POST', body: corpo });
      aoSalvar(salvo);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={veiculo ? `Editar ${nomeVeiculo(veiculo)}` : 'Novo veículo'} largura={720} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Tipo *" largura={200} dica="Caminhão, carro, van ou outro">
          <input list="tipos-veiculo" value={f.tipo} onChange={(e) => mudar('tipo', e.target.value)} autoFocus placeholder="ex.: Caminhão" />
          <datalist id="tipos-veiculo">{TIPOS_SUGERIDOS.map((t) => <option key={t} value={t} />)}</datalist>
        </Campo>
        <Campo rotulo="Marca"><input value={f.marca} onChange={(e) => mudar('marca', e.target.value)} placeholder="ex.: Volvo" /></Campo>
        <Campo rotulo="Modelo"><input value={f.modelo} onChange={(e) => mudar('modelo', e.target.value)} placeholder="ex.: FH 540" /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Ano" largura={110}><input type="number" min="1900" max={new Date().getFullYear() + 1} step="1" value={f.ano} onChange={(e) => mudar('ano', e.target.value)} /></Campo>
        <Campo rotulo="Placa" largura={150}><input value={f.placa} onChange={(e) => mudar('placa', e.target.value)} placeholder="ABC1D23" className="mono" /></Campo>
        <Campo rotulo="Empresa *" dica={ehDono ? 'O veículo pertence a esta empresa do grupo' : 'Veículos pertencem à sua empresa'}>
          {ehDono
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={nomeEmpresa(empresaEscolhida)} readOnly />}
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Custo por hora (R$) *" largura={180}><input type="number" step="0.01" min="0" value={f.custo_hora} onChange={(e) => mudar('custo_hora', e.target.value)} /></Campo>
        <Campo rotulo="Status *" largura={180}>
          <select value={f.status} onChange={(e) => mudar('status', e.target.value)}>{Object.entries(STATUS).map(([valor, [rotulo]]) => <option key={valor} value={valor}>{rotulo}</option>)}</select>
        </Campo>
        <Campo rotulo="Última manutenção" largura={180}><input type="date" max={hoje()} value={f.ultima_manutencao} onChange={(e) => mudar('ultima_manutencao', e.target.value)} /></Campo>
      </div>
      {veiculo && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={veiculo.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criado em" largura={170}><input value={fmtDataHora(veiculo.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizado em" largura={170}><input value={fmtDataHora(veiculo.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

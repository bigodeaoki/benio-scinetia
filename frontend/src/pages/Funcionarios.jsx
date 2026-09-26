import React from 'react';
import { HardHat } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtBRL, fmtData, fmtDataHora, toast, useDados } from '../ui.jsx';

// Quem vê e mantém a mão de obra: custo-hora e documento são sensíveis
export const PODE_VER_FUNCIONARIOS = ['owner', 'administrativo', 'financeiro'];
const STATUS = { ativo: ['Ativo', 'verde'], ferias: ['Férias', 'azul'], afastado: ['Afastado', 'amarelo'], desligado: ['Desligado', 'cinza'] };
const CATEGORIAS_SUGERIDAS = ['Produção', 'Financeiro', 'Marketing', 'Administrativo', 'Vendas', 'Compras', 'Logística', 'Qualidade', 'Manutenção', 'Farmácia', 'RH'];
// CPF (11 dígitos) com máscara; outros documentos como estão
const fmtDoc = (d) => (d && /^\d{11}$/.test(d) ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d || '—');

// Mão de obra: funcionários da empresa ativa, com categoria, custo por hora e
// situação de RH. Não confundir com os usuários do sistema (logins).
export default function Funcionarios() {
  const s = React.useContext(SessaoContext);
  const podeEditar = PODE_VER_FUNCIONARIOS.includes(s.usuario?.papel);
  const { dados, erro, carregando, recarregar } = useDados(() => api('/funcionarios'), [s.empresaId]);
  const [editando, setEditando] = React.useState(null);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);
  const nomeEmpresa = (e) => (e ? (e.matriz ? `${e.nome} (matriz)` : e.nome) : '');

  async function alterarAtivo(f, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar registro' : 'Inativar registro', mensagem: ativo ? `Reativar o registro de ${f.nome}?` : `Inativar o registro de ${f.nome}? Ele some das escolhas, mas o histórico fica. Para desligamento, use o status.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/funcionarios/${f.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Registro reativado' : 'Registro inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  function salvo(f) {
    setEditando(null);
    recarregar();
    toast.sucesso(f.empresa_id === s.empresaId ? 'Funcionário salvo' : `Funcionário salvo em ${f.empresa_nome}: troque a empresa ativa para vê-lo`);
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><HardHat size={15} className="icone-cartao" />Mão de obra de {nomeEmpresa(empresa)}</h3>
          {podeEditar && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Novo funcionário</button>}
        </div>
        <div className="alerta alerta-info">
          Funcionários de cada empresa, com a <strong>categoria</strong> (produção, financeiro, marketing…) e o <strong>custo por hora</strong> usado no custeio.
          Não é o acesso ao sistema: quem precisa entrar no app é cadastrado em Usuários. Só dono, administrativo e financeiro veem esta tela.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhum funcionário cadastrado" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Nome</th><th>Documento</th><th>E-mail</th><th>Categoria</th><th className="num">Custo/hora</th><th>Admissão</th><th>Status</th><th>Criado em</th>{podeEditar && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((f) => (
                  <tr key={f.id} style={f.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{f.nome}</td>
                    <td className="mono">{fmtDoc(f.documento)}</td>
                    <td>{f.email || '—'}</td>
                    <td>{f.categoria}</td>
                    <td className="num">{fmtBRL(f.custo_hora)}</td>
                    <td>{f.data_admissao ? fmtData(f.data_admissao) : '—'}</td>
                    <td>{f.ativo ? <Badge cor={STATUS[f.status]?.[1] || 'cinza'}>{STATUS[f.status]?.[0] || f.status}</Badge> : <Badge cor="cinza">Registro inativo</Badge>}</td>
                    <td>{fmtDataHora(f.criado_em)}</td>
                    {podeEditar && (
                      <td className="acoes">
                        <button className="botao botao-secundario botao-mini" onClick={() => setEditando(f)}>Editar</button>
                        {f.ativo
                          ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(f, false)}>Inativar</button>
                          : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(f, true)}>Reativar</button>}
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
        <FormFuncionario funcionario={editando.novo ? null : editando} empresas={s.empresas} empresaAtiva={s.empresaId} ehDono={s.usuario?.papel === 'owner'}
          nomeEmpresa={nomeEmpresa} aoFechar={() => setEditando(null)} aoSalvar={salvo} />
      )}
    </>
  );
}

function FormFuncionario({ funcionario, empresas, empresaAtiva, ehDono, nomeEmpresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(funcionario
    ? { nome: funcionario.nome, documento: funcionario.documento || '', email: funcionario.email || '', categoria: funcionario.categoria, empresa_id: funcionario.empresa_id, custo_hora: funcionario.custo_hora, data_admissao: funcionario.data_admissao || '', status: funcionario.status }
    : { nome: '', documento: '', email: '', categoria: '', empresa_id: empresaAtiva, custo_hora: '', data_admissao: '', status: 'ativo' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const empresaEscolhida = empresas.find((e) => e.id === f.empresa_id);

  async function salvar() {
    setErro(null);
    const corpo = {
      nome: f.nome, documento: f.documento || undefined, email: f.email || undefined, categoria: f.categoria, empresa_id: f.empresa_id,
      custo_hora: Number(f.custo_hora), data_admissao: f.data_admissao || undefined, status: f.status,
    };
    try {
      const salvo = funcionario ? await api(`/funcionarios/${funcionario.id}`, { method: 'PUT', body: corpo }) : await api('/funcionarios', { method: 'POST', body: corpo });
      aoSalvar(salvo);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={funcionario ? `Editar ${funcionario.nome}` : 'Novo funcionário'} largura={720} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Documento" largura={190} dica="CPF ou outro"><input value={f.documento} onChange={(e) => mudar('documento', e.target.value)} placeholder="000.000.000-00" className="mono" /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={(e) => mudar('email', e.target.value)} /></Campo>
        <Campo rotulo="Categoria *" largura={220} dica="Financeiro, marketing, produção…">
          <input list="categorias-funcionario" value={f.categoria} onChange={(e) => mudar('categoria', e.target.value)} placeholder="ex.: Produção" />
          <datalist id="categorias-funcionario">{CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}</datalist>
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Empresa *" dica={ehDono ? 'O funcionário pertence a esta empresa do grupo' : 'Funcionários pertencem à sua empresa'}>
          {ehDono
            ? <select value={f.empresa_id} onChange={(e) => mudar('empresa_id', e.target.value)}>{empresas.map((e) => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}</select>
            : <input value={nomeEmpresa(empresaEscolhida)} readOnly />}
        </Campo>
        <Campo rotulo="Custo por hora (R$) *" largura={170}><input type="number" step="0.01" min="0" value={f.custo_hora} onChange={(e) => mudar('custo_hora', e.target.value)} /></Campo>
        <Campo rotulo="Admissão" largura={160}><input type="date" value={f.data_admissao} onChange={(e) => mudar('data_admissao', e.target.value)} /></Campo>
        <Campo rotulo="Status *" largura={150}>
          <select value={f.status} onChange={(e) => mudar('status', e.target.value)}>{Object.entries(STATUS).map(([valor, [rotulo]]) => <option key={valor} value={valor}>{rotulo}</option>)}</select>
        </Campo>
      </div>
      {funcionario && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={funcionario.id} readOnly className="mono" /></Campo>
          <Campo rotulo="Criado em" largura={170}><input value={fmtDataHora(funcionario.criado_em)} readOnly /></Campo>
          <Campo rotulo="Atualizado em" largura={170}><input value={fmtDataHora(funcionario.atualizado_em)} readOnly /></Campo>
        </div>
      )}
    </Modal>
  );
}

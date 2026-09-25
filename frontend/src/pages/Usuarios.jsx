import React from 'react';
import { Users } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { PAPEIS, PAPEL_ROTULOS } from '../dados.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';

export default function Usuarios() {
  const s = React.useContext(SessaoContext);
  const { dados, erro, carregando, recarregar } = useDados(() => api('/usuarios'));
  const [editando, setEditando] = React.useState(null);

  async function alterarAtivo(u, ativo) {
    const ok = await confirmar({
      titulo: ativo ? 'Reativar usuário' : 'Inativar usuário',
      mensagem: ativo ? `Reativar o acesso de ${u.nome}?` : `Inativar ${u.nome}? A pessoa perde o acesso, mas o histórico dela fica.`,
      confirmarTexto: ativo ? 'Reativar' : 'Inativar',
      perigo: !ativo,
    });
    if (!ok) return;
    try {
      await api(`/usuarios/${u.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Usuário reativado' : 'Usuário inativado');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Users size={15} className="icone-cartao" />Usuários da conta</h3>
          <button className="botao" onClick={() => setEditando({ novo: true })}>+ Novo usuário</button>
        </div>
        <div className="alerta alerta-info">
          O <strong>papel</strong> define o que cada pessoa pode alterar: {PAPEIS.map((p) => p.rotulo).join(' · ')}.
          Usuários não são excluídos, apenas inativados.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Último acesso</th><th className="acoes">Ações</th></tr></thead>
              <tbody>
                {dados.map((u) => (
                  <tr key={u.id} style={u.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{u.nome}</td>
                    <td>{u.email}</td>
                    <td><Badge cor="azul">{PAPEL_ROTULOS[u.papel] || u.papel}</Badge></td>
                    <td><Badge cor={u.ativo ? 'verde' : 'cinza'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td>{fmtDataHora(u.ultimo_login_em)}</td>
                    <td className="acoes">
                      <button className="botao botao-secundario botao-mini" onClick={() => setEditando(u)}>Editar</button>
                      {u.id !== s.usuario.id && (u.ativo
                        ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(u, false)}>Inativar</button>
                        : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(u, true)}>Reativar</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && (
        <FormUsuario
          usuario={editando.novo ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Usuário salvo'); }}
        />
      )}
    </>
  );
}

function FormUsuario({ usuario, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(usuario
    ? { nome: usuario.nome, email: usuario.email, senha: '', papel: usuario.papel }
    : { nome: '', email: '', senha: '', papel: 'operador' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));
  const info = PAPEIS.find((p) => p.valor === f.papel);

  async function salvar() {
    setErro(null);
    const corpo = { nome: f.nome, email: f.email, papel: f.papel, senha: f.senha || undefined };
    try {
      if (usuario) await api(`/usuarios/${usuario.id}`, { method: 'PUT', body: corpo });
      else await api('/usuarios', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={usuario ? `Editar ${usuario.nome}` : 'Novo usuário'} largura={620} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar usuário</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome completo *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} /></Campo>
        <Campo rotulo="E-mail *"><input type="email" value={f.email} onChange={(e) => mudar('email', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo={usuario ? 'Nova senha (vazio = manter)' : 'Senha *'} dica="mínimo de 8 caracteres">
          <input type="password" value={f.senha} onChange={(e) => mudar('senha', e.target.value)} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Papel *">
          <select value={f.papel} onChange={(e) => mudar('papel', e.target.value)}>{PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}</select>
        </Campo>
      </div>
      {info && <div className="alerta alerta-info">{info.rotulo}: {info.descricao}</div>}
    </Modal>
  );
}

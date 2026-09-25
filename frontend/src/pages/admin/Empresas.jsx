import React from 'react';
import { Building2 } from 'lucide-react';
import { api } from '../../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../../ui.jsx';

// Visão do admin: matrizes com seus donos. Filial é do dono, não aparece para cadastrar aqui.
export default function AdminEmpresas() {
  const { dados, erro, carregando, recarregar } = useDados(() => api('/admin/empresas'));
  const [editando, setEditando] = React.useState(null);

  async function alterarAtivo(e, ativo) {
    const ok = await confirmar({
      titulo: ativo ? 'Reativar empresa' : 'Suspender empresa',
      mensagem: ativo ? `Reativar ${e.nome}?` : `Suspender ${e.nome}? Dono, filiais e usuários do grupo perdem o acesso até a reativação.`,
      confirmarTexto: ativo ? 'Reativar' : 'Suspender',
      perigo: !ativo,
    });
    if (!ok) return;
    try {
      await api(`/admin/empresas/${e.id}/ativo`, { method: 'PUT', body: { ativo } });
      recarregar();
      toast.sucesso(ativo ? 'Empresa reativada' : 'Empresa suspensa');
    } catch (err) {
      toast.erro(err.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Building2 size={15} className="icone-cartao" />Empresas (matrizes)</h3>
          <button className="botao" onClick={() => setEditando({ novo: true })}>+ Nova empresa com dono</button>
        </div>
        <div className="alerta alerta-info">
          Toda empresa nasce com um <strong>dono</strong>, que entra com o e-mail e a senha definidos aqui.
          Filiais e usuários operacionais são cadastrados pelo dono, dentro do grupo dele.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio msg="Nenhuma empresa cadastrada" /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead><tr><th>Empresa</th><th>CNPJ</th><th>Donos</th><th className="num">Filiais</th><th className="num">Usuários</th><th>Status</th><th>Criada em</th><th className="acoes">Ações</th></tr></thead>
              <tbody>
                {dados.map((e) => (
                  <tr key={e.id} style={e.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{e.nome}</td>
                    <td className="mono">{e.cnpj || '—'}</td>
                    <td>{e.donos.length ? e.donos.map((d) => `${d.nome} (${d.email})`).join(', ') : <span className="texto-suave">sem dono</span>}</td>
                    <td className="num">{e.filiais}</td>
                    <td className="num">{e.usuarios}</td>
                    <td><Badge cor={e.ativo ? 'verde' : 'vermelho'}>{e.ativo ? 'Ativa' : 'Suspensa'}</Badge></td>
                    <td>{fmtDataHora(e.criado_em)}</td>
                    <td className="acoes">
                      <button className="botao botao-secundario botao-mini" onClick={() => setEditando(e)}>Editar</button>
                      {e.ativo
                        ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(e, false)}>Suspender</button>
                        : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(e, true)}>Reativar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && (
        <FormEmpresa empresa={editando.novo ? null : editando} aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); recarregar(); toast.sucesso('Empresa salva'); }} />
      )}
    </>
  );
}

function FormEmpresa({ empresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(empresa
    ? { nome: empresa.nome, cnpj: empresa.cnpj || '' }
    : { nome: '', cnpj: '', dono_nome: '', dono_email: '', dono_senha: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    const corpo = { nome: f.nome, cnpj: f.cnpj.replace(/[.\-\/\s]/g, '') || undefined };
    try {
      if (empresa) await api(`/admin/empresas/${empresa.id}`, { method: 'PUT', body: corpo });
      else await api('/admin/empresas', { method: 'POST', body: { ...corpo, dono: { nome: f.dono_nome, email: f.dono_email, senha: f.dono_senha } } });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={empresa ? `Editar ${empresa.nome}` : 'Nova empresa com dono'} largura={640} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome da empresa *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus /></Campo>
        <Campo rotulo="CNPJ" largura={200}><input value={f.cnpj} onChange={(e) => mudar('cnpj', e.target.value)} placeholder="somente números" /></Campo>
      </div>
      {!empresa && (
        <>
          <h4 style={{ margin: '12px 0 4px' }}>Dono da empresa</h4>
          <div className="linha-campos">
            <Campo rotulo="Nome completo *"><input value={f.dono_nome} onChange={(e) => mudar('dono_nome', e.target.value)} /></Campo>
            <Campo rotulo="E-mail *"><input type="email" value={f.dono_email} onChange={(e) => mudar('dono_email', e.target.value)} /></Campo>
          </div>
          <div className="linha-campos">
            <Campo rotulo="Senha inicial *" dica="mínimo de 8 caracteres"><input type="password" value={f.dono_senha} onChange={(e) => mudar('dono_senha', e.target.value)} autoComplete="new-password" /></Campo>
          </div>
        </>
      )}
    </Modal>
  );
}

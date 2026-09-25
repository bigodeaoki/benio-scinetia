import React from 'react';
import { Network } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, Modal, Vazio, confirmar, fmtDataHora, toast, useDados } from '../ui.jsx';

// Visão do dono: a matriz e as filiais do grupo. Só o dono cadastra filial.
export default function Filiais() {
  const s = React.useContext(SessaoContext);
  const { dados, erro, carregando, recarregar } = useDados(() => api('/empresas'));
  const [editando, setEditando] = React.useState(null);
  const atualizarTudo = () => { recarregar(); s.recarregar(); };

  async function alterarAtivo(f, ativo) {
    const ok = await confirmar({ titulo: ativo ? 'Reativar filial' : 'Inativar filial', mensagem: ativo ? `Reativar ${f.nome}?` : `Inativar ${f.nome}? Os usuários dela perdem o acesso até a reativação.`, confirmarTexto: ativo ? 'Reativar' : 'Inativar', perigo: !ativo });
    if (!ok) return;
    try {
      await api(`/empresas/filiais/${f.id}/ativo`, { method: 'PUT', body: { ativo } });
      atualizarTudo();
      toast.sucesso(ativo ? 'Filial reativada' : 'Filial inativada');
    } catch (e) {
      toast.erro(e.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Network size={15} className="icone-cartao" />Matriz e filiais de {s.escopo.matriz?.nome}</h3>
          <button className="botao" onClick={() => setEditando({ novo: true })}>+ Nova filial</button>
        </div>
        <div className="alerta alerta-info">
          Não existe filial sem matriz: toda filial nasce debaixo da sua. Os dados da matriz (nome, CNPJ) são mantidos pelo admin do sistema.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead><tr><th>Empresa</th><th>Tipo</th><th>CNPJ</th><th>Status</th><th>Criada em</th><th>Atualizada em</th><th className="acoes">Ações</th></tr></thead>
              <tbody>
                {dados.map((e) => (
                  <tr key={e.id} style={e.ativo ? undefined : { opacity: 0.55 }}>
                    <td className="negrito">{e.nome}</td>
                    <td><Badge cor={e.matriz ? 'azul' : 'cinza'}>{e.matriz ? 'Matriz' : 'Filial'}</Badge></td>
                    <td className="mono">{e.cnpj || '—'}</td>
                    <td><Badge cor={e.ativo ? 'verde' : 'vermelho'}>{e.ativo ? 'Ativa' : 'Inativa'}</Badge></td>
                    <td>{fmtDataHora(e.criado_em)}</td>
                    <td>{fmtDataHora(e.atualizado_em)}</td>
                    <td className="acoes">
                      {e.filial && (
                        <>
                          <button className="botao botao-secundario botao-mini" onClick={() => setEditando(e)}>Editar</button>
                          {e.ativo
                            ? <button className="botao botao-perigo botao-mini" onClick={() => alterarAtivo(e, false)}>Inativar</button>
                            : <button className="botao botao-secundario botao-mini" onClick={() => alterarAtivo(e, true)}>Reativar</button>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && (
        <FormFilial filial={editando.novo ? null : editando} aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); atualizarTudo(); toast.sucesso('Filial salva'); }} />
      )}
    </>
  );
}

function FormFilial({ filial, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(filial ? { nome: filial.nome, cnpj: filial.cnpj || '' } : { nome: '', cnpj: '' });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    const corpo = { nome: f.nome, cnpj: f.cnpj.replace(/[.\-\/\s]/g, '') || undefined };
    try {
      if (filial) await api(`/empresas/filiais/${filial.id}`, { method: 'PUT', body: corpo });
      else await api('/empresas/filiais', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={filial ? `Editar filial ${filial.nome}` : 'Nova filial'} largura={560} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar filial</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Nome da filial *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} autoFocus /></Campo>
        <Campo rotulo="CNPJ" largura={200}><input value={f.cnpj} onChange={(e) => mudar('cnpj', e.target.value)} placeholder="somente números" /></Campo>
      </div>
      {filial && (
        <div className="linha-campos">
          <Campo rotulo="Identificador"><input value={filial.id} readOnly className="mono" /></Campo>
        </div>
      )}
    </Modal>
  );
}

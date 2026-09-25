import React from 'react';
import { Settings } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Badge, Campo, Carregando, Erro, fmtData, fmtDataHora, toast, useDados } from '../ui.jsx';

export default function Conta() {
  const s = React.useContext(SessaoContext);
  const ehAdmin = s.usuario?.papel === 'admin';
  const { dados, erro, carregando, recarregar } = useDados(() => api('/conta'));
  const [nome, setNome] = React.useState('');
  React.useEffect(() => { if (dados) setNome(dados.nome); }, [dados]);

  async function salvar() {
    try {
      await api('/conta', { method: 'PUT', body: { nome } });
      toast.sucesso('Conta atualizada');
      recarregar();
      s.recarregar();
    } catch (e) {
      toast.erro(e.message);
    }
  }

  if (carregando) return <Carregando />;
  return (
    <>
      <div className="cartao">
        <h3><Settings size={15} className="icone-cartao" />Dados da conta</h3>
        <Erro msg={erro} />
        {dados && (
          <>
            <div className="linha-campos">
              <Campo rotulo="Nome da conta">
                <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!ehAdmin} />
              </Campo>
              <Campo rotulo="Identificador" largura={220}><input value={dados.slug} readOnly /></Campo>
            </div>
            <div className="linha-campos">
              <Campo rotulo="Plano" largura={160}><div><Badge cor="azul">{dados.plano}</Badge></div></Campo>
              <Campo rotulo="Status" largura={160}><div><Badge cor={dados.status === 'ativa' ? 'verde' : 'vermelho'}>{dados.status}</Badge></div></Campo>
              <Campo rotulo="Teste até" largura={160}><input value={fmtData(dados.trial_ate)} readOnly /></Campo>
              <Campo rotulo="Criada em" largura={160}><input value={fmtData(dados.criado_em)} readOnly /></Campo>
            </div>
            {ehAdmin && <button className="botao" onClick={salvar}>Salvar</button>}
          </>
        )}
      </div>
      <div className="cartao">
        <h3>Auditoria</h3>
        {!dados?.auditoria?.length ? <div className="texto-suave">Nada registrado ainda.</div> : (
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>Empresa</th></tr></thead>
            <tbody>
              {dados.auditoria.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDataHora(a.criado_em)}</td>
                  <td>{a.usuario_nome || '—'}</td>
                  <td><code>{a.acao}</code></td>
                  <td className="texto-suave">{a.entidade ? `${a.entidade} #${a.entidade_id ?? ''}` : '—'}</td>
                  <td>{a.empresa_nome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

import React from 'react';
import { Building2 } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { REGIMES, UFS } from '../dados.js';
import { Campo, Carregando, Erro, Modal, Vazio, confirmar, toast, useDados } from '../ui.jsx';

export default function Empresas() {
  const s = React.useContext(SessaoContext);
  const ehAdmin = s.usuario?.papel === 'admin';
  const { dados, erro, carregando, recarregar } = useDados(() => api('/empresas'));
  const [editando, setEditando] = React.useState(null);

  async function remover(e) {
    if (!(await confirmar({ titulo: 'Remover empresa', mensagem: `Remover ${e.razao_social}? Todos os dados dela serão apagados.`, confirmarTexto: 'Remover', perigo: true }))) return;
    try {
      await api(`/empresas/${e.id}`, { method: 'DELETE' });
      toast.sucesso('Empresa removida');
      recarregar();
      s.recarregar();
    } catch (err) {
      toast.erro(err.message);
    }
  }

  return (
    <>
      <div className="cartao">
        <div className="cartao-cabecalho">
          <h3><Building2 size={15} className="icone-cartao" />Empresas da conta</h3>
          {ehAdmin && <button className="botao" onClick={() => setEditando({ novo: true })}>+ Nova empresa</button>}
        </div>
        <div className="alerta alerta-info">
          Todos os usuários da conta acessam todas as empresas; a empresa ativa é trocada no seletor do topo.
          O <strong>regime tributário</strong> define os impostos do cálculo de preço.
        </div>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.length ? <Vazio /> : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr><th>Razão social</th><th>Nome fantasia</th><th>CNPJ</th><th>UF</th><th>Município</th><th>Regime</th>{ehAdmin && <th className="acoes">Ações</th>}</tr>
              </thead>
              <tbody>
                {dados.map((e) => (
                  <tr key={e.id}>
                    <td className="negrito">{e.razao_social}</td>
                    <td>{e.nome_fantasia || '—'}</td>
                    <td className="mono">{e.cnpj || '—'}</td>
                    <td>{e.uf}</td>
                    <td>{e.municipio || '—'}</td>
                    <td>{REGIMES.find((r) => r.valor === e.regime)?.rotulo}</td>
                    {ehAdmin && (
                      <td className="acoes">
                        <button className="botao botao-secundario botao-mini" onClick={() => setEditando(e)}>Editar</button>
                        <button className="botao botao-perigo botao-mini" onClick={() => remover(e)}>Remover</button>
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
        <FormEmpresa
          empresa={editando.novo ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); recarregar(); s.recarregar(); toast.sucesso('Empresa salva'); }}
        />
      )}
    </>
  );
}

function FormEmpresa({ empresa, aoFechar, aoSalvar }) {
  const [f, setF] = React.useState(empresa
    ? { razao_social: empresa.razao_social, nome_fantasia: empresa.nome_fantasia || '', cnpj: empresa.cnpj || '', ie: empresa.ie || '', uf: empresa.uf, municipio: empresa.municipio || '', endereco: empresa.endereco || '', regime: empresa.regime, aliquota_simples: empresa.aliquota_simples ?? 6 }
    : { razao_social: '', nome_fantasia: '', cnpj: '', ie: '', uf: 'SP', municipio: '', endereco: '', regime: 'presumido', aliquota_simples: 6 });
  const [erro, setErro] = React.useState(null);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function salvar() {
    setErro(null);
    // DTO do backend recusa campo vazio onde espera formato: manda undefined
    const corpo = {
      razao_social: f.razao_social, uf: f.uf, regime: f.regime, aliquota_simples: Number(f.aliquota_simples) || 0,
      nome_fantasia: f.nome_fantasia || undefined, cnpj: f.cnpj.replace(/[.\-\/\s]/g, '') || undefined,
      ie: f.ie || undefined, municipio: f.municipio || undefined, endereco: f.endereco || undefined,
    };
    try {
      if (empresa) await api(`/empresas/${empresa.id}`, { method: 'PUT', body: corpo });
      else await api('/empresas', { method: 'POST', body: corpo });
      aoSalvar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Modal titulo={empresa ? `Editar ${empresa.razao_social}` : 'Nova empresa'} largura={700} onFechar={aoFechar}
      rodape={<><button className="botao botao-secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Salvar</button></>}
    >
      <Erro msg={erro} />
      <div className="linha-campos">
        <Campo rotulo="Razão social *"><input value={f.razao_social} onChange={(e) => mudar('razao_social', e.target.value)} /></Campo>
        <Campo rotulo="Nome fantasia"><input value={f.nome_fantasia} onChange={(e) => mudar('nome_fantasia', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="CNPJ" largura={200}><input value={f.cnpj} onChange={(e) => mudar('cnpj', e.target.value)} placeholder="somente números" /></Campo>
        <Campo rotulo="Inscrição estadual"><input value={f.ie} onChange={(e) => mudar('ie', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="UF" largura={90}>
          <select value={f.uf} onChange={(e) => mudar('uf', e.target.value)}>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </Campo>
        <Campo rotulo="Município"><input value={f.municipio} onChange={(e) => mudar('municipio', e.target.value)} /></Campo>
        <Campo rotulo="Endereço"><input value={f.endereco} onChange={(e) => mudar('endereco', e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Regime tributário">
          <select value={f.regime} onChange={(e) => mudar('regime', e.target.value)}>{REGIMES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}</select>
        </Campo>
        {f.regime === 'simples' && (
          <Campo rotulo="Alíquota efetiva do DAS (%)"><input type="number" step="any" value={f.aliquota_simples} onChange={(e) => mudar('aliquota_simples', e.target.value)} /></Campo>
        )}
      </div>
    </Modal>
  );
}

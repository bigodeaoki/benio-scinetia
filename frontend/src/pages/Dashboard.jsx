import React from 'react';
import { Activity } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Carregando, Erro, Vazio, fmtDataHora, useDados } from '../ui.jsx';

export default function Dashboard() {
  const s = React.useContext(SessaoContext);
  const { dados, erro, carregando } = useDados(() => api('/conta'));
  const empresa = s.empresas.find((e) => e.id === s.empresaId);

  return (
    <>
      <div className="grade-kpis">
        <div className="kpi">
          <div className="kpi-rotulo">Conta</div>
          <div className="kpi-valor" style={{ fontSize: 18 }}>{s.conta?.nome}</div>
          <div className="kpi-extra">
            {dados?.plano === 'trial'
              ? `período de teste: ${dados.dias_restantes_trial} dia(s) restante(s)`
              : `plano ${dados?.plano || '…'}`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-rotulo">Empresa ativa</div>
          <div className="kpi-valor" style={{ fontSize: 18 }}>{empresa?.nome_fantasia || empresa?.razao_social || '—'}</div>
          <div className="kpi-extra">{empresa ? `${empresa.uf} · ${empresa.regime}` : ''}</div>
        </div>
        <div className="kpi">
          <div className="kpi-rotulo">Empresas</div>
          <div className="kpi-valor">{dados?.totais?.empresas ?? '…'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-rotulo">Usuários ativos</div>
          <div className="kpi-valor">{dados?.totais?.usuarios_ativos ?? '…'}</div>
        </div>
      </div>
      <div className="cartao">
        <h3><Activity size={15} className="icone-cartao" />Atividade recente</h3>
        <Erro msg={erro} />
        {carregando ? <Carregando /> : !dados?.auditoria?.length ? <Vazio msg="Nada registrado ainda" /> : (
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Empresa</th></tr></thead>
            <tbody>
              {dados.auditoria.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDataHora(a.criado_em)}</td>
                  <td>{a.usuario_nome || '—'}</td>
                  <td><code>{a.acao}</code>{a.detalhes?.razao_social ? ` · ${a.detalhes.razao_social}` : ''}{a.detalhes?.email ? ` · ${a.detalhes.email}` : ''}</td>
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

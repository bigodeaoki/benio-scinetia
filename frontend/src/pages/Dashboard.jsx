import React from 'react';
import { Activity } from 'lucide-react';
import { SessaoContext } from '../App.jsx';
import { api } from '../api.js';
import { Carregando, Erro, Vazio, fmtDataHora, useDados } from '../ui.jsx';

// Tela inicial por visão: admin (totais globais), dono (grupo) e usuário comum
export default function Dashboard() {
  const s = React.useContext(SessaoContext);
  const { dados, erro, carregando } = useDados(() => api('/painel'), [s.empresaId]);
  const empresa = s.empresas.find((e) => e.id === s.empresaId);

  if (carregando) return <Carregando />;
  if (erro) return <Erro msg={erro} />;

  const kpis = dados.visao === 'admin'
    ? [
        ['Empresas (matrizes)', dados.totais.matrizes],
        ['Filiais', dados.totais.filiais],
        ['Donos', dados.totais.donos],
        ['Usuários', dados.totais.usuarios],
      ]
    : [
        ['Grupo', s.escopo.matriz?.nome, dados.visao === 'owner' ? 'você é o dono' : `seu papel: ${s.usuario.papel}`],
        ['Empresa ativa', empresa ? (empresa.matriz ? `${empresa.nome} (matriz)` : empresa.nome) : '—'],
        ['Empresas no seu escopo', dados.totais.empresas, `${dados.totais.filiais} filial(is)`],
        ['Usuários ativos', dados.totais.usuarios_ativos],
      ];

  return (
    <>
      <div className="grade-kpis">
        {kpis.map(([rotulo, valor, extra]) => (
          <div className="kpi" key={rotulo}>
            <div className="kpi-rotulo">{rotulo}</div>
            <div className="kpi-valor" style={typeof valor === 'string' ? { fontSize: 18 } : undefined}>{valor ?? '—'}</div>
            {extra && <div className="kpi-extra">{extra}</div>}
          </div>
        ))}
      </div>
      {dados.visao !== 'usuario' && (
        <div className="cartao">
          <h3><Activity size={15} className="icone-cartao" />Atividade recente</h3>
          {!dados.auditoria?.length ? <Vazio msg="Nada registrado ainda" /> : (
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Empresa</th>{dados.visao === 'admin' && <th>Grupo</th>}</tr></thead>
              <tbody>
                {dados.auditoria.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDataHora(a.criado_em)}</td>
                    <td>{a.usuario_nome || '—'}</td>
                    <td><code>{a.acao}</code>{a.detalhes?.nome ? ` · ${a.detalhes.nome}` : ''}{a.detalhes?.email ? ` · ${a.detalhes.email}` : ''}</td>
                    <td>{a.empresa_nome || '—'}</td>
                    {dados.visao === 'admin' && <td>{a.matriz_nome || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

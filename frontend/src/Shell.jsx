import React from 'react';
import { Building2, LayoutDashboard, LogOut, Package, Settings, Users } from 'lucide-react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { SessaoContext } from './App.jsx';
import { limparSessao } from './api.js';
import { LogoScientia } from './ui.jsx';
import { PAPEL_ROTULOS } from './dados.js';
import Dashboard from './pages/Dashboard.jsx';
import Empresas from './pages/Empresas.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Conta from './pages/Conta.jsx';
import Materias from './pages/Materias.jsx';

const MENU = [
  { caminho: '/', titulo: 'Dashboard', Icone: LayoutDashboard, fim: true },
  { grupo: 'Cadastros' },
  { caminho: '/materias', titulo: 'Matérias-primas', Icone: Package },
  { grupo: 'Conta' },
  { caminho: '/empresas', titulo: 'Empresas', Icone: Building2 },
  { caminho: '/usuarios', titulo: 'Usuários', Icone: Users, apenasAdmin: true },
  { caminho: '/conta', titulo: 'Conta', Icone: Settings },
];

// Área logada: menu lateral, cabeçalho com empresa ativa e as páginas
export default function Shell() {
  const s = React.useContext(SessaoContext);
  const { pathname } = useLocation();
  const item = MENU.find((m) => m.caminho && (m.fim ? pathname === m.caminho : pathname.startsWith(m.caminho))) || MENU[0];
  const ehAdmin = s.usuario?.papel === 'admin';

  return (
    <div className="aplicacao">
      <aside className="lateral">
        <div className="lateral-logo">
          <span className="logo-marca"><LogoScientia /></span>
          <span>
            Scientia
            <small>{s.conta?.nome}</small>
          </span>
        </div>
        {MENU.filter((m) => !m.apenasAdmin || ehAdmin).map((m, i) =>
          m.grupo ? (
            <div key={`g${i}`} className="grupo-menu">{m.grupo}</div>
          ) : (
            <NavLink key={m.caminho} to={m.caminho} end={m.fim} className={({ isActive }) => `item-menu ${isActive ? 'ativo' : ''}`}>
              <span className="numero"><m.Icone size={13} strokeWidth={2.2} /></span>
              {m.titulo}
            </NavLink>
          ),
        )}
      </aside>
      <div className="principal">
        <header className="topo">
          <h2>
            <span className="titulo-icone"><item.Icone size={15} strokeWidth={2.2} /></span>
            {item.titulo}
          </h2>
          {s.empresas.length > 1 && (
            <select value={s.empresaId || ''} onChange={(e) => s.trocarEmpresa(Number(e.target.value))} title="Empresa ativa">
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
            </select>
          )}
          <span className="usuario">{s.usuario?.nome} · {PAPEL_ROTULOS[s.usuario?.papel] || s.usuario?.papel}</span>
          <button className="botao botao-secundario botao-mini" onClick={() => { limparSessao(); s.sair(); }}>
            <LogOut size={14} /> Sair
          </button>
        </header>
        <main className="conteudo">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="materias" element={<Materias />} />
            <Route path="empresas" element={<Empresas />} />
            <Route path="usuarios" element={ehAdmin ? <Usuarios /> : <Dashboard />} />
            <Route path="conta" element={<Conta />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

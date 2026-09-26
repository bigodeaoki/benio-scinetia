import React from 'react';
import { Box, Boxes, Building2, Cog, FlaskConical, LayoutDashboard, LogOut, Network, Package, Truck, Users } from 'lucide-react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { SessaoContext } from './App.jsx';
import { limparSessao } from './api.js';
import { LogoScientia } from './ui.jsx';
import { PAPEL_ROTULOS } from './dados.js';
import Dashboard from './pages/Dashboard.jsx';
import Materias from './pages/Materias.jsx';
import Estoque from './pages/Estoque.jsx';
import Formulacoes from './pages/Formulacoes.jsx';
import Envases from './pages/Envases.jsx';
import Maquinas from './pages/Maquinas.jsx';
import Logistica from './pages/Logistica.jsx';
import Filiais from './pages/Filiais.jsx';
import Usuarios from './pages/Usuarios.jsx';
import AdminEmpresas from './pages/admin/Empresas.jsx';
import AdminUsuarios from './pages/admin/Usuarios.jsx';

// Cada visão tem seu menu: admin (global), dono (grupo) e usuário comum
function menuDe(papel) {
  const inicio = { caminho: '/', titulo: 'Dashboard', Icone: LayoutDashboard, fim: true };
  if (papel === 'admin') {
    return [
      inicio,
      { grupo: 'Administração' },
      { caminho: '/admin/empresas', titulo: 'Empresas', Icone: Building2 },
      { caminho: '/admin/usuarios', titulo: 'Usuários', Icone: Users },
    ];
  }
  const itens = [
    inicio,
    { grupo: 'Cadastros' },
    { caminho: '/materias', titulo: 'Matérias-primas', Icone: Package },
    { caminho: '/envases', titulo: 'Envase', Icone: Box },
    { caminho: '/formulacoes', titulo: 'Formulações', Icone: FlaskConical },
    { caminho: '/maquinas', titulo: 'Maquinário', Icone: Cog },
    { caminho: '/logistica', titulo: 'Logística', Icone: Truck },
    { grupo: 'Operação' },
    { caminho: '/estoque', titulo: 'Estoque', Icone: Boxes },
  ];
  if (papel === 'owner') {
    itens.push({ grupo: 'Minha empresa' });
    itens.push({ caminho: '/filiais', titulo: 'Filiais', Icone: Network });
    itens.push({ caminho: '/usuarios', titulo: 'Usuários', Icone: Users });
  }
  return itens;
}

export default function Shell() {
  const s = React.useContext(SessaoContext);
  const { pathname } = useLocation();
  const papel = s.usuario?.papel;
  const MENU = menuDe(papel);
  const item = MENU.find((m) => m.caminho && (m.fim ? pathname === m.caminho : pathname.startsWith(m.caminho))) || MENU[0];
  const ehAdmin = papel === 'admin';
  const ehDono = papel === 'owner';

  return (
    <div className="aplicacao">
      <aside className="lateral">
        <div className="lateral-logo">
          <span className="logo-marca"><LogoScientia /></span>
          <span>
            Scientia
            <small>{ehAdmin ? 'Administração do sistema' : s.escopo?.matriz?.nome}</small>
          </span>
        </div>
        {MENU.map((m, i) =>
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
          {!ehAdmin && s.empresas.length > 1 && (
            <select value={s.empresaId || ''} onChange={(e) => s.trocarEmpresa(e.target.value)} title="Empresa ativa">
              {s.empresas.map((e) => <option key={e.id} value={e.id}>{e.matriz ? `${e.nome} (matriz)` : e.nome}</option>)}
            </select>
          )}
          <span className="usuario">{s.usuario?.nome} · {PAPEL_ROTULOS[papel] || papel}</span>
          <button className="botao botao-secundario botao-mini" onClick={() => { limparSessao(); s.sair(); }}>
            <LogOut size={14} /> Sair
          </button>
        </header>
        <main className="conteudo">
          <Routes>
            <Route index element={<Dashboard />} />
            {!ehAdmin && <Route path="materias" element={<Materias />} />}
            {!ehAdmin && <Route path="estoque" element={<Estoque />} />}
            {!ehAdmin && <Route path="formulacoes" element={<Formulacoes />} />}
            {!ehAdmin && <Route path="envases" element={<Envases />} />}
            {!ehAdmin && <Route path="maquinas" element={<Maquinas />} />}
            {!ehAdmin && <Route path="logistica" element={<Logistica />} />}
            {ehDono && <Route path="filiais" element={<Filiais />} />}
            {ehDono && <Route path="usuarios" element={<Usuarios />} />}
            {ehAdmin && <Route path="admin/empresas" element={<AdminEmpresas />} />}
            {ehAdmin && <Route path="admin/usuarios" element={<AdminUsuarios />} />}
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

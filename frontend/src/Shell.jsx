import React from 'react';
import { Box, Boxes, Building2, ClipboardList, Cog, Contact, FileText, FlaskConical, HardHat, LayoutDashboard, LogOut, Network, Package, Truck, Users } from 'lucide-react';
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
import Funcionarios, { PODE_VER_FUNCIONARIOS } from './pages/Funcionarios.jsx';
import Documentos from './pages/Documentos.jsx';
import Clientes from './pages/Clientes.jsx';
import Pedidos from './pages/Pedidos.jsx';
import PedidoDetalhe from './pages/PedidoDetalhe.jsx';
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
    { grupo: 'Pedidos' },
    { caminho: '/pedidos', titulo: 'Pedidos', Icone: ClipboardList },
    { grupo: 'Cadastros' },
    { caminho: '/clientes', titulo: 'Clientes', Icone: Contact },
    { caminho: '/materias', titulo: 'Matérias-primas', Icone: Package },
    { caminho: '/envases', titulo: 'Envase', Icone: Box },
    { caminho: '/formulacoes', titulo: 'Formulações', Icone: FlaskConical },
    { caminho: '/maquinas', titulo: 'Maquinário', Icone: Cog },
    { caminho: '/logistica', titulo: 'Logística', Icone: Truck },
    ...(PODE_VER_FUNCIONARIOS.includes(papel) ? [{ caminho: '/funcionarios', titulo: 'Mão de obra', Icone: HardHat }] : []),
    { grupo: 'Operação' },
    { caminho: '/estoque', titulo: 'Estoque', Icone: Boxes },
    { caminho: '/documentos', titulo: 'Documentos', Icone: FileText },
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
  // Aba aberta durante um deploy: confere de tempos em tempos (e ao voltar para a aba) se o servidor
  // já entrega um bundle novo e, se sim, avisa para recarregar em vez de deixar a tela antiga no ar
  const [novaVersao, setNovaVersao] = React.useState(false);
  React.useEffect(() => {
    const atual = document.querySelector('script[src*="/assets/index-"]')?.getAttribute('src');
    if (!atual) return undefined;
    let parado = false;
    const conferir = async () => {
      try {
        const html = await (await fetch(`/index.html?t=${Date.now()}`, { cache: 'no-store' })).text();
        const novo = html.match(/\/assets\/index-[^"']+\.js/)?.[0];

        if (!parado && novo && novo !== atual) setNovaVersao(true);
      } catch {
        // sem rede agora: tenta na próxima
      }
    };
    const timer = setInterval(conferir, 60000);
    window.addEventListener('focus', conferir);
    return () => { parado = true; clearInterval(timer); window.removeEventListener('focus', conferir); };
  }, []);
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
          {novaVersao && (
            <div className="alerta alerta-aviso" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>Há uma versão nova do sistema. Recarregue a página para ver as últimas mudanças.</span>
              <button className="botao botao-mini" onClick={() => window.location.reload()}>Recarregar agora</button>
            </div>
          )}
          <Routes>
            <Route index element={<Dashboard />} />
            {!ehAdmin && <Route path="materias" element={<Materias />} />}
            {!ehAdmin && <Route path="estoque" element={<Estoque />} />}
            {!ehAdmin && <Route path="formulacoes" element={<Formulacoes />} />}
            {!ehAdmin && <Route path="envases" element={<Envases />} />}
            {!ehAdmin && <Route path="maquinas" element={<Maquinas />} />}
            {!ehAdmin && <Route path="logistica" element={<Logistica />} />}
            {!ehAdmin && <Route path="documentos" element={<Documentos />} />}
            {!ehAdmin && <Route path="clientes" element={<Clientes />} />}
            {!ehAdmin && <Route path="pedidos" element={<Pedidos />} />}
            {!ehAdmin && <Route path="pedidos/:id" element={<PedidoDetalhe />} />}
            {!ehAdmin && PODE_VER_FUNCIONARIOS.includes(papel) && <Route path="funcionarios" element={<Funcionarios />} />}
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

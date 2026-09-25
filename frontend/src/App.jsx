import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, getEmpresaId, getToken, setSessao } from './api.js';
import { Carregando, Confirmacao, Toasts } from './ui.jsx';
import Shell from './Shell.jsx';
import Login from './pages/Login.jsx';
import Cadastro from './pages/Cadastro.jsx';

// Sessão (usuário, conta, empresas) disponível para toda a área logada
export const SessaoContext = React.createContext(null);

export default function App() {
  const [sessao, setSessaoAtual] = React.useState(undefined); // undefined = verificando, null = sem login
  const [empresaId, setEmpresaId] = React.useState(getEmpresaId());

  const aplicar = React.useCallback((dados) => {
    const id = dados.empresas.some((e) => e.id === getEmpresaId()) ? getEmpresaId() : dados.empresas[0]?.id || null;
    setSessao(dados.token || getToken(), id);
    setEmpresaId(id);
    setSessaoAtual({ usuario: dados.usuario, conta: dados.conta, empresas: dados.empresas });
  }, []);

  const recarregar = React.useCallback(async () => {
    try {
      aplicar(await api('/auth/me'));
    } catch {
      setSessaoAtual(null);
    }
  }, [aplicar]);

  React.useEffect(() => {
    if (getToken()) recarregar();
    else setSessaoAtual(null);
    const aoSair = () => setSessaoAtual(null);
    window.addEventListener('scientia:logout', aoSair);
    return () => window.removeEventListener('scientia:logout', aoSair);
  }, [recarregar]);

  const trocarEmpresa = (id) => {
    setSessao(getToken(), id);
    setEmpresaId(id);
  };

  if (sessao === undefined) return <div className="vazio" style={{ paddingTop: 80 }}>Carregando…</div>;

  return (
    <SessaoContext.Provider value={{ ...(sessao || {}), empresaId, trocarEmpresa, recarregar, sair: () => setSessaoAtual(null) }}>
      <Toasts />
      <Confirmacao />
      <Routes>
        <Route path="/entrar" element={sessao ? <Navigate to="/" replace /> : <Login aoEntrar={aplicar} />} />
        <Route path="/cadastro" element={sessao ? <Navigate to="/" replace /> : <Cadastro aoEntrar={aplicar} />} />
        <Route path="/*" element={sessao ? <Shell /> : <Navigate to="/entrar" replace />} />
      </Routes>
    </SessaoContext.Provider>
  );
}

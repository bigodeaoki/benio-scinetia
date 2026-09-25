import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, getEmpresaId, getToken, setSessao } from './api.js';
import { Confirmacao, Toasts } from './ui.jsx';
import Shell from './Shell.jsx';
import Login from './pages/Login.jsx';

// Sessão (usuário, escopo, empresa ativa) disponível para toda a área logada
export const SessaoContext = React.createContext(null);

export default function App() {
  const [sessao, setSessaoAtual] = React.useState(undefined); // undefined = verificando, null = sem login
  const [empresaId, setEmpresaId] = React.useState(getEmpresaId());

  const aplicar = React.useCallback((dados) => {
    const lista = dados.escopo.empresas || [];
    const guardada = getEmpresaId();
    const id = lista.some((e) => e.id === guardada) ? guardada : dados.escopo.empresa_padrao;
    setSessao(dados.token || getToken(), id);
    setEmpresaId(id);
    setSessaoAtual({ usuario: dados.usuario, escopo: dados.escopo });
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

  const valor = sessao
    ? { ...sessao, empresas: sessao.escopo.empresas, empresaId, trocarEmpresa, recarregar, sair: () => setSessaoAtual(null) }
    : null;

  return (
    <SessaoContext.Provider value={valor}>
      <Toasts />
      <Confirmacao />
      <Routes>
        <Route path="/entrar" element={sessao ? <Navigate to="/" replace /> : <Login aoEntrar={aplicar} />} />
        <Route path="/*" element={sessao ? <Shell /> : <Navigate to="/entrar" replace />} />
      </Routes>
    </SessaoContext.Provider>
  );
}

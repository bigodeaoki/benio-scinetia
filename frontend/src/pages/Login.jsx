import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Erro, LogoScientia } from '../ui.jsx';

export default function Login({ aoEntrar }) {
  const [email, setEmail] = React.useState('');
  const [senha, setSenha] = React.useState('');
  const [erro, setErro] = React.useState(null);
  const [ocupado, setOcupado] = React.useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      aoEntrar(await api('/auth/login', { method: 'POST', body: { email, senha } }));
    } catch (err) {
      setErro(err.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="login-fundo">
      <form className="login-cartao" onSubmit={entrar}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="logo-marca"><LogoScientia size={20} /></span>
          Scientia
        </h1>
        <p className="subtitulo">Custos de produção, precificação e gestão industrial</p>
        <Erro msg={erro} />
        <label className="campo">
          <span className="campo-rotulo">E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
        </label>
        <button className="botao" type="submit" disabled={ocupado} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </button>
        <div className="login-demo">
          Ainda não tem conta? <Link to="/cadastro">Criar conta grátis</Link>
        </div>
      </form>
    </div>
  );
}

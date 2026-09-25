import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { REGIMES, UFS } from '../dados.js';
import { Campo, Erro, LogoScientia } from '../ui.jsx';

// Cadastro self-service: conta + primeira empresa + usuário admin
export default function Cadastro({ aoEntrar }) {
  const [f, setF] = React.useState({
    conta_nome: '', nome: '', email: '', senha: '',
    razao_social: '', nome_fantasia: '', uf: 'SP', regime: 'presumido',
  });
  const [erro, setErro] = React.useState(null);
  const [ocupado, setOcupado] = React.useState(false);
  const mudar = (campo, valor) => setF((s) => ({ ...s, [campo]: valor }));

  async function criar(e) {
    e.preventDefault();
    setErro(null);
    if (f.senha.length < 8) return setErro('Senha deve ter ao menos 8 caracteres');
    setOcupado(true);
    try {
      aoEntrar(await api('/auth/cadastro', { method: 'POST', body: { ...f, nome_fantasia: f.nome_fantasia || undefined } }));
    } catch (err) {
      setErro(err.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="login-fundo">
      <form className="login-cartao" style={{ maxWidth: 560 }} onSubmit={criar}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="logo-marca"><LogoScientia size={20} /></span>
          Criar conta
        </h1>
        <p className="subtitulo">14 dias grátis. Você será o administrador da conta.</p>
        <Erro msg={erro} />
        <h4 style={{ margin: '8px 0 4px' }}>Sua conta</h4>
        <div className="linha-campos">
          <Campo rotulo="Nome da conta *" dica="nome do grupo ou da empresa principal">
            <input value={f.conta_nome} onChange={(e) => mudar('conta_nome', e.target.value)} autoFocus />
          </Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Seu nome completo *"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} /></Campo>
          <Campo rotulo="E-mail *"><input type="email" value={f.email} onChange={(e) => mudar('email', e.target.value)} autoComplete="username" /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Senha *" dica="mínimo de 8 caracteres">
            <input type="password" value={f.senha} onChange={(e) => mudar('senha', e.target.value)} autoComplete="new-password" />
          </Campo>
        </div>
        <h4 style={{ margin: '12px 0 4px' }}>Primeira empresa</h4>
        <div className="linha-campos">
          <Campo rotulo="Razão social *"><input value={f.razao_social} onChange={(e) => mudar('razao_social', e.target.value)} /></Campo>
          <Campo rotulo="Nome fantasia"><input value={f.nome_fantasia} onChange={(e) => mudar('nome_fantasia', e.target.value)} /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="UF" largura={90}>
            <select value={f.uf} onChange={(e) => mudar('uf', e.target.value)}>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
          </Campo>
          <Campo rotulo="Regime tributário" dica="define os impostos do cálculo de preço">
            <select value={f.regime} onChange={(e) => mudar('regime', e.target.value)}>
              {REGIMES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
            </select>
          </Campo>
        </div>
        <button className="botao" type="submit" disabled={ocupado} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
          {ocupado ? 'Criando…' : 'Criar conta e entrar'}
        </button>
        <div className="login-demo">
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </div>
      </form>
    </div>
  );
}

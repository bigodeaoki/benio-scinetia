import React from 'react';

/* ---------- Toasts ---------- */
let ouvinteToast = null;
export const toast = {
  sucesso: (texto) => ouvinteToast?.({ tipo: 'sucesso', texto }),
  erro: (texto) => ouvinteToast?.({ tipo: 'erro', texto }),
};

export function Toasts() {
  const [itens, setItens] = React.useState([]);
  React.useEffect(() => {
    ouvinteToast = (t) => {
      const id = Date.now() + Math.random();
      setItens((s) => [...s, { ...t, id }]);
      setTimeout(() => setItens((s) => s.filter((x) => x.id !== id)), 3500);
    };
    return () => { ouvinteToast = null; };
  }, []);
  return (
    <div className="toasts">
      {itens.map((t) => <div key={t.id} className={`toast toast-${t.tipo}`}>{t.texto}</div>)}
    </div>
  );
}

/* ---------- Confirmação (substitui o confirm() do navegador) ---------- */
let ouvinteConfirmacao = null;
export function confirmar(opcoes) {
  return new Promise((resolve) => {
    if (!ouvinteConfirmacao) return resolve(window.confirm(opcoes.mensagem));
    ouvinteConfirmacao({ ...opcoes, resolve });
  });
}

export function Confirmacao() {
  const [pedido, setPedido] = React.useState(null);
  React.useEffect(() => {
    ouvinteConfirmacao = setPedido;
    return () => { ouvinteConfirmacao = null; };
  }, []);
  if (!pedido) return null;
  const fechar = (resposta) => { pedido.resolve(resposta); setPedido(null); };
  return (
    <Modal titulo={pedido.titulo || 'Confirmar'} largura={460} onFechar={() => fechar(false)}
      rodape={
        <>
          <button className="botao botao-secundario" onClick={() => fechar(false)}>{pedido.cancelarTexto || 'Cancelar'}</button>
          <button className={`botao ${pedido.perigo ? 'botao-perigo' : ''}`} onClick={() => fechar(true)}>{pedido.confirmarTexto || 'Confirmar'}</button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{pedido.mensagem}</p>
    </Modal>
  );
}

/* ---------- Formatação ---------- */
export const fmtData = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('pt-BR');
};
export const fmtDataHora = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleString('pt-BR');
};
export const fmtBRL = (v) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/* ---------- Componentes ---------- */
export function LogoScientia({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Scientia">
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Modal({ titulo, largura = 640, onFechar, children, rodape }) {
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" style={{ maxWidth: largura }}>
        <div className="modal-cabecalho">
          <h3>{titulo}</h3>
          <button className="botao-fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export function Campo({ rotulo, dica, children, largura }) {
  return (
    <label className="campo" style={largura ? { width: largura, flex: 'none' } : undefined}>
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

export function Erro({ msg }) {
  return msg ? <div className="alerta alerta-erro">{msg}</div> : null;
}

export function Vazio({ msg = 'Nenhum registro encontrado' }) {
  return <div className="vazio">{msg}</div>;
}

export function Carregando() {
  return <div className="vazio">Carregando…</div>;
}

export function Badge({ cor = 'cinza', children }) {
  return <span className={`badge badge-${cor}`}>{children}</span>;
}

// Carregamento de dados com recarga
export function useDados(fn, deps = []) {
  const [dados, setDados] = React.useState(null);
  const [erro, setErro] = React.useState(null);
  const [carregando, setCarregando] = React.useState(true);
  const recarregar = React.useCallback(() => {
    setCarregando(true);
    fn().then((d) => { setDados(d); setErro(null); }).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { recarregar(); }, [recarregar]);
  return { dados, erro, carregando, recarregar };
}

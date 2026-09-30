import React from 'react';
import { api } from '../api.js';

// Partes compartilhadas entre a lista de pedidos e a página do pedido
export const PODE_EDITAR_PEDIDOS = ['owner', 'vendas', 'administrativo'];
// Etapa de custos: envolve custo-hora de funcionários, então só estes papéis editam
export const PODE_EDITAR_CUSTOS = ['owner', 'administrativo', 'financeiro'];
export const STATUS = { rascunho: ['Rascunho', 'amarelo'], concluido: ['Concluído', 'verde'], cancelado: ['Cancelado', 'cinza'] };
// Etapas do pedido; as não definidas já aparecem no stepper
export const ETAPAS = [
  { numero: 1, nome: 'Formulação e amostras', definida: true },
  { numero: 2, nome: 'Produção', definida: true },
  { numero: 3, nome: 'Custos', definida: true },
  { numero: 4, nome: 'Etapa 4', definida: false },
];
export const fmtNumero = (n) => `#${String(n).padStart(4, '0')}`;

// Stepper: `atual` é a etapa salva no pedido (onde parou); `vista` é a etapa aberta na tela
export function Stepper({ atual, vista, aoEscolher }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', margin: '6px 0 16px', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--borda)' }}>
      {ETAPAS.map((e, i) => {
        const feita = e.numero < atual;
        const corrente = e.numero === atual;
        const aberta = e.numero === vista;
        return (
          <button type="button" key={e.numero} onClick={() => aoEscolher?.(e.numero)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 0, borderLeft: i ? '1px solid var(--borda)' : 0, cursor: aoEscolher ? 'pointer' : 'default',
              background: aberta ? 'var(--azul-100)' : '#fff', opacity: e.definida || corrente ? 1 : 0.6, textAlign: 'left' }}>
            <span className={`badge ${feita ? 'badge-verde' : corrente ? 'badge-azul' : 'badge-cinza'}`} style={{ width: 26, height: 26, display: 'inline-grid', placeItems: 'center', borderRadius: '50%', padding: 0, fontSize: 12 }}>{feita ? '✓' : e.numero}</span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span className="texto-suave" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Etapa {e.numero}{corrente ? ' · atual' : feita ? ' · feita' : ''}</span>
              <span className={aberta ? 'negrito' : undefined}>{e.nome}{!e.definida ? ' (em definição)' : ''}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Busca de formulação: a partir do 3º caractere procura nas formulações da
// empresa (e da matriz); sem resultado exato, oferece criar uma nova só com o nome
export function BuscaFormulacao({ valor, aoEscolher, autoFocus }) {
  const [texto, setTexto] = React.useState(valor?.nome || '');
  const [opcoes, setOpcoes] = React.useState(null);
  const [buscando, setBuscando] = React.useState(false);
  const timer = React.useRef(null);
  const pedido = React.useRef(0);

  function buscar(t) {
    const q = t.trim();
    clearTimeout(timer.current);
    if (q.length < 3) { setOpcoes(null); return; }
    timer.current = setTimeout(async () => {
      const n = ++pedido.current;
      setBuscando(true);
      try {
        const lista = await api(`/formulacoes?q=${encodeURIComponent(q)}`);
        if (n === pedido.current) setOpcoes(lista);
      } catch {
        if (n === pedido.current) setOpcoes([]);
      } finally {
        if (n === pedido.current) setBuscando(false);
      }
    }, 250);
  }

  function mudar(t) {
    setTexto(t);
    if (valor) aoEscolher(null);
    buscar(t);
  }

  const q = texto.trim();
  const existeExata = (opcoes || []).some((o) => o.nome.toLowerCase() === q.toLowerCase());

  return (
    <div className="autocomplete">
      <input value={texto} onChange={(e) => mudar(e.target.value)} placeholder="Digite 3 letras para buscar…" autoComplete="off" autoFocus={autoFocus}
        onFocus={() => q.length >= 3 && !valor && buscar(texto)} onBlur={() => setTimeout(() => setOpcoes(null), 150)} />
      {opcoes && (
        <div className="autocomplete-lista">
          {opcoes.map((o) => (
            <button type="button" className="autocomplete-opcao" key={o.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { aoEscolher({ id: o.id, nome: o.nome, itens: o.itens }); setTexto(o.nome); setOpcoes(null); }}>
              <span className="negrito">{o.nome}</span>
              <span className="texto-suave"> · {o.origem === 'matriz' ? 'da matriz' : 'desta empresa'}{Number(o.itens) === 0 ? ' · sem ingredientes' : ` · ${o.itens} ingrediente(s)`}</span>
            </button>
          ))}
          {!existeExata && q.length >= 2 && (
            <button type="button" className="autocomplete-opcao" onMouseDown={(e) => e.preventDefault()} onClick={() => { aoEscolher({ id: null, nome: q, nova: true }); setOpcoes(null); }}>
              + Criar nova formulação <span className="negrito">“{q}”</span> <span className="texto-suave">(só com o nome)</span>
            </button>
          )}
          {buscando && <div className="autocomplete-vazio">Buscando…</div>}
        </div>
      )}
    </div>
  );
}

// Matéria-prima necessária: quantidade da fórmula (por 1 unidade produzida) × quantidade a
// produzir, subindo de unidade enquanto passar de 1000 (mg → g → kg, mL → L). Mesma regra do backend
const CONVERSOES = { mg: { para: 'g', fator: 1000 }, g: { para: 'kg', fator: 1000 }, ml: { para: 'L', fator: 1000 } };
export function necessidade(porUnidade, unidade, producao) {
  let quantidade = Number(porUnidade) * Number(producao);
  let un = (unidade || '').trim();
  for (let c = CONVERSOES[un.toLowerCase()]; c && Math.abs(quantidade) >= c.fator; c = CONVERSOES[un.toLowerCase()]) {
    quantidade /= c.fator;
    un = c.para;
  }
  return { quantidade: Math.round(quantidade * 1000) / 1000, unidade: un };
}

// Produção prevista: o rendimento das máquinas não muda a matéria-prima, reduz o que sai
// (300 a 90 % produzem 270). Com várias máquinas, os rendimentos se multiplicam. Mesma regra do backend
export function producaoPrevista(quantidade, rendimentos) {
  const fator = rendimentos.reduce((acc, r) => acc * (Number(r) / 100), 1);
  return { rendimento_pct: Math.round(fator * 10000) / 100, quantidade: Math.round(Number(quantidade) * fator * 1000) / 1000 };
}

// Custo do pedido. Até a etapa 4 tudo é valor fixo em R$ que vai somando ao custo global:
// envase (etapa 2), produção (etapa 3: matéria-prima, máquinas e utilitários) e custos
// (etapa 4: mão de obra, logística, depreciação e custos avulsos). Na etapa 5 os impostos
// entram como % sobre esse custo global. Cada linha é arredondada a centavos.
const centavos = (v: number) => Math.round(v * 100) / 100;

export interface ValoresPedido {
  envase: number;
  producao: number;
  mao_de_obra: number;
  logistica: number;
  depreciacao: number;
  outros: number;
}

export function custoTotalPedido(valores: ValoresPedido, impostosPct: number[]) {
  const subtotal = centavos(Object.values(valores).reduce((s, v) => s + (Number(v) || 0), 0));
  const linhasImpostos = impostosPct.map((pct) => centavos((subtotal * (Number(pct) || 0)) / 100));
  const impostos = centavos(linhasImpostos.reduce((s, v) => s + v, 0));
  return {
    subtotal, linhas_impostos: linhasImpostos, impostos,
    impostos_pct: centavos(impostosPct.reduce((s, p) => s + (Number(p) || 0), 0)),
    total: centavos(subtotal + impostos),
  };
}

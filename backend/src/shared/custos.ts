// Custo total do pedido (etapa 3). O custo global da produção (etapa 2: matéria-prima +
// máquinas + utilitários) é a base: mão de obra (por categoria) e impostos entram como
// % dessa base, e os outros custos em R$. Cada linha é arredondada a centavos.
const centavos = (v: number) => Math.round(v * 100) / 100;

export function custoTotalPedido(base: number, maoDeObraPct: number[], impostosPct: number[], outros: number) {
  const valor = (pct: number) => centavos((Number(base) * Number(pct)) / 100);
  const linhasMaoDeObra = maoDeObraPct.map(valor);
  const linhasImpostos = impostosPct.map(valor);
  const soma = (xs: number[]) => centavos(xs.reduce((s, x) => s + x, 0));
  const maoDeObra = soma(linhasMaoDeObra);
  const impostos = soma(linhasImpostos);
  return {
    linhas_mao_de_obra: linhasMaoDeObra, linhas_impostos: linhasImpostos,
    mao_de_obra: maoDeObra, mao_de_obra_pct: centavos(maoDeObraPct.reduce((s, x) => s + Number(x), 0)),
    impostos, impostos_pct: centavos(impostosPct.reduce((s, x) => s + Number(x), 0)),
    outros: centavos(Number(outros)), total: centavos(Number(base) + maoDeObra + impostos + Number(outros)),
  };
}

// Matéria-prima necessária para uma produção. As quantidades da formulação
// valem para 1 unidade produzida: necessário = quantidade da fórmula × quantidade
// a produzir. O resultado sobe de unidade enquanto passar de 1000 (mg → g → kg,
// mL → L), para a lista ficar legível: 300 g × 300 = 90 kg.
const CONVERSOES: Record<string, { para: string; fator: number }> = {
  mg: { para: 'g', fator: 1000 },
  g: { para: 'kg', fator: 1000 },
  ml: { para: 'L', fator: 1000 },
};

const arredondar = (v: number) => Math.round(v * 1000) / 1000;

export function necessidade(porUnidade: number, unidade: string, producao: number): { quantidade: number; unidade: string } {
  let quantidade = Number(porUnidade) * Number(producao);
  let un = (unidade || '').trim();
  for (let c = CONVERSOES[un.toLowerCase()]; c && Math.abs(quantidade) >= c.fator; c = CONVERSOES[un.toLowerCase()]) {
    quantidade /= c.fator;
    un = c.para;
  }
  return { quantidade: arredondar(quantidade), unidade: un };
}

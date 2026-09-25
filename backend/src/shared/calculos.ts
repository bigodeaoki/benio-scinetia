// Funções puras de cálculo, compartilhadas entre módulos e cobertas por teste.
// São a semente do motor de custos: tudo que virar regra de negócio numérica
// entra aqui, sem acesso a banco, para ser testado isoladamente.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

// Custo do colaborador: salário com encargos e benefícios, e o custo por hora
export function custoColaborador(c: {
  salario_base: number;
  encargos_pct: number;
  vale_transporte: number;
  vale_alimentacao: number;
  outros_beneficios: number;
  horas_mes: number;
}) {
  const custo_total_mensal =
    Number(c.salario_base) * (1 + Number(c.encargos_pct) / 100) +
    Number(c.vale_transporte) +
    Number(c.vale_alimentacao) +
    Number(c.outros_beneficios);
  const horas = Number(c.horas_mes) || 220;
  return {
    custo_total_mensal: round2(custo_total_mensal),
    custo_hora: round4(custo_total_mensal / horas),
  };
}

// ICMS interestadual: origem Sul/Sudeste (exceto ES) para destino N/NE/CO/ES = 7%; demais = 12%
export function aliquotaInterestadual(regiaoOrigem: string, ufOrigem: string, regiaoDestino: string, ufDestino: string): number {
  const origemSulSudeste = (regiaoOrigem === 'S' || regiaoOrigem === 'SE') && ufOrigem !== 'ES';
  const destinoNorteNeCoEs = regiaoDestino === 'N' || regiaoDestino === 'NE' || regiaoDestino === 'CO' || ufDestino === 'ES';
  return origemSulSudeste && destinoNorteNeCoEs ? 7 : 12;
}

// Formação de preço: impostos "por dentro" (ICMS/PIS/COFINS ou DAS) + margem sobre a venda;
// IPI é "por fora" (soma ao preço). Retorna null se margem + impostos inviabilizam o preço.
export function formarPreco(custoUnitario: number, margemPct: number, porDentroPct: number, ipiPct: number) {
  const totalPct = Number(porDentroPct) + Number(margemPct);
  if (totalPct >= 95) return null;
  const preco = custoUnitario / (1 - totalPct / 100);
  const ipi_valor = preco * (Number(ipiPct) / 100);
  const impostos_por_dentro = preco * (Number(porDentroPct) / 100);
  return {
    margem_pct: round2(Number(margemPct)),
    preco_sem_ipi: round4(preco),
    ipi_valor: round4(ipi_valor),
    preco_final: round4(preco + ipi_valor),
    impostos_por_dentro: round4(impostos_por_dentro),
    impostos_totais: round4(impostos_por_dentro + ipi_valor),
    lucro_unitario: round4(preco * (Number(margemPct) / 100)),
    markup_pct: custoUnitario > 0 ? round2((preco / custoUnitario - 1) * 100) : null,
  };
}

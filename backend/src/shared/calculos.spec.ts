import { aliquotaInterestadual, custoColaborador, formarPreco, round2, round4 } from './calculos';

describe('arredondamento', () => {
  it('round2 e round4 arredondam meio para cima sem erro de ponto flutuante', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round4(2.00005)).toBe(2.0001);
  });
});

describe('custoColaborador', () => {
  it('salário 2200 com 68% de encargos, VT 220 e VA 550 em 220 h custa 20,30 por hora', () => {
    const r = custoColaborador({ salario_base: 2200, encargos_pct: 68, vale_transporte: 220, vale_alimentacao: 550, outros_beneficios: 0, horas_mes: 220 });
    expect(r.custo_total_mensal).toBe(4466);
    expect(r.custo_hora).toBe(20.3);
  });

  it('horas por mês zeradas caem no padrão de 220 h', () => {
    const r = custoColaborador({ salario_base: 2200, encargos_pct: 0, vale_transporte: 0, vale_alimentacao: 0, outros_beneficios: 0, horas_mes: 0 });
    expect(r.custo_hora).toBe(10);
  });
});

describe('aliquotaInterestadual', () => {
  it('Sul/Sudeste para Norte, Nordeste, Centro-Oeste ou ES paga 7%', () => {
    expect(aliquotaInterestadual('SE', 'SP', 'NE', 'BA')).toBe(7);
    expect(aliquotaInterestadual('S', 'PR', 'SE', 'ES')).toBe(7);
  });
  it('demais combinações pagam 12%', () => {
    expect(aliquotaInterestadual('SE', 'SP', 'SE', 'RJ')).toBe(12);
    expect(aliquotaInterestadual('SE', 'ES', 'NE', 'BA')).toBe(12);
    expect(aliquotaInterestadual('NE', 'BA', 'SE', 'SP')).toBe(12);
  });
});

describe('formarPreco', () => {
  it('impostos por dentro e margem saem do preço; IPI soma por fora', () => {
    const p = formarPreco(10, 25, 3.65, 5);
    expect(p).not.toBeNull();
    expect(p.preco_sem_ipi).toBeCloseTo(10 / (1 - 0.2865), 4);
    expect(p.ipi_valor).toBeCloseTo(p.preco_sem_ipi * 0.05, 4);
    expect(p.preco_final).toBeCloseTo(p.preco_sem_ipi + p.ipi_valor, 4);
    expect(p.lucro_unitario).toBeCloseTo(p.preco_sem_ipi * 0.25, 4);
  });
  it('margem mais impostos a partir de 95% inviabiliza o preço', () => {
    expect(formarPreco(10, 90, 6, 0)).toBeNull();
  });
  it('custo zero não tem markup', () => {
    expect(formarPreco(0, 25, 0, 0).markup_pct).toBeNull();
  });
});

import { custoTotalPedido } from './custos';

describe('custo total do pedido', () => {
  it('mão de obra e impostos são % do custo global; outros custos entram em R$', () => {
    const t = custoTotalPedido(1000, [10, 5], [18], 70);
    expect(t.linhas_mao_de_obra).toEqual([100, 50]);
    expect(t.mao_de_obra).toBe(150);
    expect(t.mao_de_obra_pct).toBe(15);
    expect(t.linhas_impostos).toEqual([180]);
    expect(t.impostos).toBe(180);
    expect(t.impostos_pct).toBe(18);
    expect(t.outros).toBe(70);
    expect(t.total).toBe(1400);
  });

  it('arredonda cada linha a centavos antes de somar', () => {
    const t = custoTotalPedido(333.33, [10, 10], [1.65], 0);
    expect(t.linhas_mao_de_obra).toEqual([33.33, 33.33]);
    expect(t.linhas_impostos).toEqual([5.5]);
    expect(t.total).toBe(405.49);
  });

  it('sem percentuais nem outros custos, o total é o custo global', () => {
    expect(custoTotalPedido(11776.5, [], [], 0)).toMatchObject({ mao_de_obra: 0, impostos: 0, outros: 0, total: 11776.5 });
    expect(custoTotalPedido(0, [10], [18], 0).total).toBe(0);
  });
});

describe('subtotal sem impostos', () => {
  it('é base + mão de obra + custos em R$; o total soma os impostos por cima', () => {
    const t = custoTotalPedido(1000, [10], [18], 320 + 150 + 70);
    expect(t.subtotal).toBe(1640);
    expect(t.impostos).toBe(180);
    expect(t.total).toBe(1820);
  });
});

import { custoTotalPedido } from './custos';

const zero = { envase: 0, producao: 0, mao_de_obra: 0, logistica: 0, depreciacao: 0, outros: 0 };

describe('custo do pedido', () => {
  it('até a etapa 4 tudo soma em R$ no custo global', () => {
    const t = custoTotalPedido({ envase: 80, producao: 1000, mao_de_obra: 150, logistica: 320, depreciacao: 200.5, outros: 70 }, []);
    expect(t.subtotal).toBe(1820.5);
    expect(t.impostos).toBe(0);
    expect(t.total).toBe(1820.5);
  });

  it('os impostos são % sobre o custo global (com tudo das etapas 2 a 4)', () => {
    const t = custoTotalPedido({ ...zero, envase: 100, producao: 900 }, [18, 2]);
    expect(t.linhas_impostos).toEqual([180, 20]);
    expect(t.impostos).toBe(200);
    expect(t.impostos_pct).toBe(20);
    expect(t.total).toBe(1200);
  });

  it('arredonda cada imposto a centavos antes de somar', () => {
    const t = custoTotalPedido({ ...zero, producao: 333.33 }, [1.65, 1.65]);
    expect(t.linhas_impostos).toEqual([5.5, 5.5]);
    expect(t.total).toBe(344.33);
  });

  it('sem valores nem impostos, tudo é zero', () => {
    expect(custoTotalPedido(zero, [18])).toEqual({ subtotal: 0, linhas_impostos: [0], impostos: 0, impostos_pct: 18, total: 0 });
  });
});

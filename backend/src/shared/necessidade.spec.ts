import { converter, custoMateriaPrima, necessidade, producaoPrevista } from './necessidade';

describe('necessidade de matéria-prima', () => {
  it('multiplica a quantidade da fórmula (por 1 unidade) pela produção', () => {
    expect(necessidade(1, 'kg', 300)).toEqual({ quantidade: 300, unidade: 'kg' });
    expect(necessidade(1, 'un', 300)).toEqual({ quantidade: 300, unidade: 'un' });
    expect(necessidade(0.1, 'kg', 3)).toEqual({ quantidade: 0.3, unidade: 'kg' });
  });

  it('sobe de grama para quilo a partir de 1000: 300 g × 300 = 90 kg', () => {
    expect(necessidade(300, 'g', 300)).toEqual({ quantidade: 90, unidade: 'kg' });
    expect(necessidade(300, 'g', 3)).toEqual({ quantidade: 900, unidade: 'g' });
    expect(necessidade(250, 'mg', 8000)).toEqual({ quantidade: 2, unidade: 'kg' });
  });

  it('sobe de mililitro para litro, sem diferenciar maiúsculas', () => {
    expect(necessidade(500, 'mL', 4)).toEqual({ quantidade: 2, unidade: 'L' });
    expect(necessidade(500, 'ML', 4)).toEqual({ quantidade: 2, unidade: 'L' });
    expect(necessidade(2, 'ml', 100)).toEqual({ quantidade: 200, unidade: 'ml' });
  });

  it('mantém unidades que não conhece e não converte kg nem L', () => {
    expect(necessidade(2, 'sacos', 1500)).toEqual({ quantidade: 3000, unidade: 'sacos' });
    expect(necessidade(5, 'kg', 1000)).toEqual({ quantidade: 5000, unidade: 'kg' });
    expect(necessidade(5, 'L', 1000)).toEqual({ quantidade: 5000, unidade: 'L' });
  });
});

describe('produção prevista pelo rendimento das máquinas', () => {
  it('reduz o que sai: 300 com rendimento de 90 % produzem 270', () => {
    expect(producaoPrevista(300, [90])).toEqual({ rendimento_pct: 90, quantidade: 270 });
    expect(producaoPrevista(300, [100])).toEqual({ rendimento_pct: 100, quantidade: 300 });
  });

  it('multiplica os rendimentos quando há várias máquinas', () => {
    expect(producaoPrevista(300, [95, 90])).toEqual({ rendimento_pct: 85.5, quantidade: 256.5 });
    expect(producaoPrevista(1000, [98.5, 100, 90])).toEqual({ rendimento_pct: 88.65, quantidade: 886.5 });
  });

  it('sem máquinas, a produção prevista é a planejada', () => {
    expect(producaoPrevista(300, [])).toEqual({ rendimento_pct: 100, quantidade: 300 });
  });
});

describe('conversão de unidades e custo da matéria-prima', () => {
  it('converte dentro da família e recusa entre famílias', () => {
    expect(converter(30, 'kg', 'g')).toBe(30000);
    expect(converter(90, 'kg', 'kg')).toBe(90);
    expect(converter(2, 'L', 'mL')).toBe(2000);
    expect(converter(500, 'ML', 'l')).toBe(0.5);
    expect(converter(3, 'un', 'kg')).toBeNull();
    expect(converter(3, 'kg', 'L')).toBeNull();
  });

  it('custo = necessário na unidade de compra × valor de compra', () => {
    expect(custoMateriaPrima(100, 'kg', 10, 'kg')).toEqual({ custo: 1000, aviso: null });
    expect(custoMateriaPrima(30, 'kg', 5, 'kg')).toEqual({ custo: 150, aviso: null });
    expect(custoMateriaPrima(900, 'g', 5, 'kg')).toEqual({ custo: 4.5, aviso: null });
    expect(custoMateriaPrima(2, 'L', 12.5, 'mL')).toEqual({ custo: 25000, aviso: null });
  });

  it('sem preço ou sem conversão, avisa em vez de inventar', () => {
    expect(custoMateriaPrima(100, 'kg', null, 'kg')).toEqual({ custo: null, aviso: 'sem valor de compra no cadastro' });
    expect(custoMateriaPrima(100, 'un', 10, 'kg')).toEqual({ custo: null, aviso: 'un não converte para kg' });
  });
});

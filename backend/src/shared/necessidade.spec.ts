import { necessidade } from './necessidade';

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

import { cnpjValido, formatarCnpj, normalizarCnpj } from './cnpj';

describe('CNPJ', () => {
  it('normaliza tirando pontuação e subindo para maiúsculas', () => {
    expect(normalizarCnpj(' 11.222.333/0001-81 ')).toBe('11222333000181');
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(normalizarCnpj(null)).toBe('');
  });

  it('aceita CNPJ numérico válido e recusa dígito verificador errado', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false);
  });

  it('aceita o CNPJ alfanumérico do exemplo oficial e recusa letras nos verificadores', () => {
    expect(cnpjValido('12ABC34501DE35')).toBe(true);
    expect(cnpjValido('12ABC34501DE36')).toBe(false);
    expect(cnpjValido('12ABC34501DEA5')).toBe(false);
  });

  it('formata com pontuação', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
    expect(formatarCnpj(null)).toBe('');
  });
});

// CNPJ: aceita o formato numérico e o alfanumérico (em vigor desde julho de
// 2026). Guardamos só os 14 caracteres, em maiúsculas; os dois dígitos
// verificadores são sempre numéricos. Valor de cada caractere = código ASCII - 48
// (dígitos 0-9 valem 0-9, letras A-Z valem 17-42), pesos 5..2,9..2 (DV1) e 6..2,9..2 (DV2).
const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export const normalizarCnpj = (v: string | null | undefined) => (v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

const digitoVerificador = (base: string, pesos: number[]) => {
  const soma = base.split('').reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
};

// Verdadeiro para um CNPJ já normalizado com 14 caracteres e dígitos verificadores corretos
export const cnpjValido = (cnpj: string) => {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;
  const dv1 = digitoVerificador(cnpj.slice(0, 12), PESOS_DV1);
  const dv2 = digitoVerificador(cnpj.slice(0, 12) + dv1, PESOS_DV2);
  return cnpj.slice(12) === `${dv1}${dv2}`;
};

// XX.XXX.XXX/XXXX-XX
export const formatarCnpj = (cnpj: string | null | undefined) =>
  cnpj && cnpj.length === 14 ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj || '';

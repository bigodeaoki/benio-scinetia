import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Matches } from 'class-validator';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Entrada de compra no estoque: quantidade na unidade que a empresa quiser
export class EntradaEstoqueDto {
  @IsUUID('4', { message: 'Matéria-prima inválida' })
  materia_prima_id: string;

  @IsNumber({}, { message: 'Quantidade deve ser um número' }) @IsPositive({ message: 'Quantidade deve ser maior que zero' })
  quantidade: number;

  @IsOptional() @IsString() @Length(1, 20, { message: 'Unidade: entre 1 e 20 caracteres (kg, L, un…)' })
  unidade?: string;

  @Matches(DATA, { message: 'Data da compra: use AAAA-MM-DD' })
  data_compra: string;

  @IsOptional() @Matches(DATA, { message: 'Data de vencimento: use AAAA-MM-DD' })
  data_vencimento?: string;
}

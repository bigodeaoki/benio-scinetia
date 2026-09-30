import { IsNumber, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';

// Utilitário de uma empresa (energia, água, gás, vapor…) com um valor em R$
export class UtilitarioDto {
  @IsString() @Length(2, 150, { message: 'Nome: entre 2 e 150 caracteres' })
  nome: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Descrição: até 255 caracteres' })
  descricao?: string;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Valor deve ser um número (até 4 casas)' }) @Min(0, { message: 'Valor não pode ser negativo' })
  valor: number;

  // Empresa dona; sem informar, é a empresa ativa. Precisa estar no escopo de quem cadastra
  @IsOptional() @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id?: string;
}

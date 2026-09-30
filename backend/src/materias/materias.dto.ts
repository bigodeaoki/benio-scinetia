import { IsNumber, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

export class MateriaDto {
  @IsString() @Length(2, 150, { message: 'Nome: entre 2 e 150 caracteres' })
  nome: string;

  @IsString() @Length(1, 20, { message: 'Unidade: entre 1 e 20 caracteres (kg, L, un…)' })
  unidade: string;

  // Preço de compra em R unidade do cadastro (ex.: 10 = R,00 por kg); base do custo da produção
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Valor de compra deve ser um número (até 4 casas)' }) @Min(0, { message: 'Valor de compra não pode ser negativo' })
  valor_compra?: number;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Descrição: até 255 caracteres' })
  descricao?: string;
}

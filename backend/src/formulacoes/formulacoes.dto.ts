import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';

export class ItemFormulacaoDto {
  @IsUUID('4', { message: 'Matéria-prima inválida' })
  materia_prima_id: string;

  @IsNumber({}, { message: 'Quantidade deve ser um número' }) @IsPositive({ message: 'Quantidade deve ser maior que zero' })
  quantidade: number;

  @IsOptional() @IsString() @Length(1, 20, { message: 'Unidade: entre 1 e 20 caracteres (kg, L, un…)' })
  unidade?: string;
}

// Uma formulação é uma lista ordenada de matérias-primas com quantidade
export class FormulacaoDto {
  @IsString() @Length(2, 150, { message: 'Nome: entre 2 e 150 caracteres' })
  nome: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Descrição: até 255 caracteres' })
  descricao?: string;

  // Pode nascer só com o nome (ex.: a partir de um pedido); a farmácia completa os ingredientes depois
  @IsOptional() @IsArray({ message: 'Itens devem ser uma lista' })
  @ValidateNested({ each: true }) @Type(() => ItemFormulacaoDto)
  itens?: ItemFormulacaoDto[];
}

import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';

export const STATUS_VEICULO = ['disponivel', 'em_uso', 'manutencao'] as const;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Veículo de uma empresa: o tipo é livre (carro, caminhão, van, empilhadeira…)
export class VeiculoDto {
  @IsString() @Length(2, 40, { message: 'Tipo: entre 2 e 40 caracteres (carro, caminhão…)' })
  tipo: string;

  @IsOptional() @IsString() @MaxLength(80, { message: 'Marca: até 80 caracteres' })
  marca?: string;

  @IsOptional() @IsString() @MaxLength(100, { message: 'Modelo: até 100 caracteres' })
  modelo?: string;

  @IsOptional() @IsInt({ message: 'Ano deve ser um número inteiro' }) @Min(1900, { message: 'Ano: a partir de 1900' })
  ano?: number;

  @IsOptional() @IsString() @Length(1, 10, { message: 'Placa: até 10 caracteres' })
  placa?: string;

  // Empresa dona; sem informar, é a empresa ativa. Precisa estar no escopo de quem cadastra
  @IsOptional() @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id?: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Custo por hora deve ser um número com até 2 casas' })
  @Min(0, { message: 'Custo por hora não pode ser negativo' })
  custo_hora: number;

  @IsOptional() @IsIn(STATUS_VEICULO as unknown as string[], { message: 'Status: disponivel, em_uso ou manutencao' })
  status?: string;

  @IsOptional() @Matches(DATA, { message: 'Última manutenção: use AAAA-MM-DD' })
  ultima_manutencao?: string;
}

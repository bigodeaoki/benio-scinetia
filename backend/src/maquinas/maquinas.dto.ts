import { IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

// Máquina/equipamento de uma empresa. Custo em R$ por hora; rendimento em %
export class MaquinaDto {
  @IsString() @Length(2, 150, { message: 'Título: entre 2 e 150 caracteres' })
  titulo: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Descrição: até 255 caracteres' })
  descricao?: string;

  @IsOptional() @IsString() @MaxLength(100, { message: 'Modelo: até 100 caracteres' })
  modelo?: string;

  // Empresa dona; sem informar, é a empresa ativa. Precisa estar no escopo de quem cadastra
  @IsOptional() @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id?: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Custo por hora deve ser um número com até 2 casas' })
  @Min(0, { message: 'Custo por hora não pode ser negativo' })
  custo_hora: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Rendimento deve ser um número (%)' })
  @Min(0.01, { message: 'Rendimento: entre 0,01 e 100 %' }) @Max(100, { message: 'Rendimento: entre 0,01 e 100 %' })
  rendimento_pct: number;
}

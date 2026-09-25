import { IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

export class EmpresaDto {
  @IsString() @Length(2, 200, { message: 'Razão social: entre 2 e 200 caracteres' })
  razao_social: string;

  @IsOptional() @IsString() @MaxLength(200, { message: 'Nome fantasia: até 200 caracteres' })
  nome_fantasia?: string;

  // 14 caracteres sem pontuação; aceita o formato alfanumérico da Receita (2026)
  @IsOptional() @IsString() @Matches(/^([A-Z0-9]{12}\d{2})?$/i, { message: 'CNPJ inválido: 14 caracteres sem pontuação' })
  cnpj?: string;

  @IsOptional() @IsString() @MaxLength(20, { message: 'Inscrição estadual: até 20 caracteres' })
  ie?: string;

  @IsString() @Length(2, 2, { message: 'UF inválida' })
  uf: string;

  @IsOptional() @IsString() @MaxLength(120, { message: 'Município: até 120 caracteres' })
  municipio?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Endereço: até 255 caracteres' })
  endereco?: string;

  @IsIn(['simples', 'presumido', 'real'], { message: 'Regime tributário inválido' })
  regime: string;

  @IsOptional() @IsNumber({}, { message: 'Alíquota do Simples deve ser um número' }) @Min(0) @Max(100)
  aliquota_simples?: number;
}

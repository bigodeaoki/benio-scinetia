import { IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';

export const STATUS_FUNCIONARIO = ['ativo', 'ferias', 'afastado', 'desligado'] as const;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Funcionário de uma empresa. Categoria livre (financeiro, marketing, produção…)
export class FuncionarioDto {
  @IsString() @Length(2, 150, { message: 'Nome: entre 2 e 150 caracteres' })
  nome: string;

  @IsOptional() @IsString() @Length(3, 20, { message: 'Documento: entre 3 e 20 caracteres' })
  documento?: string;

  @IsOptional() @IsEmail({}, { message: 'E-mail inválido' }) @MaxLength(150, { message: 'E-mail: até 150 caracteres' })
  email?: string;

  // Empresa dona; sem informar, é a empresa ativa. Precisa estar no escopo de quem cadastra
  @IsOptional() @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id?: string;

  @IsString() @Length(2, 60, { message: 'Categoria: entre 2 e 60 caracteres (financeiro, marketing…)' })
  categoria: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Custo por hora deve ser um número com até 2 casas' })
  @Min(0, { message: 'Custo por hora não pode ser negativo' })
  custo_hora: number;

  @IsOptional() @Matches(DATA, { message: 'Data de admissão: use AAAA-MM-DD' })
  data_admissao?: string;

  @IsOptional() @IsIn(STATUS_FUNCIONARIO as unknown as string[], { message: 'Status: ativo, ferias, afastado ou desligado' })
  status?: string;
}

import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// Responsável (contato) do cliente
export class ResponsavelDto {
  @IsString() @Length(2, 150, { message: 'Responsável: nome entre 2 e 150 caracteres' })
  nome: string;

  @IsOptional() @IsString() @MaxLength(80, { message: 'Responsável: cargo até 80 caracteres' })
  cargo?: string;

  @IsOptional() @IsString() @MaxLength(30, { message: 'Responsável: telefone até 30 caracteres' })
  telefone?: string;

  @IsOptional() @IsEmail({}, { message: 'Responsável: e-mail inválido' }) @MaxLength(150, { message: 'Responsável: e-mail até 150 caracteres' })
  email?: string;
}

// Cadastro padrão de empresa: dados, contatos, endereço e responsáveis
export class ClienteDto {
  @IsString() @Length(2, 150, { message: 'Razão social: entre 2 e 150 caracteres' })
  razao_social: string;

  @IsOptional() @IsString() @MaxLength(150, { message: 'Nome fantasia: até 150 caracteres' })
  nome_fantasia?: string;

  @IsOptional() @IsString() @MaxLength(20, { message: 'CNPJ: até 20 caracteres, com ou sem pontuação' })
  cnpj?: string;

  @IsOptional() @IsString() @MaxLength(30, { message: 'Inscrição estadual: até 30 caracteres' })
  inscricao_estadual?: string;

  @IsOptional() @IsEmail({}, { message: 'E-mail inválido' }) @MaxLength(150, { message: 'E-mail: até 150 caracteres' })
  email?: string;

  @IsOptional() @IsString() @MaxLength(30, { message: 'Telefone: até 30 caracteres' })
  telefone?: string;

  @IsOptional() @IsString() @MaxLength(12, { message: 'CEP: 8 dígitos' })
  cep?: string;

  @IsOptional() @IsString() @MaxLength(150, { message: 'Logradouro: até 150 caracteres' })
  logradouro?: string;

  @IsOptional() @IsString() @MaxLength(20, { message: 'Número: até 20 caracteres' })
  numero?: string;

  @IsOptional() @IsString() @MaxLength(80, { message: 'Complemento: até 80 caracteres' })
  complemento?: string;

  @IsOptional() @IsString() @MaxLength(80, { message: 'Bairro: até 80 caracteres' })
  bairro?: string;

  @IsOptional() @IsString() @MaxLength(100, { message: 'Cidade: até 100 caracteres' })
  cidade?: string;

  @IsOptional() @IsString() @Length(2, 2, { message: 'UF: sigla com 2 letras' })
  uf?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Observações: até 255 caracteres' })
  observacoes?: string;

  // Empresa dona; sem informar, é a empresa ativa. Precisa estar no escopo de quem cadastra
  @IsOptional() @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id?: string;

  @IsOptional() @IsArray({ message: 'Responsáveis: lista' }) @ArrayMaxSize(20, { message: 'No máximo 20 responsáveis' })
  @ValidateNested({ each: true }) @Type(() => ResponsavelDto)
  responsaveis?: ResponsavelDto[];
}

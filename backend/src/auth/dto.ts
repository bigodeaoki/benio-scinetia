import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

// Cadastro self-service: cria a conta, a primeira empresa e o usuário admin
export class CadastroDto {
  @IsString() @Length(2, 150, { message: 'Nome da conta: entre 2 e 150 caracteres' })
  conta_nome: string;

  @IsString() @Length(2, 200, { message: 'Razão social: entre 2 e 200 caracteres' })
  razao_social: string;

  @IsOptional() @IsString() @MaxLength(200, { message: 'Nome fantasia: até 200 caracteres' })
  nome_fantasia?: string;

  @IsString() @Length(2, 2, { message: 'UF inválida' })
  uf: string;

  @IsIn(['simples', 'presumido', 'real'], { message: 'Regime tributário inválido' })
  regime: string;

  @IsString() @Length(3, 120, { message: 'Informe o seu nome completo' })
  nome: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsString() @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' }) @MaxLength(72, { message: 'Senha longa demais' })
  senha: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsString() @MinLength(1, { message: 'Informe a senha' })
  senha: string;
}

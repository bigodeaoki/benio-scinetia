import { Type } from 'class-transformer';
import { IsDefined, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { TODOS_PAPEIS } from '../auth/papeis';

export class DonoDto {
  @IsString() @Length(3, 120, { message: 'Nome do dono: informe o nome completo' })
  nome: string;

  @IsEmail({}, { message: 'E-mail do dono inválido' })
  email: string;

  @IsString({ message: 'Informe a senha' }) @MinLength(8, { message: 'Senha do dono deve ter ao menos 8 caracteres' }) @MaxLength(72, { message: 'Senha longa demais' })
  senha: string;
}

export class EmpresaAdminDto {
  @IsString() @Length(2, 150, { message: 'Nome da empresa: entre 2 e 150 caracteres' })
  nome: string;

  @IsOptional() @IsString() @Matches(/^([A-Z0-9]{12}\d{2})?$/i, { message: 'CNPJ inválido: 14 caracteres sem pontuação' })
  cnpj?: string;
}

// Matriz nasce com o dono: uma empresa sem dono não teria quem a operar
export class NovaEmpresaDto extends EmpresaAdminDto {
  @IsDefined({ message: 'Informe o dono da empresa' }) @ValidateNested() @Type(() => DonoDto)
  dono: DonoDto;
}

export class UsuarioAdminDto {
  @IsString() @Length(3, 120, { message: 'Informe o nome completo' })
  nome: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsOptional() @IsString({ message: 'Informe a senha' }) @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' }) @MaxLength(72, { message: 'Senha longa demais' })
  senha?: string;

  @IsIn(TODOS_PAPEIS as unknown as string[], { message: `Papel inválido — use um destes: ${TODOS_PAPEIS.join(', ')}` })
  papel: string;

  @IsOptional() @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id?: string;
}

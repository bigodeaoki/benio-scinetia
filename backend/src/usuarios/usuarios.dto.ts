import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';
import { PAPEIS_OPERACIONAIS } from '../auth/papeis';

// Usuário cadastrado pelo dono: papéis operacionais, numa empresa do grupo
export class UsuarioDto {
  @IsString() @Length(3, 120, { message: 'Informe o nome completo' })
  nome: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsOptional() @IsString({ message: 'Informe a senha' }) @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' }) @MaxLength(72, { message: 'Senha longa demais' })
  senha?: string;

  @IsIn(PAPEIS_OPERACIONAIS as unknown as string[], { message: `Papel inválido — o dono cadastra: ${PAPEIS_OPERACIONAIS.join(', ')}` })
  papel: string;

  @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id: string;
}

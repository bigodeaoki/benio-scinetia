import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { TODOS_PAPEIS } from '../auth/papeis';

export class UsuarioDto {
  @IsString() @Length(3, 120, { message: 'Informe o nome completo' })
  nome: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  // Obrigatória ao criar; ao editar, vazia mantém a atual
  @IsOptional() @IsString() @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' }) @MaxLength(72, { message: 'Senha longa demais' })
  senha?: string;

  @IsIn(TODOS_PAPEIS as unknown as string[], { message: `Papel inválido — use um destes: ${TODOS_PAPEIS.join(', ')}` })
  papel: string;

  @IsOptional() @IsBoolean({ message: 'Ativo deve ser verdadeiro ou falso' })
  ativo?: boolean;
}

export class AtivoDto {
  @IsBoolean({ message: 'Ativo deve ser verdadeiro ou falso' })
  ativo: boolean;
}

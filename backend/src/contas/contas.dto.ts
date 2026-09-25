import { IsString, Length } from 'class-validator';

export class ContaDto {
  @IsString() @Length(2, 150, { message: 'Nome da conta: entre 2 e 150 caracteres' })
  nome: string;
}

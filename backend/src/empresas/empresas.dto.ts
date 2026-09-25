import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class FilialDto {
  @IsString() @Length(2, 150, { message: 'Nome da filial: entre 2 e 150 caracteres' })
  nome: string;

  @IsOptional() @IsString() @Matches(/^([A-Z0-9]{12}\d{2})?$/i, { message: 'CNPJ inválido: 14 caracteres sem pontuação' })
  cnpj?: string;
}

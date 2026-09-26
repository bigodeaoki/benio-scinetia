import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

// Campos de texto do multipart de envio; o arquivo vai no campo "arquivo"
export class EnvioDocumentoDto {
  @IsOptional() @IsString() @Length(2, 150, { message: 'Título: entre 2 e 150 caracteres' })
  titulo?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Descrição: até 255 caracteres' })
  descricao?: string;
}

export class EdicaoDocumentoDto {
  @IsString() @Length(2, 150, { message: 'Título: entre 2 e 150 caracteres' })
  titulo: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Descrição: até 255 caracteres' })
  descricao?: string;
}

// O que o multer entrega (sem depender de @types/multer)
export interface ArquivoEnviado {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// 10 MB, alinhado ao client_max_body_size do nginx do frontend (12m com margem)
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;

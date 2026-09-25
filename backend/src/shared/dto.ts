import { IsBoolean } from 'class-validator';

// Corpo padrão de ativar/inativar, usado por toda entidade sem exclusão física
export class AtivoDto {
  @IsBoolean({ message: 'Ativo deve ser verdadeiro ou falso' })
  ativo: boolean;
}

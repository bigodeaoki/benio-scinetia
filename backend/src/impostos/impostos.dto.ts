import { IsNumber, IsString, Length, Max, Min } from 'class-validator';

// Imposto: nome e percentual. Incide sobre o custo global da produção na etapa de custos do pedido
export class ImpostoDto {
  @IsString() @Length(2, 100, { message: 'Nome: entre 2 e 100 caracteres' })
  nome: string;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Percentual deve ser um número (até 4 casas)' })
  @Min(0.0001, { message: 'Percentual: maior que zero e até 100 %' }) @Max(100, { message: 'Percentual: maior que zero e até 100 %' })
  percentual: number;
}

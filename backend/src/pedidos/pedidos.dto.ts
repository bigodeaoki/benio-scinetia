import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

// Etapas do pedido, na ordem. Cada etapa nova entra aqui e ganha suas colunas/tabelas
export const ETAPAS = [{ numero: 1, nome: 'Cliente e formulação' }];
export const STATUS_PEDIDO = ['rascunho', 'concluido', 'cancelado'] as const;

// Etapa 1: cliente do grupo e formulação (por id, ou por nome — reaproveita a
// existente ou cria uma nova só com o nome)
export class PedidoDto {
  @IsUUID('4', { message: 'Cliente inválido' })
  cliente_id: string;

  @IsOptional() @IsUUID('4', { message: 'Formulação inválida' })
  formulacao_id?: string;

  @IsOptional() @IsString() @Length(2, 150, { message: 'Formulação: nome entre 2 e 150 caracteres' })
  formulacao_nome?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Observações: até 255 caracteres' })
  observacoes?: string;

  // Empresa dona (só ao criar); sem informar, é a empresa ativa
  @IsOptional() @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id?: string;

  // Etapa onde o usuário parou, para retomar depois
  @IsOptional() @IsInt({ message: 'Etapa inválida' }) @Min(1, { message: 'Etapa inválida' }) @Max(ETAPAS.length, { message: `Etapa: no máximo ${ETAPAS.length}` })
  etapa?: number;
}

export class StatusPedidoDto {
  @IsIn(['rascunho', 'cancelado'], { message: 'Status: cancelado, ou rascunho para reabrir' })
  status: 'rascunho' | 'cancelado';
}

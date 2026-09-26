import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

// Etapas do pedido, na ordem. As não definidas já aparecem no stepper e ganham
// conteúdo conforme forem desenhadas
export const ETAPAS = [
  { numero: 1, nome: 'Formulação e amostras', definida: true },
  { numero: 2, nome: 'Etapa 2', definida: false },
  { numero: 3, nome: 'Etapa 3', definida: false },
  { numero: 4, nome: 'Etapa 4', definida: false },
];
export const STATUS_PEDIDO = ['rascunho', 'concluido', 'cancelado'] as const;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Cabeçalho: cliente do grupo e formulação (por id, ou por nome — reaproveita a
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

  @IsOptional() @IsInt({ message: 'Etapa inválida' }) @Min(1, { message: 'Etapa inválida' }) @Max(ETAPAS.length, { message: `Etapa: no máximo ${ETAPAS.length}` })
  etapa?: number;
}

export class StatusPedidoDto {
  @IsIn(['rascunho', 'cancelado'], { message: 'Status: cancelado, ou rascunho para reabrir' })
  status: 'rascunho' | 'cancelado';
}

export class EtapaDto {
  @IsInt({ message: 'Etapa inválida' }) @Min(1, { message: 'Etapa inválida' }) @Max(ETAPAS.length, { message: `Etapa: no máximo ${ETAPAS.length}` })
  etapa: number;
}

// Nova formulação do pedido: a atual entra em desuso (com o motivo, ex.: cliente não aprovou)
export class TrocaFormulacaoDto {
  @IsOptional() @IsUUID('4', { message: 'Formulação inválida' })
  formulacao_id?: string;

  @IsOptional() @IsString() @Length(2, 150, { message: 'Formulação: nome entre 2 e 150 caracteres' })
  formulacao_nome?: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Motivo: até 255 caracteres' })
  motivo?: string;
}

// Envio de amostra: gasto informativo, fora do custo do pedido
export class AmostraDto {
  // Padrão: a formulação ativa do pedido; pode ser qualquer uma do histórico
  @IsOptional() @IsUUID('4', { message: 'Formulação inválida' })
  formulacao_id?: string;

  @IsNumber({}, { message: 'Quantidade deve ser um número' }) @IsPositive({ message: 'Quantidade deve ser maior que zero' })
  quantidade: number;

  @IsOptional() @IsString() @Length(1, 20, { message: 'Unidade: entre 1 e 20 caracteres (kg, L, un…)' })
  unidade?: string;

  @IsOptional() @IsUUID('4', { message: 'Item de envase inválido' })
  envase_id?: string;

  @IsOptional() @IsInt({ message: 'Embalagens: número inteiro' }) @Min(0, { message: 'Embalagens não pode ser negativo' })
  embalagens?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Logística: valor em R$ com até 2 casas' }) @Min(0, { message: 'Logística não pode ser negativa' })
  logistica?: number;

  @Matches(DATA, { message: 'Data de envio: use AAAA-MM-DD' })
  data_envio: string;

  @IsOptional() @IsString() @MaxLength(255, { message: 'Observações: até 255 caracteres' })
  observacoes?: string;
}

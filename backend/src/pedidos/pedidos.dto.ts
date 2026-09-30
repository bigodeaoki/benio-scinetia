import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Etapas do pedido, na ordem. As não definidas já aparecem no stepper e ganham
// conteúdo conforme forem desenhadas
export const ETAPAS = [
  { numero: 1, nome: 'Formulação e amostras', definida: true },
  { numero: 2, nome: 'Produção', definida: true },
  { numero: 3, nome: 'Custos', definida: true },
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

  // Ao sair da etapa 1: o cliente aprovou a formulação ativa? A aprovação fica registrada nela
  @IsOptional() @IsBoolean({ message: 'cliente_aprovou deve ser verdadeiro ou falso' })
  cliente_aprovou?: boolean;
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

// Máquina usada no pedido. Sem rendimento informado, vale o do cadastro da máquina
export class MaquinaPedidoDto {
  @IsUUID('4', { message: 'Máquina inválida' })
  maquina_id: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Rendimento deve ser um número (%)' })
  @Min(0.01, { message: 'Rendimento: entre 0,01 e 100 %' }) @Max(100, { message: 'Rendimento: entre 0,01 e 100 %' })
  rendimento_pct?: number;

  // Horas de produção nesta máquina; custo = horas × custo-hora do cadastro (gravado na hora)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Horas deve ser um número (até 2 casas)' }) @Min(0, { message: 'Horas não pode ser negativo' })
  horas?: number;
}

// Utilitário consumido no pedido (energia, água…): quantidade × valor do cadastro, gravado na hora
export class UtilitarioPedidoDto {
  @IsUUID('4', { message: 'Utilitário inválido' })
  utilitario_id: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade do utilitário deve ser um número (até 3 casas)' }) @Min(0, { message: 'Quantidade do utilitário não pode ser negativa' })
  quantidade?: number;
}

// Etapa 2 (Produção): quantidade a produzir da formulação atual, na unidade que a empresa usar,
// e o maquinário. Sem a lista de máquinas, a que já está no pedido é mantida
export class ProducaoDto {
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade deve ser um número (até 3 casas)' }) @IsPositive({ message: 'Quantidade deve ser maior que zero' })
  quantidade: number;

  @IsString({ message: 'Informe a unidade' }) @Length(1, 20, { message: 'Unidade: entre 1 e 20 caracteres (kg, L, mL, un…)' })
  unidade: string;

  @IsOptional() @IsArray({ message: 'Máquinas: lista' }) @ArrayMaxSize(30, { message: 'No máximo 30 máquinas' })
  @ValidateNested({ each: true }) @Type(() => MaquinaPedidoDto)
  maquinas?: MaquinaPedidoDto[];

  // Sem a lista de utilitários, a que já está no pedido é mantida; lista vazia limpa
  @IsOptional() @IsArray({ message: 'Utilitários: lista' }) @ArrayMaxSize(30, { message: 'No máximo 30 utilitários' })
  @ValidateNested({ each: true }) @Type(() => UtilitarioPedidoDto)
  utilitarios?: UtilitarioPedidoDto[];
}

// Etapa 3 (Custos): uma linha de custo. Com referência a um cadastro, o nome vem de lá e o
// valor unitário, se não informado, é o custo-hora do cadastro; "outro" é custo avulso
export const TIPOS_CUSTO = ['materia_prima', 'envase', 'maquina', 'mao_de_obra', 'veiculo', 'outro'] as const;

export class CustoDto {
  @IsIn(TIPOS_CUSTO as unknown as string[], { message: 'Tipo de custo inválido' })
  tipo: string;

  @IsOptional() @IsUUID('4', { message: 'Item do custo inválido' })
  referencia_id?: string;

  @IsOptional() @IsString() @MaxLength(150, { message: 'Descrição: até 150 caracteres' })
  descricao?: string;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Quantidade deve ser um número (até 3 casas)' }) @Min(0, { message: 'Quantidade não pode ser negativa' })
  quantidade: number;

  @IsOptional() @IsString() @Length(1, 20, { message: 'Unidade: entre 1 e 20 caracteres' })
  unidade?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Valor unitário deve ser um número (até 4 casas)' }) @Min(0, { message: 'Valor unitário não pode ser negativo' })
  valor_unitario?: number;
}

export class CustosDto {
  @IsArray({ message: 'Itens: lista' }) @ArrayMaxSize(200, { message: 'No máximo 200 linhas de custo' })
  @ValidateNested({ each: true }) @Type(() => CustoDto)
  itens: CustoDto[];
}

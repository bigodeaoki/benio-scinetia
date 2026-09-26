import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { AmostraDto, ETAPAS, EtapaDto, PedidoDto, StatusPedidoDto, TrocaFormulacaoDto } from './pedidos.dto';
import { PedidosService } from './pedidos.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });
const Escrita = () => Papeis(...PERM.pedidos);

@Controller('pedidos')
export class PedidosController {
  constructor(private service: PedidosService) {}

  // Todo o grupo lê; ?empresa=<uuid> e ?status=<rascunho|concluido|cancelado> filtram
  @Get()
  listar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Query('empresa') empresa?: string, @Query('status') status?: string) {
    return this.service.listar(escopo, empresaId, { empresa: empresa || undefined, status: status || undefined });
  }

  @Get('etapas')
  etapas() {
    return ETAPAS;
  }

  // Cabeçalho + histórico de formulações + envios de amostra (com resumo)
  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.detalhar(escopo, empresaId, id);
  }

  @Escrita() @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: PedidoDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Escrita() @Put(':id/status')
  alterarStatus(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: StatusPedidoDto) {
    return this.service.alterarStatus(escopo, empresaId, usuario.id, id, dto.status);
  }

  // Etapa onde o usuário parou (o stepper)
  @Escrita() @Put(':id/etapa')
  definirEtapa(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: EtapaDto) {
    return this.service.definirEtapa(escopo, empresaId, usuario.id, id, dto.etapa);
  }

  // Nova formulação do pedido: a atual entra em desuso
  @Escrita() @Post(':id/formulacoes')
  trocarFormulacao(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: TrocaFormulacaoDto) {
    return this.service.trocarFormulacao(escopo, empresaId, usuario.id, id, dto);
  }

  @Escrita() @Post(':id/amostras')
  registrarAmostra(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AmostraDto) {
    return this.service.registrarAmostra(escopo, empresaId, usuario.id, id, dto);
  }

  @Escrita() @Put(':id/amostras/:amostraId/ativo')
  alterarAtivoAmostra(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Param('amostraId', Uuid()) amostraId: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivoAmostra(escopo, empresaId, usuario.id, id, amostraId, dto.ativo);
  }

  @Escrita() @Put(':id/amostras/:amostraId')
  atualizarAmostra(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Param('amostraId', Uuid()) amostraId: string, @Body() dto: AmostraDto) {
    return this.service.atualizarAmostra(escopo, empresaId, usuario.id, id, amostraId, dto);
  }

  @Escrita() @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: PedidoDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

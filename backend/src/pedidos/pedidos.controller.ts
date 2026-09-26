import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { ETAPAS, PedidoDto, StatusPedidoDto } from './pedidos.dto';
import { PedidosService } from './pedidos.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

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

  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(escopo, empresaId, id);
  }

  @Papeis(...PERM.pedidos)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: PedidoDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.pedidos)
  @Put(':id/status')
  alterarStatus(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: StatusPedidoDto) {
    return this.service.alterarStatus(escopo, empresaId, usuario.id, id, dto.status);
  }

  @Papeis(...PERM.pedidos)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: PedidoDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { ClienteDto } from './clientes.dto';
import { ClientesService } from './clientes.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('clientes')
export class ClientesController {
  constructor(private service: ClientesService) {}

  // Todo o grupo lê; ?empresa=<uuid> filtra por uma empresa do grupo
  @Get()
  listar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Query('empresa') empresa?: string) {
    return this.service.listar(escopo, empresaId, empresa || undefined);
  }

  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(escopo, empresaId, id);
  }

  @Papeis(...PERM.clientes)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: ClienteDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.clientes)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.clientes)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: ClienteDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

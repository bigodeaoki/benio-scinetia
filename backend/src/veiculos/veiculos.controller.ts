import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { VeiculoDto } from './veiculos.dto';
import { VeiculosService } from './veiculos.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('veiculos')
export class VeiculosController {
  constructor(private service: VeiculosService) {}

  @Get()
  listar(@EmpresaId() empresaId: string) {
    return this.service.listar(empresaId);
  }

  @Get(':id')
  ver(@EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(empresaId, id);
  }

  @Papeis(...PERM.veiculos)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: VeiculoDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.veiculos)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.veiculos)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: VeiculoDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

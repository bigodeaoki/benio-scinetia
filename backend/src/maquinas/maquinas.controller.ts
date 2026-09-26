import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { MaquinaDto } from './maquinas.dto';
import { MaquinasService } from './maquinas.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('maquinas')
export class MaquinasController {
  constructor(private service: MaquinasService) {}

  @Get()
  // ?empresa=<uuid> filtra por uma empresa do escopo
  listar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Query('empresa') empresa?: string) {
    return this.service.listar(escopo, empresaId, empresa || undefined);
  }

  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(escopo, empresaId, id);
  }

  @Papeis(...PERM.maquinas)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: MaquinaDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.maquinas)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.maquinas)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: MaquinaDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

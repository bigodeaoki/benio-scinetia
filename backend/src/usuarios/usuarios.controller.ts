import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { UsuarioDto } from './usuarios.dto';
import { UsuariosService } from './usuarios.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('usuarios')
@Papeis(...PERM.usuarios)
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Get()
  listar(@Escopo() escopo: EscopoSessao) {
    return this.service.listar(escopo);
  }

  @Post()
  criar(@Escopo() escopo: EscopoSessao, @UsuarioAtual() usuario: any, @Body() dto: UsuarioDto) {
    return this.service.criar(escopo, usuario.id, dto);
  }

  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, usuario.id, id, dto.ativo);
  }

  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: UsuarioDto) {
    return this.service.atualizar(escopo, usuario.id, id, dto);
  }
}

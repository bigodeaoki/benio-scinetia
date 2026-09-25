import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ContaId, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto, UsuarioDto } from './usuarios.dto';
import { UsuariosService } from './usuarios.service';

@Controller('usuarios')
@Papeis(...PERM.usuarios)
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Get()
  listar(@ContaId() contaId: number) {
    return this.service.listar(contaId);
  }

  @Post()
  criar(@ContaId() contaId: number, @UsuarioAtual() usuario: any, @Body() dto: UsuarioDto) {
    return this.service.criar(contaId, usuario.id, dto);
  }

  @Put(':id/ativo')
  alterarAtivo(@ContaId() contaId: number, @UsuarioAtual() usuario: any, @Param('id', ParseIntPipe) id: number, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(contaId, usuario.id, id, dto.ativo);
  }

  @Put(':id')
  atualizar(@ContaId() contaId: number, @UsuarioAtual() usuario: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UsuarioDto) {
    return this.service.atualizar(contaId, usuario.id, id, dto);
  }
}

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ContaId, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { EmpresaDto } from './empresas.dto';
import { EmpresasService } from './empresas.service';

@Controller('empresas')
export class EmpresasController {
  constructor(private service: EmpresasService) {}

  @Get()
  listar(@ContaId() contaId: number) {
    return this.service.listar(contaId);
  }

  @Papeis(...PERM.empresas)
  @Post()
  criar(@ContaId() contaId: number, @UsuarioAtual() usuario: any, @Body() dto: EmpresaDto) {
    return this.service.criar(contaId, usuario.id, dto);
  }

  @Papeis(...PERM.empresas)
  @Put(':id')
  atualizar(@ContaId() contaId: number, @UsuarioAtual() usuario: any, @Param('id', ParseIntPipe) id: number, @Body() dto: EmpresaDto) {
    return this.service.atualizar(contaId, usuario.id, id, dto);
  }

  @Papeis(...PERM.empresas)
  @Delete(':id')
  remover(@ContaId() contaId: number, @UsuarioAtual() usuario: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.remover(contaId, usuario.id, id);
  }
}

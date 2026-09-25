import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { FilialDto } from './empresas.dto';
import { EmpresasService } from './empresas.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('empresas')
export class EmpresasController {
  constructor(private service: EmpresasService) {}

  @Get()
  listar(@Escopo() escopo: EscopoSessao) {
    return this.service.listar(escopo);
  }

  @Papeis(...PERM.filiais)
  @Post('filiais')
  criarFilial(@Escopo() escopo: EscopoSessao, @UsuarioAtual() usuario: any, @Body() dto: FilialDto) {
    return this.service.criarFilial(escopo, usuario.id, dto);
  }

  @Papeis(...PERM.filiais)
  @Put('filiais/:id/ativo')
  alterarAtivoFilial(@Escopo() escopo: EscopoSessao, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivoFilial(escopo, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.filiais)
  @Put('filiais/:id')
  atualizarFilial(@Escopo() escopo: EscopoSessao, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: FilialDto) {
    return this.service.atualizarFilial(escopo, usuario.id, id, dto);
  }
}

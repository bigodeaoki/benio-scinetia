import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { ImpostoDto } from './impostos.dto';
import { ImpostosService } from './impostos.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('impostos')
export class ImpostosController {
  constructor(private service: ImpostosService) {}

  // Sem parâmetros: o que a empresa ativa pode usar. ?grupo=1 ou ?empresa=<uuid>: a tela de cadastro (a dona vê o grupo)
  @Get()
  listar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Query('grupo') grupo?: string, @Query('empresa') empresa?: string) {
    return this.service.listar(escopo, empresaId, { grupo: grupo === '1' || grupo === 'true', empresa: empresa || undefined });
  }

  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscarGerenciavel(escopo, empresaId, id);
  }

  @Papeis(...PERM.impostos)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: ImpostoDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.impostos)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.impostos)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: ImpostoDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { EntradaEstoqueDto } from './estoque.dto';
import { EstoqueService } from './estoque.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('estoque')
export class EstoqueController {
  constructor(private service: EstoqueService) {}

  // ?materia=<uuid> ou ?envase=<uuid> filtram por item
  @Get()
  listar(@EmpresaId() empresaId: string, @Query('materia') materia?: string, @Query('envase') envase?: string) {
    return this.service.listar(empresaId, { materia: materia || undefined, envase: envase || undefined });
  }

  @Get('resumo')
  resumo(@EmpresaId() empresaId: string) {
    return this.service.resumo(empresaId);
  }

  @Get(':id')
  ver(@EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(empresaId, id);
  }

  @Papeis(...PERM.estoque)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: EntradaEstoqueDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.estoque)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.estoque)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: EntradaEstoqueDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

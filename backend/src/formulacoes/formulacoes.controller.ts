import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { FormulacaoDto } from './formulacoes.dto';
import { FormulacoesService } from './formulacoes.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('formulacoes')
export class FormulacoesController {
  constructor(private service: FormulacoesService) {}

  @Get()
  // ?q=<texto> (3+ caracteres) busca por nome, para o autocomplete do pedido
  listar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Query('q') q?: string) {
    return this.service.listar(escopo, empresaId, q);
  }

  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(escopo, empresaId, id);
  }

  @Papeis(...PERM.formulacoes)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: FormulacaoDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.formulacoes)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.formulacoes)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: FormulacaoDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { FuncionarioDto } from './funcionarios.dto';
import { FuncionariosService } from './funcionarios.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

// Leitura também restrita: custo-hora e documento são dados sensíveis
@Controller('funcionarios')
export class FuncionariosController {
  constructor(private service: FuncionariosService) {}

  @Papeis(...PERM.funcionarios)
  @Get()
  listar(@EmpresaId() empresaId: string) {
    return this.service.listar(empresaId);
  }

  @Papeis(...PERM.funcionarios)
  @Get(':id')
  ver(@EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(empresaId, id);
  }

  @Papeis(...PERM.funcionarios)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: FuncionarioDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.funcionarios)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.funcionarios)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: FuncionarioDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

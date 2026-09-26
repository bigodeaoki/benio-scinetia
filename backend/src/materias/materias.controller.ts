import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { MateriaDto } from './materias.dto';
import { MateriasService } from './materias.service';

// Ids são UUID: o pipe recusa qualquer outro formato antes de chegar ao banco
const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('materias')
export class MateriasController {
  constructor(private service: MateriasService) {}

  @Get()
  // Sem parâmetros: o que a empresa ativa pode usar. ?grupo=1 ou ?empresa=<uuid>: a tela de cadastro (a dona vê o grupo)
  listar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Query('grupo') grupo?: string, @Query('empresa') empresa?: string) {
    return this.service.listar(escopo, empresaId, { grupo: grupo === '1' || grupo === 'true', empresa: empresa || undefined });
  }

  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscarGerenciavel(escopo, empresaId, id);
  }

  @Papeis(...PERM.materias)
  @Post()
  criar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: MateriaDto) {
    return this.service.criar(escopo, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.materias)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.materias)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: MateriaDto) {
    return this.service.atualizar(escopo, empresaId, usuario.id, id, dto);
  }
}

import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { EmpresaId, MatrizId, Papeis, UsuarioAtual } from '../auth/decorators';
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
  listar(@EmpresaId() empresaId: string) {
    return this.service.listar(empresaId);
  }

  @Get(':id')
  ver(@EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(empresaId, id);
  }

  @Papeis(...PERM.materias)
  @Post()
  criar(@MatrizId() matrizId: string | null, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Body() dto: MateriaDto) {
    return this.service.criar(matrizId, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.materias)
  @Put(':id/ativo')
  alterarAtivo(@MatrizId() matrizId: string | null, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(matrizId, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.materias)
  @Put(':id')
  atualizar(@MatrizId() matrizId: string | null, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: MateriaDto) {
    return this.service.atualizar(matrizId, empresaId, usuario.id, id, dto);
  }
}

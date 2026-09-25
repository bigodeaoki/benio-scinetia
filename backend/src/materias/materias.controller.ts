import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ContaId, EmpresaId, Papeis, UsuarioAtual } from '../auth/decorators';
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
  listar(@EmpresaId() empresaId: number) {
    return this.service.listar(empresaId);
  }

  @Get(':id')
  ver(@EmpresaId() empresaId: number, @Param('id', Uuid()) id: string) {
    return this.service.buscar(empresaId, id);
  }

  @Papeis(...PERM.materias)
  @Post()
  criar(@ContaId() contaId: number, @EmpresaId() empresaId: number, @UsuarioAtual() usuario: any, @Body() dto: MateriaDto) {
    return this.service.criar(contaId, empresaId, usuario.id, dto);
  }

  @Papeis(...PERM.materias)
  @Put(':id/ativo')
  alterarAtivo(@ContaId() contaId: number, @EmpresaId() empresaId: number, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(contaId, empresaId, usuario.id, id, dto.ativo);
  }

  @Papeis(...PERM.materias)
  @Put(':id')
  atualizar(@ContaId() contaId: number, @EmpresaId() empresaId: number, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: MateriaDto) {
    return this.service.atualizar(contaId, empresaId, usuario.id, id, dto);
  }
}

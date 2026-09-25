import { Body, Controller, Get, Put } from '@nestjs/common';
import { ContaId, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { ContaDto } from './contas.dto';
import { ContasService } from './contas.service';

@Controller('conta')
export class ContasController {
  constructor(private service: ContasService) {}

  @Get()
  ver(@ContaId() contaId: number) {
    return this.service.ver(contaId);
  }

  @Papeis(...PERM.conta)
  @Put()
  atualizar(@ContaId() contaId: number, @UsuarioAtual() usuario: any, @Body() dto: ContaDto) {
    return this.service.atualizar(contaId, usuario.id, dto);
  }
}

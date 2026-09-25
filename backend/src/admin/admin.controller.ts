import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { EmpresaAdminDto, NovaEmpresaDto, UsuarioAdminDto } from './admin.dto';
import { AdminService } from './admin.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

// Tudo aqui é só do admin global
@Controller('admin')
@Papeis(...PERM.admin)
export class AdminController {
  constructor(private service: AdminService) {}

  @Get('empresas')
  listarEmpresas() {
    return this.service.listarEmpresas();
  }

  @Post('empresas')
  criarEmpresa(@UsuarioAtual() admin: any, @Body() dto: NovaEmpresaDto) {
    return this.service.criarEmpresa(admin.id, dto);
  }

  @Put('empresas/:id/ativo')
  alterarAtivoEmpresa(@UsuarioAtual() admin: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivoEmpresa(admin.id, id, dto.ativo);
  }

  @Put('empresas/:id')
  atualizarEmpresa(@UsuarioAtual() admin: any, @Param('id', Uuid()) id: string, @Body() dto: EmpresaAdminDto) {
    return this.service.atualizarEmpresa(admin.id, id, dto);
  }

  @Get('usuarios')
  listarUsuarios() {
    return this.service.listarUsuarios();
  }

  @Post('usuarios')
  criarUsuario(@UsuarioAtual() admin: any, @Body() dto: UsuarioAdminDto) {
    return this.service.criarUsuario(admin.id, dto);
  }

  @Put('usuarios/:id/ativo')
  alterarAtivoUsuario(@UsuarioAtual() admin: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivoUsuario(admin.id, id, dto.ativo);
  }

  @Put('usuarios/:id')
  atualizarUsuario(@UsuarioAtual() admin: any, @Param('id', Uuid()) id: string, @Body() dto: UsuarioAdminDto) {
    return this.service.atualizarUsuario(admin.id, id, dto);
  }
}

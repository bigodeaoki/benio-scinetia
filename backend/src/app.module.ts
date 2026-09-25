import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/database.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { ContasModule } from './contas/contas.module';
import { EmpresasModule } from './empresas/empresas.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { MateriasModule } from './materias/materias.module';

@Module({
  imports: [DatabaseModule, AuditoriaModule, AuthModule, ContasModule, EmpresasModule, UsuariosModule, MateriasModule],
})
export class AppModule {}

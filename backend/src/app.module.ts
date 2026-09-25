import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/database.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { EmpresasModule } from './empresas/empresas.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { MateriasModule } from './materias/materias.module';
import { PainelModule } from './painel/painel.module';

@Module({
  imports: [DatabaseModule, AuditoriaModule, AuthModule, AdminModule, EmpresasModule, UsuariosModule, MateriasModule, PainelModule],
})
export class AppModule {}

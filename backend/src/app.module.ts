import { Module } from '@nestjs/common';
import { DatabaseModule } from './db/database.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { EmpresasModule } from './empresas/empresas.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { MateriasModule } from './materias/materias.module';
import { PainelModule } from './painel/painel.module';
import { EstoqueModule } from './estoque/estoque.module';
import { FormulacoesModule } from './formulacoes/formulacoes.module';
import { EnvasesModule } from './envases/envases.module';
import { MaquinasModule } from './maquinas/maquinas.module';
import { VeiculosModule } from './veiculos/veiculos.module';
import { FuncionariosModule } from './funcionarios/funcionarios.module';
import { DocumentosModule } from './documentos/documentos.module';

@Module({
  imports: [DatabaseModule, AuditoriaModule, AuthModule, AdminModule, EmpresasModule, UsuariosModule, MateriasModule, PainelModule, EstoqueModule, FormulacoesModule, EnvasesModule, MaquinasModule, VeiculosModule, FuncionariosModule, DocumentosModule],
})
export class AppModule {}

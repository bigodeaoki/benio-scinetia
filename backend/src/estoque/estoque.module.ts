import { Module } from '@nestjs/common';
import { EnvasesModule } from '../envases/envases.module';
import { MateriasModule } from '../materias/materias.module';
import { EstoqueController } from './estoque.controller';
import { EstoqueService } from './estoque.service';

@Module({ imports: [MateriasModule, EnvasesModule], controllers: [EstoqueController], providers: [EstoqueService] })
export class EstoqueModule {}

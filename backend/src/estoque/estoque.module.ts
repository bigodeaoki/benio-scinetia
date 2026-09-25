import { Module } from '@nestjs/common';
import { MateriasModule } from '../materias/materias.module';
import { EstoqueController } from './estoque.controller';
import { EstoqueService } from './estoque.service';

@Module({ imports: [MateriasModule], controllers: [EstoqueController], providers: [EstoqueService] })
export class EstoqueModule {}

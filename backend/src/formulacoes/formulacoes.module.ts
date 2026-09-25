import { Module } from '@nestjs/common';
import { MateriasModule } from '../materias/materias.module';
import { FormulacoesController } from './formulacoes.controller';
import { FormulacoesService } from './formulacoes.service';

@Module({ imports: [MateriasModule], controllers: [FormulacoesController], providers: [FormulacoesService], exports: [FormulacoesService] })
export class FormulacoesModule {}

import { Module } from '@nestjs/common';
import { FormulacoesModule } from '../formulacoes/formulacoes.module';
import { EnvasesModule } from '../envases/envases.module';
import { MateriasModule } from '../materias/materias.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({ imports: [FormulacoesModule, MateriasModule, EnvasesModule], controllers: [PedidosController], providers: [PedidosService], exports: [PedidosService] })
export class PedidosModule {}

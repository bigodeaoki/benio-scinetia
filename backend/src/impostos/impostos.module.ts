import { Module } from '@nestjs/common';
import { MateriasModule } from '../materias/materias.module';
import { ImpostosController } from './impostos.controller';
import { ImpostosService } from './impostos.service';

@Module({ imports: [MateriasModule], controllers: [ImpostosController], providers: [ImpostosService], exports: [ImpostosService] })
export class ImpostosModule {}

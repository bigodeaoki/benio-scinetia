import { Module } from '@nestjs/common';
import { MateriasModule } from '../materias/materias.module';
import { EnvasesController } from './envases.controller';
import { EnvasesService } from './envases.service';

@Module({ imports: [MateriasModule], controllers: [EnvasesController], providers: [EnvasesService], exports: [EnvasesService] })
export class EnvasesModule {}

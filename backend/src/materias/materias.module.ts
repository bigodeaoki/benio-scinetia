import { Module } from '@nestjs/common';
import { MateriasController } from './materias.controller';
import { MateriasService } from './materias.service';

@Module({ controllers: [MateriasController], providers: [MateriasService], exports: [MateriasService] })
export class MateriasModule {}

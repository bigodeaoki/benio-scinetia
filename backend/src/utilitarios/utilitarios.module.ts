import { Module } from '@nestjs/common';
import { UtilitariosController } from './utilitarios.controller';
import { UtilitariosService } from './utilitarios.service';

@Module({ controllers: [UtilitariosController], providers: [UtilitariosService], exports: [UtilitariosService] })
export class UtilitariosModule {}

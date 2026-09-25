import { Controller, Get } from '@nestjs/common';
import { Escopo, EscopoSessao } from '../auth/decorators';
import { PainelService } from './painel.service';

@Controller('painel')
export class PainelController {
  constructor(private service: PainelService) {}

  @Get()
  ver(@Escopo() escopo: EscopoSessao) {
    return this.service.ver(escopo);
  }
}

import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { EmpresaId, Escopo, EscopoSessao, Papeis, UsuarioAtual } from '../auth/decorators';
import { PERM } from '../auth/papeis';
import { AtivoDto } from '../shared/dto';
import { ArquivoEnviado, EdicaoDocumentoDto, EnvioDocumentoDto, TAMANHO_MAXIMO } from './documentos.dto';
import { DocumentosService } from './documentos.service';

const Uuid = () => new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('Identificador inválido') });

@Controller('documentos')
export class DocumentosController {
  constructor(private service: DocumentosService) {}

  @Get()
  listar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string) {
    return this.service.listar(escopo, empresaId);
  }

  @Get(':id')
  ver(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @Param('id', Uuid()) id: string) {
    return this.service.buscar(escopo, empresaId, id);
  }

  // Baixar marca o status do lado de quem baixa: matriz ou filial, conforme a empresa ativa
  @Get(':id/arquivo')
  async baixar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Res({ passthrough: true }) res: Response) {
    const { doc, conteudo } = await this.service.baixar(escopo, empresaId, usuario.id, id);
    const ascii = doc.nome_arquivo.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Content-Length', String(conteudo.length));
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.nome_arquivo)}`);
    return new StreamableFile(conteudo);
  }

  @Papeis(...PERM.documentos)
  @Post()
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO, files: 1 } }))
  enviar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @UploadedFile() arquivo: ArquivoEnviado | undefined, @Body() dto: EnvioDocumentoDto) {
    if (!arquivo) throw new BadRequestException('Envie um arquivo no campo "arquivo"');
    return this.service.criar(escopo, empresaId, usuario.id, arquivo, dto);
  }

  @Papeis(...PERM.documentos)
  @Put(':id/ativo')
  alterarAtivo(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: AtivoDto) {
    return this.service.alterarAtivo(escopo, empresaId, usuario, id, dto.ativo);
  }

  @Papeis(...PERM.documentos)
  @Put(':id')
  atualizar(@Escopo() escopo: EscopoSessao, @EmpresaId() empresaId: string, @UsuarioAtual() usuario: any, @Param('id', Uuid()) id: string, @Body() dto: EdicaoDocumentoDto) {
    return this.service.atualizar(escopo, empresaId, usuario, id, dto);
  }
}

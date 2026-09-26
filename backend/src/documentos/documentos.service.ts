import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { ArquivoEnviado, EdicaoDocumentoDto, EnvioDocumentoDto } from './documentos.dto';

// Nunca traz o conteúdo nas listagens: o blob só sai no download
const COLUNAS = `d.id, d.matriz_id, d.empresa_id, e.nome AS empresa_nome, d.usuario_id, u.nome AS usuario_nome, d.titulo, d.descricao,
  d.nome_arquivo, d.mime, d.tamanho, d.baixado_matriz, d.baixado_matriz_em, d.baixado_filial, d.baixado_filial_em,
  d.ativo, d.criado_em, d.atualizado_em`;
const JUNCOES = 'FROM documentos d JOIN empresas e ON e.id = d.empresa_id LEFT JOIN usuarios u ON u.id = d.usuario_id';

// Documentos do grupo (matriz + filiais). Qualquer usuário do grupo envia e
// baixa; o download marca o status do lado de quem baixou (matriz ou filial).
// Altera ou inativa quem enviou, a dona ou o administrativo.
@Injectable()
export class DocumentosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(escopo: EscopoSessao, empresaId: string) {
    const matriz = await this.grupoDe(escopo, empresaId);
    const [rows]: any = await this.pool.query(`SELECT ${COLUNAS} ${JUNCOES} WHERE d.matriz_id = ? ORDER BY d.ativo DESC, d.criado_em DESC`, [matriz]);
    return rows;
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    const matriz = await this.grupoDe(escopo, empresaId);
    const [rows]: any = await this.pool.query(`SELECT ${COLUNAS} ${JUNCOES} WHERE d.id = ? AND d.matriz_id = ?`, [id, matriz]);
    if (!rows.length) throw new NotFoundException('Documento não encontrado');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, arquivo: ArquivoEnviado, dto: EnvioDocumentoDto) {
    const matriz = await this.grupoDe(escopo, empresaId);
    if (!arquivo.size || !arquivo.buffer?.length) throw new BadRequestException('Arquivo vazio');
    const nome = this.nomeSeguro(arquivo.originalname);
    const titulo = dto.titulo?.trim() || nome.replace(/\.[^.]+$/, '') || 'Documento';
    const id = novoId();
    await this.pool.query(
      'INSERT INTO documentos (id, matriz_id, empresa_id, usuario_id, titulo, descricao, nome_arquivo, mime, tamanho, conteudo) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, matriz, empresaId, usuarioId, titulo, dto.descricao?.trim() || null, nome, arquivo.mimetype || 'application/octet-stream', arquivo.size, arquivo.buffer],
    );
    await this.auditoria.registrar(null, {
      matriz_id: matriz, empresa_id: empresaId, usuario_id: usuarioId, acao: 'documento.enviado', entidade: 'documentos', entidade_id: id,
      detalhes: { titulo, nome_arquivo: nome, tamanho: arquivo.size },
    });
    return this.buscar(escopo, empresaId, id);
  }

  // Entrega o conteúdo e marca o status do lado de quem baixa; a data é a do primeiro download
  async baixar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string) {
    const doc = await this.buscar(escopo, empresaId, id);
    if (!doc.ativo) throw new BadRequestException('Documento inativo');
    const [rows]: any = await this.pool.query('SELECT conteudo FROM documentos WHERE id = ?', [id]);
    const lado = empresaId === doc.matriz_id ? 'matriz' : 'filial';
    await this.pool.query(
      `UPDATE documentos SET baixado_${lado} = 1, baixado_${lado}_em = COALESCE(baixado_${lado}_em, NOW()), atualizado_em = atualizado_em WHERE id = ?`,
      [id],
    );
    await this.auditoria.registrar(null, {
      matriz_id: doc.matriz_id, empresa_id: empresaId, usuario_id: usuarioId, acao: 'documento.baixado', entidade: 'documentos', entidade_id: id,
      detalhes: { titulo: doc.titulo, por: lado },
    });
    return { doc, conteudo: rows[0].conteudo as Buffer };
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuario: { id: string; papel: string }, id: string, dto: EdicaoDocumentoDto) {
    const doc = await this.exigirGestao(escopo, empresaId, usuario, id);
    await this.pool.query('UPDATE documentos SET titulo=?, descricao=? WHERE id=?', [dto.titulo.trim(), dto.descricao?.trim() || null, id]);
    await this.auditoria.registrar(null, {
      matriz_id: doc.matriz_id, empresa_id: empresaId, usuario_id: usuario.id, acao: 'documento.alterado', entidade: 'documentos', entidade_id: id,
      detalhes: { titulo: dto.titulo.trim() },
    });
    return this.buscar(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuario: { id: string; papel: string }, id: string, ativo: boolean) {
    const doc = await this.exigirGestao(escopo, empresaId, usuario, id);
    await this.pool.query('UPDATE documentos SET ativo=? WHERE id=?', [ativo ? 1 : 0, id]);
    await this.auditoria.registrar(null, {
      matriz_id: doc.matriz_id, empresa_id: empresaId, usuario_id: usuario.id, acao: ativo ? 'documento.reativado' : 'documento.inativado', entidade: 'documentos', entidade_id: id,
      detalhes: { titulo: doc.titulo },
    });
    return this.buscar(escopo, empresaId, id);
  }

  // Quem altera ou inativa: quem enviou, a dona ou o administrativo
  private async exigirGestao(escopo: EscopoSessao, empresaId: string, usuario: { id: string; papel: string }, id: string) {
    const doc = await this.buscar(escopo, empresaId, id);
    if (doc.usuario_id !== usuario.id && !['owner', 'administrativo'].includes(usuario.papel)) {
      throw new ForbiddenException('Só quem enviou, a dona ou o administrativo alteram este documento');
    }
    return doc;
  }

  // Grupo (matriz) da empresa ativa. O admin não tem grupo: resolve pela empresa ativa
  private async grupoDe(escopo: EscopoSessao, empresaId: string): Promise<string> {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
    if (escopo.matrizId) return escopo.matrizId;
    const [rows]: any = await this.pool.query('SELECT id, matriz, empresa_id FROM empresas WHERE id = ?', [empresaId]);
    if (!rows.length) throw new NotFoundException('Empresa não encontrada');
    return rows[0].matriz ? rows[0].id : rows[0].empresa_id;
  }

  // Nome do arquivo: corrige o multipart decodificado como latin1, tira caracteres de caminho e limita o tamanho
  private nomeSeguro(nome: string) {
    let n = nome || 'arquivo';
    if (/[\x80-\xff]/.test(n)) {
      const corrigido = Buffer.from(n, 'latin1').toString('utf8');
      if (!corrigido.includes('�')) n = corrigido;
    }
    return n.normalize('NFC').replace(/[\/:*?"<>|\r\n\t]/g, '_').trim().slice(0, 255) || 'arquivo';
  }
}

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { cnpjValido, normalizarCnpj } from '../shared/cnpj';
import { novoId } from '../shared/ids';
import { ClienteDto, ResponsavelDto, UFS } from './clientes.dto';

const COLUNAS = `c.id, c.matriz_id, c.empresa_id, e.nome AS empresa_nome, c.razao_social, c.nome_fantasia, c.cnpj, c.inscricao_estadual,
  c.email, c.telefone, c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.observacoes,
  c.ativo, c.criado_em, c.atualizado_em, IF(c.empresa_id IN (?), 1, 0) AS editavel`;
const JUNCOES = 'FROM clientes c JOIN empresas e ON e.id = c.empresa_id';

// Clientes: cada empresa cadastra os seus e todo o grupo enxerga. Altera
// quem tem a empresa dona no escopo (a dona do grupo, qualquer um; os demais
// papéis, só os da sua empresa). Responsáveis são regravados a cada edição.
@Injectable()
export class ClientesService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(escopo: EscopoSessao, empresaId: string, filtroEmpresa?: string) {
    const matriz = await this.grupoDe(escopo, empresaId);
    if (filtroEmpresa) await this.exigirDoGrupo(matriz, filtroEmpresa);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} ${JUNCOES} WHERE c.matriz_id = ? ${filtroEmpresa ? 'AND c.empresa_id = ?' : ''} ORDER BY c.ativo DESC, c.razao_social`,
      filtroEmpresa ? [this.editaveis(escopo, empresaId), matriz, filtroEmpresa] : [this.editaveis(escopo, empresaId), matriz],
    );
    return this.anexarResponsaveis(rows);
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    const matriz = await this.grupoDe(escopo, empresaId);
    const [rows]: any = await this.pool.query(`SELECT ${COLUNAS} ${JUNCOES} WHERE c.id = ? AND c.matriz_id = ?`, [this.editaveis(escopo, empresaId), id, matriz]);
    if (!rows.length) throw new NotFoundException('Cliente não encontrado');
    return (await this.anexarResponsaveis(rows))[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: ClienteDto) {
    const matriz = await this.grupoDe(escopo, empresaId);
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const c = this.normalizar(dto);
    const id = novoId();
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      await cx.query(
        `INSERT INTO clientes (id, matriz_id, empresa_id, razao_social, nome_fantasia, cnpj, inscricao_estadual, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, observacoes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, matriz, dona, c.razao_social, c.nome_fantasia, c.cnpj, c.inscricao_estadual, c.email, c.telefone, c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.observacoes],
      );
      await this.gravarResponsaveis(cx, id, dto.responsaveis);
      await cx.commit();
    } catch (e: any) {
      await cx.rollback();
      await this.traduzir(e, matriz, c.cnpj);
    } finally {
      cx.release();
    }
    await this.auditoria.registrar(null, {
      matriz_id: matriz, empresa_id: dona, usuario_id: usuarioId, acao: 'cliente.criado', entidade: 'clientes', entidade_id: id,
      detalhes: { razao_social: c.razao_social, cnpj: c.cnpj, responsaveis: dto.responsaveis?.length || 0 },
    });
    return this.buscar(escopo, empresaId, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: ClienteDto) {
    const atual = await this.exigirEditavel(escopo, empresaId, id);
    const dona = this.empresaDona(escopo, atual.empresa_id, dto.empresa_id);
    const c = this.normalizar(dto);
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      await cx.query(
        `UPDATE clientes SET empresa_id=?, razao_social=?, nome_fantasia=?, cnpj=?, inscricao_estadual=?, email=?, telefone=?, cep=?, logradouro=?, numero=?, complemento=?, bairro=?, cidade=?, uf=?, observacoes=?
          WHERE id=?`,
        [dona, c.razao_social, c.nome_fantasia, c.cnpj, c.inscricao_estadual, c.email, c.telefone, c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.observacoes, id],
      );
      await cx.query('DELETE FROM cliente_responsaveis WHERE cliente_id = ?', [id]);
      await this.gravarResponsaveis(cx, id, dto.responsaveis);
      await cx.commit();
    } catch (e: any) {
      await cx.rollback();
      await this.traduzir(e, atual.matriz_id, c.cnpj);
    } finally {
      cx.release();
    }
    await this.auditoria.registrar(null, {
      matriz_id: atual.matriz_id, empresa_id: dona, usuario_id: usuarioId, acao: 'cliente.alterado', entidade: 'clientes', entidade_id: id,
      detalhes: { razao_social: c.razao_social, cnpj: c.cnpj, responsaveis: dto.responsaveis?.length || 0, ...(dona !== atual.empresa_id ? { movido_de: atual.empresa_id } : {}) },
    });
    return this.buscar(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.exigirEditavel(escopo, empresaId, id);
    await this.pool.query('UPDATE clientes SET ativo=? WHERE id=?', [ativo ? 1 : 0, id]);
    await this.auditoria.registrar(null, {
      matriz_id: atual.matriz_id, empresa_id: atual.empresa_id, usuario_id: usuarioId,
      acao: ativo ? 'cliente.reativado' : 'cliente.inativado', entidade: 'clientes', entidade_id: id, detalhes: { razao_social: atual.razao_social },
    });
    return this.buscar(escopo, empresaId, id);
  }

  // Anexa a lista de responsáveis (em ordem) a cada cliente, numa consulta só
  private async anexarResponsaveis(clientes: any[]) {
    if (!clientes.length) return clientes;
    const [resp]: any = await this.pool.query(
      'SELECT cliente_id, ordem, nome, cargo, telefone, email FROM cliente_responsaveis WHERE cliente_id IN (?) ORDER BY cliente_id, ordem',
      [clientes.map((c) => c.id)],
    );
    const porCliente = new Map<string, any[]>();
    for (const r of resp) {
      if (!porCliente.has(r.cliente_id)) porCliente.set(r.cliente_id, []);
      porCliente.get(r.cliente_id)!.push({ ordem: r.ordem, nome: r.nome, cargo: r.cargo, telefone: r.telefone, email: r.email });
    }
    return clientes.map((c) => ({ ...c, responsaveis: porCliente.get(c.id) || [] }));
  }

  private async gravarResponsaveis(cx: any, clienteId: string, responsaveis?: ResponsavelDto[]) {
    if (!responsaveis?.length) return;
    const linhas = responsaveis.map((r, i) => [clienteId, i + 1, r.nome.trim(), r.cargo?.trim() || null, r.telefone?.trim() || null, r.email?.trim().toLowerCase() || null]);
    await cx.query('INSERT INTO cliente_responsaveis (cliente_id, ordem, nome, cargo, telefone, email) VALUES ?', [linhas]);
  }

  // Limpa e valida o que o DTO não cobre: CNPJ (dígitos verificadores), UF (lista) e CEP (8 dígitos)
  private normalizar(dto: ClienteDto) {
    const cnpj = dto.cnpj ? normalizarCnpj(dto.cnpj) : null;
    if (cnpj && !cnpjValido(cnpj)) throw new BadRequestException('CNPJ inválido: confira os dígitos');
    const uf = dto.uf?.trim().toUpperCase() || null;
    if (uf && !UFS.includes(uf)) throw new BadRequestException('UF inválida');
    const cep = dto.cep ? dto.cep.replace(/\D/g, '') : null;
    if (cep && cep.length !== 8) throw new BadRequestException('CEP: 8 dígitos');
    const limpo = (v?: string) => v?.trim() || null;
    return {
      razao_social: dto.razao_social.trim(), nome_fantasia: limpo(dto.nome_fantasia), cnpj: cnpj || null, inscricao_estadual: limpo(dto.inscricao_estadual),
      email: dto.email?.trim().toLowerCase() || null, telefone: limpo(dto.telefone), cep: cep || null, logradouro: limpo(dto.logradouro), numero: limpo(dto.numero),
      complemento: limpo(dto.complemento), bairro: limpo(dto.bairro), cidade: limpo(dto.cidade), uf, observacoes: limpo(dto.observacoes),
    };
  }

  // Empresas cujos clientes o usuário altera: as do seu escopo (a dona, o grupo; os demais, só a ativa)
  private editaveis(escopo: EscopoSessao, empresaId: string): string[] {
    return escopo.empresaIds ?? [empresaId];
  }

  private async exigirEditavel(escopo: EscopoSessao, empresaId: string, id: string) {
    const c = await this.buscar(escopo, empresaId, id);
    if (!c.editavel) throw new ForbiddenException(`Cliente cadastrado por ${c.empresa_nome}: só essa empresa (ou a dona do grupo) altera`);
    return c;
  }

  // Empresa dona do cliente: a informada (se estiver no escopo) ou a ativa
  private empresaDona(escopo: EscopoSessao, empresaId: string, pedida?: string) {
    if (!pedida || pedida === empresaId) return empresaId;
    if (escopo.empresaIds && !escopo.empresaIds.includes(pedida)) throw new ForbiddenException('Sem acesso a esta empresa');
    return pedida;
  }

  // Grupo (matriz) da empresa ativa. O admin não tem grupo: resolve pela empresa ativa
  private async grupoDe(escopo: EscopoSessao, empresaId: string): Promise<string> {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
    if (escopo.matrizId) return escopo.matrizId;
    const [rows]: any = await this.pool.query('SELECT id, matriz, empresa_id FROM empresas WHERE id = ?', [empresaId]);
    if (!rows.length) throw new NotFoundException('Empresa não encontrada');
    return rows[0].matriz ? rows[0].id : rows[0].empresa_id;
  }

  private async exigirDoGrupo(matriz: string, empresaId: string) {
    const [rows]: any = await this.pool.query('SELECT id FROM empresas WHERE id = ? AND (id = ? OR empresa_id = ?)', [empresaId, matriz, matriz]);
    if (!rows.length) throw new ForbiddenException('Sem acesso a esta empresa');
  }

  // CNPJ repetido no grupo: diz quem já cadastrou
  private async traduzir(e: any, matriz: string, cnpj: string | null): Promise<never> {
    if (e?.code === 'ER_DUP_ENTRY' && cnpj) {
      const [rows]: any = await this.pool.query(`SELECT e.nome ${JUNCOES} WHERE c.matriz_id = ? AND c.cnpj = ?`, [matriz, cnpj]);
      throw new BadRequestException(`CNPJ já cadastrado no grupo${rows.length ? ` por ${rows[0].nome}` : ''}`);
    }
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') throw new BadRequestException('Empresa não encontrada');
    throw e;
  }
}

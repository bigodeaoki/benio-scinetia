import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { FuncionarioDto } from './funcionarios.dto';

const COLUNAS = `f.id, f.empresa_id, e.nome AS empresa_nome, f.nome, f.documento, f.email, f.categoria, f.custo_hora, f.data_admissao,
  f.status, f.ativo, f.criado_em, f.atualizado_em`;

// Mão de obra de cada empresa. Quem cadastra escolhe a empresa dona dentro
// do seu escopo (a dona pode apontar qualquer empresa do grupo; os demais só
// a sua). Documento e e-mail são únicos por empresa quando informados.
@Injectable()
export class FuncionariosService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM funcionarios f JOIN empresas e ON e.id = f.empresa_id WHERE f.empresa_id = ? ORDER BY f.ativo DESC, f.nome`,
      [empresaId],
    );
    return rows;
  }

  async buscar(empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM funcionarios f JOIN empresas e ON e.id = f.empresa_id WHERE f.id = ? AND f.empresa_id = ?`,
      [id, empresaId],
    );
    if (!rows.length) throw new NotFoundException('Funcionário não encontrado');
    return rows[0];
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: FuncionarioDto) {
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const f = this.normalizar(dto);
    const id = novoId();
    await this.pool
      .query('INSERT INTO funcionarios (id, empresa_id, nome, documento, email, categoria, custo_hora, data_admissao, status) VALUES (?,?,?,?,?,?,?,?,?)', [
        id, dona, f.nome, f.documento, f.email, f.categoria, f.custo_hora, f.data_admissao, f.status,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'funcionario.criado', entidade: 'funcionarios', entidade_id: id,
      detalhes: { nome: f.nome, categoria: f.categoria, custo_hora: f.custo_hora, status: f.status },
    });
    return this.buscar(dona, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: FuncionarioDto) {
    const atual = await this.buscar(empresaId, id);
    const dona = this.empresaDona(escopo, empresaId, dto.empresa_id);
    const f = this.normalizar(dto);
    await this.pool
      .query('UPDATE funcionarios SET empresa_id=?, nome=?, documento=?, email=?, categoria=?, custo_hora=?, data_admissao=?, status=? WHERE id=? AND empresa_id=?', [
        dona, f.nome, f.documento, f.email, f.categoria, f.custo_hora, f.data_admissao, f.status, id, empresaId,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'funcionario.alterado', entidade: 'funcionarios', entidade_id: id,
      detalhes: {
        nome: f.nome, categoria: f.categoria, custo_hora: f.custo_hora, status: f.status,
        ...(f.status !== atual.status ? { status_anterior: atual.status } : {}),
        ...(dona !== empresaId ? { movido_de: empresaId } : {}),
      },
    });
    return this.buscar(dona, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.buscar(empresaId, id);
    await this.pool.query('UPDATE funcionarios SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId,
      acao: ativo ? 'funcionario.reativado' : 'funcionario.inativado', entidade: 'funcionarios', entidade_id: id, detalhes: { nome: atual.nome },
    });
    return this.buscar(empresaId, id);
  }

  // Limpa os campos: documento sem pontuação e em maiúsculas, e-mail em minúsculas
  private normalizar(dto: FuncionarioDto) {
    const documento = dto.documento?.trim().toUpperCase().replace(/[\s.\-/]/g, '') || null;
    if (documento && (documento.length < 3 || documento.length > 20)) throw new BadRequestException('Documento: entre 3 e 20 caracteres');
    return {
      nome: dto.nome.trim(),
      documento,
      email: dto.email?.trim().toLowerCase() || null,
      categoria: dto.categoria.trim(),
      custo_hora: dto.custo_hora,
      data_admissao: dto.data_admissao || null,
      status: dto.status || 'ativo',
    };
  }

  // Empresa dona do funcionário: a informada (se estiver no escopo) ou a ativa
  private empresaDona(escopo: EscopoSessao, empresaId: string, pedida?: string) {
    this.exigirEmpresa(empresaId);
    if (!pedida || pedida === empresaId) return empresaId;
    if (escopo.empresaIds && !escopo.empresaIds.includes(pedida)) throw new ForbiddenException('Sem acesso a esta empresa');
    return pedida;
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') {
      const campo = /uk_funcionario_email/.test(e.message) ? 'este e-mail' : 'este documento';
      throw new BadRequestException(`Já existe funcionário com ${campo} nesta empresa`);
    }
    if (e?.code === 'ER_NO_REFERENCED_ROW_2') throw new BadRequestException('Empresa não encontrada');
    throw e;
  }
}

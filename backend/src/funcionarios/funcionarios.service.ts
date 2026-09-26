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

  // Tudo que está no escopo (a dona vê matriz + filiais; os demais só a sua empresa), com filtro opcional por empresa
  async listar(escopo: EscopoSessao, empresaId: string, filtroEmpresa?: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM funcionarios f JOIN empresas e ON e.id = f.empresa_id WHERE f.empresa_id IN (?) ORDER BY f.ativo DESC, e.matriz DESC, e.nome, f.nome`,
      [this.visiveis(escopo, empresaId, filtroEmpresa)],
    );
    return rows;
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM funcionarios f JOIN empresas e ON e.id = f.empresa_id WHERE f.id = ? AND f.empresa_id IN (?)`,
      [id, this.visiveis(escopo, empresaId)],
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
    return this.buscar(escopo, dona, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: FuncionarioDto) {
    const atual = await this.buscar(escopo, empresaId, id);
    const dona = this.empresaDona(escopo, atual.empresa_id, dto.empresa_id);
    const f = this.normalizar(dto);
    await this.pool
      .query('UPDATE funcionarios SET empresa_id=?, nome=?, documento=?, email=?, categoria=?, custo_hora=?, data_admissao=?, status=? WHERE id=? AND empresa_id=?', [
        dona, f.nome, f.documento, f.email, f.categoria, f.custo_hora, f.data_admissao, f.status, id, atual.empresa_id,
      ])
      .catch((e: any) => this.traduzir(e));
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: dona, usuario_id: usuarioId, acao: 'funcionario.alterado', entidade: 'funcionarios', entidade_id: id,
      detalhes: {
        nome: f.nome, categoria: f.categoria, custo_hora: f.custo_hora, status: f.status,
        ...(f.status !== atual.status ? { status_anterior: atual.status } : {}),
        ...(dona !== atual.empresa_id ? { movido_de: atual.empresa_id } : {}),
      },
    });
    return this.buscar(escopo, dona, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.buscar(escopo, empresaId, id);
    await this.pool.query('UPDATE funcionarios SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, atual.empresa_id]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: atual.empresa_id, usuario_id: usuarioId,
      acao: ativo ? 'funcionario.reativado' : 'funcionario.inativado', entidade: 'funcionarios', entidade_id: id, detalhes: { nome: atual.nome },
    });
    return this.buscar(escopo, atual.empresa_id, id);
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

  // Empresas cujos registros o usuário enxerga: as do escopo (admin: só a ativa). Com filtro, ele precisa estar entre elas
  private visiveis(escopo: EscopoSessao, empresaId: string, filtro?: string) {
    this.exigirEmpresa(empresaId);
    const ids = escopo.empresaIds ?? [empresaId];
    if (!filtro) return ids;
    if (!ids.includes(filtro)) throw new ForbiddenException('Sem acesso a esta empresa');
    return [filtro];
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

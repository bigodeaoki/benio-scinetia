import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { MateriasService } from '../materias/materias.service';
import { novoId } from '../shared/ids';
import { FormulacaoDto, ItemFormulacaoDto } from './formulacoes.dto';

const COLUNAS = (empresaId: string) => `f.id, f.nome, f.descricao, f.ativo, f.criado_em, f.atualizado_em, f.empresa_id,
  e.nome AS empresa_nome, IF(f.empresa_id = ${'?'}, 'propria', 'matriz') AS origem`;

// Formulações: lista ordenada de matérias-primas com quantidade. Mesma regra
// das matérias-primas: a filial enxerga as da matriz, só a dona altera a sua,
// e cada item precisa ser uma matéria-prima visível e ativa.
@Injectable()
export class FormulacoesService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService, private materias: MateriasService) {}

  async listar(escopo: EscopoSessao, empresaId: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS(empresaId)}, (SELECT COUNT(*) FROM formulacao_itens i WHERE i.formulacao_id = f.id) AS itens
         FROM formulacoes f JOIN empresas e ON e.id = f.empresa_id
        WHERE f.empresa_id IN (?) ORDER BY f.ativo DESC, origem, f.nome`,
      [empresaId, this.materias.visiveis(escopo, empresaId)],
    );
    return rows;
  }

  async buscar(escopo: EscopoSessao, empresaId: string, id: string) {
    this.exigirEmpresa(empresaId);
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS(empresaId)} FROM formulacoes f JOIN empresas e ON e.id = f.empresa_id
        WHERE f.id = ? AND f.empresa_id IN (?)`,
      [empresaId, id, this.materias.visiveis(escopo, empresaId)],
    );
    if (!rows.length) throw new NotFoundException('Formulação não encontrada');
    const [itens]: any = await this.pool.query(
      `SELECT i.materia_prima_id, m.nome AS materia_nome, m.ativo AS materia_ativa, i.ordem, i.quantidade, i.unidade
         FROM formulacao_itens i JOIN materias_primas m ON m.id = i.materia_prima_id
        WHERE i.formulacao_id = ? ORDER BY i.ordem, m.nome`,
      [id],
    );
    return { ...rows[0], itens };
  }

  async criar(escopo: EscopoSessao, empresaId: string, usuarioId: string, dto: FormulacaoDto) {
    this.exigirEmpresa(empresaId);
    const itens = await this.validarItens(escopo, empresaId, dto.itens);
    const id = novoId();
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('INSERT INTO formulacoes (id, empresa_id, matriz_id, nome, descricao) VALUES (?,?,?,?,?)', [
        id, empresaId, escopo.matrizId, dto.nome.trim(), dto.descricao?.trim() || null,
      ]).catch((e: any) => this.traduzir(e));
      await this.gravarItens(conn, id, itens);
      await this.auditoria.registrar(conn, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'formulacao.criada', entidade: 'formulacoes', entidade_id: id, detalhes: { nome: dto.nome.trim(), itens: itens.length } });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return this.buscar(escopo, empresaId, id);
  }

  async atualizar(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, dto: FormulacaoDto) {
    await this.exigirPropria(escopo, empresaId, id);
    const itens = await this.validarItens(escopo, empresaId, dto.itens);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      // atualizado_em explícito: trocar só os itens não mexe na linha da formulação
      await conn.query('UPDATE formulacoes SET nome=?, descricao=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=? AND empresa_id=?', [
        dto.nome.trim(), dto.descricao?.trim() || null, id, empresaId,
      ]).catch((e: any) => this.traduzir(e));
      await conn.query('DELETE FROM formulacao_itens WHERE formulacao_id=?', [id]);
      await this.gravarItens(conn, id, itens);
      await this.auditoria.registrar(conn, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: 'formulacao.alterada', entidade: 'formulacoes', entidade_id: id, detalhes: { nome: dto.nome.trim(), itens: itens.length } });
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return this.buscar(escopo, empresaId, id);
  }

  async alterarAtivo(escopo: EscopoSessao, empresaId: string, usuarioId: string, id: string, ativo: boolean) {
    const atual = await this.exigirPropria(escopo, empresaId, id);
    await this.pool.query('UPDATE formulacoes SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, empresaId]);
    await this.auditoria.registrar(null, { matriz_id: escopo.matrizId, empresa_id: empresaId, usuario_id: usuarioId, acao: ativo ? 'formulacao.reativada' : 'formulacao.inativada', entidade: 'formulacoes', entidade_id: id, detalhes: { nome: atual.nome } });
    return this.buscar(escopo, empresaId, id);
  }

  // Cada item: matéria-prima visível (própria ou da matriz) e ativa, sem repetição
  private async validarItens(escopo: EscopoSessao, empresaId: string, itens: ItemFormulacaoDto[]) {
    const vistos = new Set<string>();
    const prontos: Array<{ materia_prima_id: string; quantidade: number; unidade: string }> = [];
    for (const item of itens) {
      if (vistos.has(item.materia_prima_id)) throw new BadRequestException('Matéria-prima repetida na formulação');
      vistos.add(item.materia_prima_id);
      const mp = await this.materias.buscar(escopo, empresaId, item.materia_prima_id).catch(() => {
        throw new BadRequestException('Matéria-prima não encontrada nesta empresa nem na matriz');
      });
      if (!mp.ativo) throw new BadRequestException(`Matéria-prima "${mp.nome}" está inativa`);
      prontos.push({ materia_prima_id: mp.id, quantidade: item.quantidade, unidade: item.unidade?.trim() || mp.unidade });
    }
    return prontos;
  }

  private async gravarItens(conn: any, formulacaoId: string, itens: Array<{ materia_prima_id: string; quantidade: number; unidade: string }>) {
    for (let i = 0; i < itens.length; i++) {
      await conn.query('INSERT INTO formulacao_itens (formulacao_id, materia_prima_id, ordem, quantidade, unidade) VALUES (?,?,?,?,?)', [
        formulacaoId, itens[i].materia_prima_id, i + 1, itens[i].quantidade, itens[i].unidade,
      ]);
    }
  }

  private async exigirPropria(escopo: EscopoSessao, empresaId: string, id: string) {
    const f = await this.buscar(escopo, empresaId, id);
    if (f.origem !== 'propria') throw new ForbiddenException('Formulação da matriz: só a matriz altera');
    return f;
  }

  private exigirEmpresa(empresaId: string) {
    if (!empresaId) throw new BadRequestException('Escolha a empresa ativa antes');
  }

  private traduzir(e: any): never {
    if (e?.code === 'ER_DUP_ENTRY') throw new BadRequestException('Já existe formulação com este nome nesta empresa');
    throw e;
  }
}

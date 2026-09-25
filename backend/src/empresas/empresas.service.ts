import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';
import { FilialDto } from './empresas.dto';

const COLUNAS = 'id, nome, cnpj, matriz, filial, empresa_id, ativo, criado_em, atualizado_em';

// Empresas do escopo do usuário (grupo do dono, ou a própria empresa) e as
// filiais, que só o dono cadastra — sempre debaixo da sua matriz.
@Injectable()
export class EmpresasService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(escopo: EscopoSessao) {
    const [rows]: any = escopo.empresaIds
      ? await this.pool.query(`SELECT ${COLUNAS} FROM empresas WHERE id IN (?) ORDER BY matriz DESC, nome`, [escopo.empresaIds])
      : await this.pool.query(`SELECT ${COLUNAS} FROM empresas ORDER BY COALESCE(empresa_id, id), matriz DESC, nome`);
    return rows;
  }

  async criarFilial(escopo: EscopoSessao, usuarioId: string, dto: FilialDto) {
    const id = novoId();
    await this.pool.query(
      'INSERT INTO empresas (id, nome, cnpj, matriz, filial, empresa_id) VALUES (?,?,?,0,1,?)',
      [id, dto.nome.trim(), dto.cnpj ? dto.cnpj.toUpperCase() : null, escopo.matrizId],
    );
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: id, usuario_id: usuarioId,
      acao: 'filial.criada', entidade: 'empresas', entidade_id: id, detalhes: { nome: dto.nome.trim() },
    });
    return this.buscarFilial(escopo, id);
  }

  async atualizarFilial(escopo: EscopoSessao, usuarioId: string, id: string, dto: FilialDto) {
    await this.buscarFilial(escopo, id);
    await this.pool.query('UPDATE empresas SET nome=?, cnpj=? WHERE id=? AND empresa_id=?', [
      dto.nome.trim(), dto.cnpj ? dto.cnpj.toUpperCase() : null, id, escopo.matrizId,
    ]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: id, usuario_id: usuarioId,
      acao: 'filial.alterada', entidade: 'empresas', entidade_id: id, detalhes: { nome: dto.nome.trim() },
    });
    return this.buscarFilial(escopo, id);
  }

  async alterarAtivoFilial(escopo: EscopoSessao, usuarioId: string, id: string, ativo: boolean) {
    const f = await this.buscarFilial(escopo, id);
    await this.pool.query('UPDATE empresas SET ativo=? WHERE id=? AND empresa_id=?', [ativo ? 1 : 0, id, escopo.matrizId]);
    await this.auditoria.registrar(null, {
      matriz_id: escopo.matrizId, empresa_id: id, usuario_id: usuarioId,
      acao: ativo ? 'filial.reativada' : 'filial.inativada', entidade: 'empresas', entidade_id: id, detalhes: { nome: f.nome },
    });
    return this.buscarFilial(escopo, id);
  }

  // Só filial da própria matriz: a de outro grupo não existe para este dono
  private async buscarFilial(escopo: EscopoSessao, id: string) {
    const [rows]: any = await this.pool.query(
      `SELECT ${COLUNAS} FROM empresas WHERE id=? AND filial=1 AND empresa_id=?`, [id, escopo.matrizId],
    );
    if (!rows.length) throw new NotFoundException('Filial não encontrada');
    return rows[0];
  }
}

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { POOL, Pool } from '../db/database.module';
import { EmpresaDto } from './empresas.dto';

// Empresas de uma conta. Toda consulta e escrita filtra por conta_id: uma
// conta nunca enxerga nem altera empresa de outra.
@Injectable()
export class EmpresasService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async listar(contaId: number) {
    const [rows]: any = await this.pool.query('SELECT * FROM empresas WHERE conta_id=? ORDER BY id', [contaId]);
    return rows;
  }

  async criar(contaId: number, usuarioId: number, dto: EmpresaDto) {
    const [res]: any = await this.pool.query(
      `INSERT INTO empresas (conta_id, razao_social, nome_fantasia, cnpj, ie, uf, municipio, endereco, regime, aliquota_simples)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [contaId, ...this.valores(dto)],
    );
    await this.auditoria.registrar(null, { conta_id: contaId, empresa_id: res.insertId, usuario_id: usuarioId, acao: 'empresa.criada', entidade: 'empresas', entidade_id: res.insertId, detalhes: { razao_social: dto.razao_social } });
    return { id: res.insertId };
  }

  async atualizar(contaId: number, usuarioId: number, id: number, dto: EmpresaDto) {
    await this.buscar(contaId, id);
    await this.pool.query(
      `UPDATE empresas SET razao_social=?, nome_fantasia=?, cnpj=?, ie=?, uf=?, municipio=?, endereco=?, regime=?, aliquota_simples=?
       WHERE id=? AND conta_id=?`,
      [...this.valores(dto), id, contaId],
    );
    await this.auditoria.registrar(null, { conta_id: contaId, empresa_id: id, usuario_id: usuarioId, acao: 'empresa.alterada', entidade: 'empresas', entidade_id: id });
    return { ok: true };
  }

  // A conta precisa de ao menos uma empresa: a última não sai
  async remover(contaId: number, usuarioId: number, id: number) {
    const empresa = await this.buscar(contaId, id);
    const [qtd]: any = await this.pool.query('SELECT COUNT(*) AS c FROM empresas WHERE conta_id=?', [contaId]);
    if (qtd[0].c <= 1) throw new BadRequestException('Não é possível remover a última empresa da conta');
    await this.pool.query('DELETE FROM empresas WHERE id=? AND conta_id=?', [id, contaId]);
    await this.auditoria.registrar(null, { conta_id: contaId, usuario_id: usuarioId, acao: 'empresa.removida', entidade: 'empresas', entidade_id: id, detalhes: { razao_social: empresa.razao_social } });
    return { ok: true };
  }

  private async buscar(contaId: number, id: number) {
    const [rows]: any = await this.pool.query('SELECT * FROM empresas WHERE id=? AND conta_id=?', [id, contaId]);
    if (!rows.length) throw new NotFoundException('Empresa não encontrada');
    return rows[0];
  }

  private valores(dto: EmpresaDto) {
    return [
      dto.razao_social.trim(), dto.nome_fantasia?.trim() || null,
      dto.cnpj ? dto.cnpj.toUpperCase() : null, dto.ie?.trim() || null,
      dto.uf.toUpperCase(), dto.municipio?.trim() || null, dto.endereco?.trim() || null,
      dto.regime, dto.aliquota_simples ?? 6,
    ];
  }
}

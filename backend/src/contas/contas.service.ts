import { Inject, Injectable } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { POOL, Pool } from '../db/database.module';
import { ContaDto } from './contas.dto';

// A conta é o cliente do SaaS. Aqui ficam os dados dela, os totais e a
// trilha de auditoria recente; plano e cobrança entram numa fase seguinte.
@Injectable()
export class ContasService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async ver(contaId: number) {
    const [rows]: any = await this.pool.query('SELECT id, nome, slug, plano, status, trial_ate, criado_em FROM contas WHERE id=?', [contaId]);
    const [totais]: any = await this.pool.query(
      `SELECT (SELECT COUNT(*) FROM empresas WHERE conta_id=?) AS empresas,
              (SELECT COUNT(*) FROM usuarios WHERE conta_id=? AND ativo=1) AS usuarios_ativos`,
      [contaId, contaId],
    );
    const conta = rows[0];
    const diasTrial = conta?.trial_ate
      ? Math.max(0, Math.ceil((new Date(conta.trial_ate).getTime() - Date.now()) / 86400000))
      : null;
    return {
      ...conta,
      dias_restantes_trial: conta?.plano === 'trial' ? diasTrial : null,
      totais: totais[0],
      auditoria: await this.auditoria.listar(contaId, 20),
    };
  }

  async atualizar(contaId: number, usuarioId: number, dto: ContaDto) {
    await this.pool.query('UPDATE contas SET nome=? WHERE id=?', [dto.nome.trim(), contaId]);
    await this.auditoria.registrar(null, { conta_id: contaId, usuario_id: usuarioId, acao: 'conta.renomeada', entidade: 'contas', entidade_id: contaId, detalhes: { nome: dto.nome.trim() } });
    return { ok: true };
  }
}

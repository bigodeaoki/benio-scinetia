import { Inject, Injectable } from '@nestjs/common';
import { POOL, Pool } from '../db/database.module';

export interface EventoAuditoria {
  conta_id: number;
  empresa_id?: number | null;
  usuario_id?: number | null;
  acao: string;            // ex.: 'empresa.criada', 'usuario.inativado'
  entidade?: string;       // tabela ou domínio
  entidade_id?: number | string | null;   // inteiro (conta, empresa, usuário) ou UUID (entidades de domínio)
  detalhes?: any;          // vira JSON
}

// Trilha de auditoria por conta: quem fez o quê, em qual empresa. Aceita a
// conexão da transação em andamento para o registro sair junto com a ação.
@Injectable()
export class AuditoriaService {
  constructor(@Inject(POOL) private pool: Pool) {}

  async registrar(conn: any, ev: EventoAuditoria) {
    await (conn || this.pool).query(
      `INSERT INTO auditoria (conta_id, empresa_id, usuario_id, acao, entidade, entidade_id, detalhes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        ev.conta_id, ev.empresa_id ?? null, ev.usuario_id ?? null, ev.acao,
        ev.entidade ?? null, ev.entidade_id ?? null, ev.detalhes ? JSON.stringify(ev.detalhes) : null,
      ],
    );
  }

  async listar(contaId: number, limite = 100) {
    const [rows]: any = await this.pool.query(
      `SELECT a.id, a.acao, a.entidade, a.entidade_id, a.detalhes, a.criado_em,
              u.nome AS usuario_nome, COALESCE(e.nome_fantasia, e.razao_social) AS empresa_nome
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN empresas e ON e.id = a.empresa_id
        WHERE a.conta_id = ?
        ORDER BY a.id DESC LIMIT ?`,
      [contaId, limite],
    );
    return rows.map((r: any) => ({ ...r, detalhes: typeof r.detalhes === 'string' ? JSON.parse(r.detalhes) : r.detalhes }));
  }
}

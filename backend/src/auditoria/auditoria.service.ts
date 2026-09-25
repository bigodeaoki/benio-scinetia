import { Inject, Injectable } from '@nestjs/common';
import { POOL, Pool } from '../db/database.module';

export interface EventoAuditoria {
  matriz_id?: string | null;     // grupo (matriz) onde aconteceu; null em ações globais do admin
  empresa_id?: string | null;
  usuario_id?: string | null;
  acao: string;                  // ex.: 'filial.criada', 'usuario.inativado'
  entidade?: string;
  entidade_id?: string | null;
  detalhes?: any;                // vira JSON
}

// Trilha de auditoria: quem fez o quê, em qual empresa de qual grupo. Aceita
// a conexão da transação em andamento para o registro sair junto com a ação.
@Injectable()
export class AuditoriaService {
  constructor(@Inject(POOL) private pool: Pool) {}

  async registrar(conn: any, ev: EventoAuditoria) {
    await (conn || this.pool).query(
      `INSERT INTO auditoria (matriz_id, empresa_id, usuario_id, acao, entidade, entidade_id, detalhes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        ev.matriz_id ?? null, ev.empresa_id ?? null, ev.usuario_id ?? null, ev.acao,
        ev.entidade ?? null, ev.entidade_id ?? null, ev.detalhes ? JSON.stringify(ev.detalhes) : null,
      ],
    );
  }

  // matrizId null = trilha global (admin); senão, a do grupo
  async listar(matrizId: string | null, limite = 50) {
    const [rows]: any = await this.pool.query(
      `SELECT a.id, a.acao, a.entidade, a.entidade_id, a.detalhes, a.criado_em,
              u.nome AS usuario_nome, e.nome AS empresa_nome, m.nome AS matriz_nome
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN empresas e ON e.id = a.empresa_id
         LEFT JOIN empresas m ON m.id = a.matriz_id
        ${matrizId ? 'WHERE a.matriz_id = ?' : ''}
        ORDER BY a.id DESC LIMIT ?`,
      matrizId ? [matrizId, limite] : [limite],
    );
    return rows.map((r: any) => ({ ...r, detalhes: typeof r.detalhes === 'string' ? JSON.parse(r.detalhes) : r.detalhes }));
  }
}

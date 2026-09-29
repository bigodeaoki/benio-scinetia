import * as fs from 'fs';
import * as path from 'path';
import type { Pool } from 'mysql2/promise';

// Migrações do schema, aplicadas pela API na subida: em ordem de nome, uma vez
// cada, registradas em schema_migrations. Assim o banco do Railway (que nasce
// vazio) e o do Docker local ficam sempre no schema do código, sem passo manual.
// Uma trava no MySQL impede duas instâncias de migrarem ao mesmo tempo.
const TRAVA = 'scientia_saas_migracoes';

// Tira os comentários de linha e separa os comandos pelo ponto e vírgula do fim da linha
export function separarComandos(sql: string): string[] {
  const semComentarios = sql.split(/\r?\n/).filter((linha) => !/^\s*--/.test(linha)).join('\n');
  return semComentarios.split(/;[ \t]*(?:\r?\n|$)/).map((c) => c.trim()).filter(Boolean);
}

export async function aplicarMigracoes(pool: Pool, dir = path.join(process.cwd(), 'migrations')): Promise<string[]> {
  if (!fs.existsSync(dir)) {
    console.warn(`[scientia-saas] pasta de migrações não encontrada: ${dir}`);
    return [];
  }
  const aplicadasAgora: string[] = [];
  const cx = await pool.getConnection();
  try {
    const [trava]: any = await cx.query('SELECT GET_LOCK(?, 60) AS ok', [TRAVA]);
    if (!trava[0]?.ok) throw new Error('Não consegui a trava das migrações em 60 s');
    await cx.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         nome VARCHAR(150) NOT NULL PRIMARY KEY,
         aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB`,
    );
    const [feitas]: any = await cx.query('SELECT nome FROM schema_migrations');
    const aplicadas = new Set<string>(feitas.map((r: any) => r.nome));
    const arquivos = fs.readdirSync(dir).filter((f) => /^\d{4}-[\w-]+\.sql$/.test(f)).sort();
    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;
      const comandos = separarComandos(fs.readFileSync(path.join(dir, arquivo), 'utf8'));
      console.log(`[scientia-saas] aplicando migração ${arquivo} (${comandos.length} comandos)`);
      for (let i = 0; i < comandos.length; i++) {
        try {
          await cx.query(comandos[i]);
        } catch (e: any) {
          throw new Error(`Migração ${arquivo}, comando ${i + 1} falhou: ${e.message}\n${comandos[i].slice(0, 300)}`);
        }
      }
      await cx.query('INSERT INTO schema_migrations (nome) VALUES (?)', [arquivo]);
      aplicadasAgora.push(arquivo);
    }
    console.log(aplicadasAgora.length ? `[scientia-saas] migrações aplicadas: ${aplicadasAgora.join(', ')}` : '[scientia-saas] schema em dia');
    return aplicadasAgora;
  } finally {
    await cx.query('SELECT RELEASE_LOCK(?)', [TRAVA]).catch(() => undefined);
    cx.release();
  }
}

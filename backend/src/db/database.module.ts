import { Global, Module } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { env } from '../config/env';

export const POOL = 'POOL';
export type Pool = mysql.Pool;

// Pool único da aplicação. Espera o MySQL subir (docker compose) antes de
// liberar o restante dos módulos. DECIMAL chega como número JS.
async function criarPool(): Promise<mysql.Pool> {
  const pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
    charset: 'utf8mb4',
  });
  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query('SELECT 1');
      console.log('[scientia-saas] MySQL conectado');
      return pool;
    } catch (e) {
      if (tentativa >= 30) throw e;
      if (tentativa % 5 === 1) console.log(`[scientia-saas] aguardando MySQL... (${tentativa})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

@Global()
@Module({
  providers: [{ provide: POOL, useFactory: criarPool }],
  exports: [POOL],
})
export class DatabaseModule {}

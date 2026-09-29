import { Global, Module } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { env } from '../config/env';
import { aplicarMigracoes } from './migracoes';

export const POOL = 'POOL';
export type Pool = mysql.Pool;

// Pool único da aplicação. Espera o MySQL subir, aplica as migrações do schema e
// só então libera o restante dos módulos. DECIMAL chega como número JS.
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
    dateStrings: ['DATE'],   // DATE vem como 'AAAA-MM-DD', sem deslocamento de fuso
    charset: 'utf8mb4',
  });
  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query('SELECT 1');
      console.log('[scientia-saas] MySQL conectado');
      break;
    } catch (e) {
      if (tentativa >= 30) throw e;
      if (tentativa % 5 === 1) console.log(`[scientia-saas] aguardando MySQL... (${tentativa})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await aplicarMigracoes(pool);
  return pool;
}

@Global()
@Module({
  providers: [{ provide: POOL, useFactory: criarPool }],
  exports: [POOL],
})
export class DatabaseModule {}

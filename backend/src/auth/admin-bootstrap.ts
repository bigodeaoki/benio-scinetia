import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { POOL, Pool } from '../db/database.module';
import { novoId } from '../shared/ids';

// Primeiro admin global, criado na subida quando não existe nenhum. Em
// produção depende de ADMIN_EMAIL/ADMIN_SENHA no ambiente.
@Injectable()
export class AdminBootstrap implements OnApplicationBootstrap {
  constructor(@Inject(POOL) private pool: Pool) {}

  async onApplicationBootstrap() {
    const [rows]: any = await this.pool.query("SELECT COUNT(*) AS c FROM usuarios WHERE papel = 'admin'");
    if (rows[0].c > 0) return;
    if (!env.ADMIN_EMAIL || !env.ADMIN_SENHA) {
      console.error('[scientia-saas] nenhum admin cadastrado e ADMIN_EMAIL/ADMIN_SENHA não definidos — defina-os para o primeiro acesso');
      return;
    }
    const hash = await bcrypt.hash(env.ADMIN_SENHA, 10);
    await this.pool.query(
      'INSERT INTO usuarios (id, empresa_id, nome, email, senha_hash, papel) VALUES (?, NULL, ?, ?, ?, ?)',
      [novoId(), 'Administrador', env.ADMIN_EMAIL.toLowerCase(), hash, 'admin'],
    );
    console.log(`[scientia-saas] admin global criado: ${env.ADMIN_EMAIL}`);
  }
}

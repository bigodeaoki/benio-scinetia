import { Inject, Injectable } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EscopoSessao } from '../auth/decorators';
import { POOL, Pool } from '../db/database.module';

// Resumo da tela inicial, conforme a visão: admin (global), dono (grupo) ou
// usuário comum (a própria empresa)
@Injectable()
export class PainelService {
  constructor(@Inject(POOL) private pool: Pool, private auditoria: AuditoriaService) {}

  async ver(escopo: EscopoSessao) {
    if (escopo.papel === 'admin') {
      const [t]: any = await this.pool.query(
        `SELECT (SELECT COUNT(*) FROM empresas WHERE matriz = 1) AS matrizes,
                (SELECT COUNT(*) FROM empresas WHERE filial = 1) AS filiais,
                (SELECT COUNT(*) FROM usuarios WHERE papel = 'owner') AS donos,
                (SELECT COUNT(*) FROM usuarios WHERE papel <> 'admin') AS usuarios`,
      );
      return { visao: 'admin', totais: t[0], auditoria: await this.auditoria.listar(null, 20) };
    }
    const [empresas]: any = await this.pool.query(
      `SELECT e.id, e.nome, e.matriz, e.filial, e.ativo,
              (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e.id AND u.ativo = 1) AS usuarios_ativos
         FROM empresas e WHERE e.id IN (?) ORDER BY e.matriz DESC, e.nome`,
      [escopo.empresaIds],
    );
    const dono = escopo.papel === 'owner';
    return {
      visao: dono ? 'owner' : 'usuario',
      empresas,
      totais: {
        empresas: empresas.length,
        filiais: empresas.filter((e: any) => e.filial).length,
        usuarios_ativos: empresas.reduce((s: number, e: any) => s + Number(e.usuarios_ativos), 0),
      },
      auditoria: dono ? await this.auditoria.listar(escopo.matrizId, 20) : [],
    };
  }
}

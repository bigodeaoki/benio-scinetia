import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

// Traduz erros comuns do MySQL em respostas 400 legíveis em vez de
// "Internal server error" genérico. Erros HTTP do Nest passam intactos.
const ERROS_MYSQL: Record<string, string> = {
  ER_DATA_TOO_LONG: 'Valor longo demais para o campo',
  ER_DUP_ENTRY: 'Registro duplicado',
  ER_NO_REFERENCED_ROW_2: 'Referência inválida: o registro relacionado não existe',
  ER_ROW_IS_REFERENCED_2: 'Registro em uso por outros cadastros',
  ER_TRUNCATED_WRONG_VALUE_FOR_FIELD: 'Valor inválido para o campo',
  ER_TRUNCATED_WRONG_VALUE: 'Valor inválido (confira números e datas)',
  ER_BAD_NULL_ERROR: 'Campo obrigatório não informado',
  WARN_DATA_TRUNCATED: 'Valor inválido para o campo',
};

@Catch()
export class ErrosFilter implements ExceptionFilter {
  catch(excecao: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (excecao instanceof HttpException) {
      const corpo = excecao.getResponse();
      return res
        .status(excecao.getStatus())
        .json(typeof corpo === 'string' ? { statusCode: excecao.getStatus(), message: corpo } : corpo);
    }

    const amigavel = excecao?.code && ERROS_MYSQL[excecao.code];
    if (amigavel) {
      console.error('[scientia-saas] erro de banco tratado:', excecao.sqlMessage || excecao.message);
      return res.status(400).json({ statusCode: 400, message: amigavel });
    }

    console.error('[scientia-saas] erro não tratado:', excecao);
    return res.status(500).json({
      statusCode: 500,
      message: 'Erro interno no servidor — verifique os logs do backend (docker logs scientia-saas-backend)',
    });
  }
}

import { randomUUID } from 'crypto';

// Identificadores das entidades de domínio: UUID v4 gerado na aplicação,
// para o id existir antes do INSERT e poder ir para a auditoria na mesma
// transação. Formato canônico de 36 caracteres (CHAR(36) no banco).
export const novoId = (): string => randomUUID();

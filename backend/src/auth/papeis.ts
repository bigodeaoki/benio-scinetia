// Papéis dos usuários de uma conta e permissões de ESCRITA por domínio.
// Leitura (GET) é liberada para qualquer usuário autenticado da conta.
// Para ajustar as restrições de um papel, edite apenas este arquivo.
export const TODOS_PAPEIS = ['admin', 'producao', 'qualidade', 'compras', 'vendas', 'administrativo', 'financeiro', 'operador'] as const;
export type Papel = (typeof TODOS_PAPEIS)[number];

export const PERM = {
  conta: ['admin'],      // dados da conta (nome, plano)
  empresas: ['admin'],   // empresas da conta
  usuarios: ['admin'],   // usuários da conta
  materias: ['admin', 'compras', 'producao', 'administrativo'], // cadastro de matérias-primas
};

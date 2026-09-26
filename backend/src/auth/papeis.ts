// Papéis e permissões de ESCRITA por domínio. Leitura (GET) é liberada para
// qualquer usuário autenticado, dentro do seu escopo.
//   admin  — operador do SaaS, sem empresa: visão global
//   owner  — dono da matriz: gerencia filiais e usuários do grupo
//   demais — papéis operacionais, presos à própria empresa
export const TODOS_PAPEIS = ['admin', 'owner', 'farmacia', 'producao', 'qualidade', 'compras', 'vendas', 'administrativo', 'financeiro', 'operador'] as const;
export type Papel = (typeof TODOS_PAPEIS)[number];
export const PAPEIS_OPERACIONAIS = TODOS_PAPEIS.filter((p) => p !== 'admin' && p !== 'owner');

export const PERM = {
  admin: ['admin'],                                                 // empresas (matriz + dono) e usuários de qualquer empresa
  filiais: ['owner'],                                               // filiais do próprio grupo — o dono, nunca o admin
  usuarios: ['owner'],                                              // usuários do próprio grupo
  materias: ['owner', 'compras', 'producao', 'administrativo'],     // cadastro de matérias-primas
  estoque: ['owner', 'compras', 'producao', 'administrativo', 'operador'], // entradas de compra no estoque
  envases: ['owner', 'compras', 'producao', 'administrativo'],      // itens de envase (frascos, caixas...)
  formulacoes: ['owner', 'farmacia'],                              // fórmulas: o responsável é o papel farmácia
  maquinas: ['owner', 'producao', 'administrativo', 'financeiro'], // maquinário e custo-hora
  veiculos: ['owner', 'administrativo', 'financeiro'],               // logística: veículos e custo-hora
};

// Listas fixas usadas em formulários
export const PAPEIS = [
  { valor: 'admin', rotulo: 'Admin do sistema', descricao: 'Operador do SaaS: cadastra empresas e donos e controla usuários de todas as empresas.' },
  { valor: 'owner', rotulo: 'Dono', descricao: 'Dono da empresa: cadastra filiais e usuários do seu grupo e alterna entre matriz e filiais.' },
  { valor: 'farmacia', rotulo: 'Farmácia', descricao: 'Responsável pelas formulações: cria e altera as fórmulas com as matérias-primas.' },
  { valor: 'producao', rotulo: 'Produção', descricao: 'Linhas, matérias-primas e ordens de produção.' },
  { valor: 'qualidade', rotulo: 'Qualidade', descricao: 'Fórmulas, especificações e controle de documentos.' },
  { valor: 'compras', rotulo: 'Compras', descricao: 'Matérias-primas, notas de fornecedor e entradas de estoque.' },
  { valor: 'vendas', rotulo: 'Vendas', descricao: 'Pedidos, ordens a partir de pedidos e notas fiscais.' },
  { valor: 'administrativo', rotulo: 'Administrativo', descricao: 'Rotina de escritório: pedidos, notas, compras, estoque, remessas e documentos.' },
  { valor: 'financeiro', rotulo: 'Financeiro', descricao: 'Consulta geral: custos, preços e dashboards.' },
  { valor: 'operador', rotulo: 'Operador', descricao: 'Apontamentos de produção e movimentos de estoque.' },
];
export const PAPEIS_OPERACIONAIS = PAPEIS.filter((p) => p.valor !== 'admin' && p.valor !== 'owner');
export const PAPEL_ROTULOS = Object.fromEntries(PAPEIS.map((p) => [p.valor, p.rotulo]));

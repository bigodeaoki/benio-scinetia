// Listas fixas usadas em formulários
export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export const REGIMES = [
  { valor: 'simples', rotulo: 'Simples Nacional' },
  { valor: 'presumido', rotulo: 'Lucro Presumido' },
  { valor: 'real', rotulo: 'Lucro Real' },
];

export const PAPEIS = [
  { valor: 'admin', rotulo: 'Admin', descricao: 'Acesso total à conta: empresas, usuários e configurações.' },
  { valor: 'producao', rotulo: 'Produção', descricao: 'Linhas, fórmulas, matérias-primas e ordens de produção.' },
  { valor: 'qualidade', rotulo: 'Qualidade', descricao: 'Fórmulas, especificações e controle de documentos.' },
  { valor: 'compras', rotulo: 'Compras', descricao: 'Matérias-primas, notas de fornecedor e entradas de estoque.' },
  { valor: 'vendas', rotulo: 'Vendas', descricao: 'Pedidos, ordens a partir de pedidos e notas fiscais.' },
  { valor: 'administrativo', rotulo: 'Administrativo', descricao: 'Rotina de escritório: pedidos, notas, compras, estoque, remessas e documentos.' },
  { valor: 'financeiro', rotulo: 'Financeiro', descricao: 'Consulta geral: custos, preços e dashboards.' },
  { valor: 'operador', rotulo: 'Operador', descricao: 'Apontamentos de produção e movimentos de estoque.' },
];
export const PAPEL_ROTULOS = Object.fromEntries(PAPEIS.map((p) => [p.valor, p.rotulo]));

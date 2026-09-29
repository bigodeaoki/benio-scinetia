// Configuração por ambiente, lida uma vez na subida.
// Em produção o segredo do JWT é obrigatório: SaaS não pode depender de valor
// padrão, então o servidor recusa subir sem ele.
const producao = process.env.NODE_ENV === 'production';

function obrigatoria(nome: string, padraoDev: string): string {
  const valor = process.env[nome] || (producao ? '' : padraoDev);
  if (!valor) throw new Error(`Variável de ambiente ${nome} é obrigatória em produção`);
  return valor;
}

export const env = {
  producao,
  PORT: Number(process.env.PORT || 4000),
  // Banco: DB_* ou, na falta, os nomes que o MySQL do Railway expõe (MYSQLHOST, MYSQLPORT...)
  DB_HOST: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  DB_PORT: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  DB_USER: process.env.DB_USER || process.env.MYSQLUSER || 'scientia',
  DB_PASSWORD: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || 'scientia123',
  DB_NAME: process.env.DB_NAME || process.env.MYSQLDATABASE || 'scientia',
  JWT_SECRET: obrigatoria('JWT_SECRET', 'segredo-de-desenvolvimento'),
  JWT_EXPIRA: process.env.JWT_EXPIRA || '12h',
  // Primeiro admin global: criado na subida se não existir nenhum. Em produção,
  // sem estes valores, nada é criado e o log avisa.
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || (producao ? '' : 'admin@scientia.com'),
  ADMIN_SENHA: process.env.ADMIN_SENHA || (producao ? '' : 'admin123'),
};

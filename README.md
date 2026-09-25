# Scientia SaaS

Custos de produção industrial como serviço: cada cliente é uma **conta** com suas empresas, usuários e dados, isolados das demais contas. Recomeço do zero do Scientia v1 (repositório `benio-back`, tag `legado-v1`), na mesma stack: NestJS + MySQL no backend, React + Vite no frontend, Docker para rodar local e Railway para produção.

## Decisões de base

- **Conta é o tenant.** Toda empresa pertence a uma conta e todo dado de negócio pertence a uma empresa. O JWT carrega a conta; o header `X-Empresa-Id` escolhe a empresa ativa dentro dela.
- **Um usuário, uma conta.** E-mail único no sistema. Papéis por usuário: admin, produção, qualidade, compras, vendas, administrativo, financeiro, operador.
- **Cadastro self-service** cria conta, primeira empresa e admin, com período de teste (`TRIAL_DIAS`).
- **Auditoria desde o dia zero:** toda escrita relevante registra quem fez o quê, em qual empresa.
- **Validação por DTO** em toda entrada; campo desconhecido é recusado.
- **Segredos obrigatórios em produção:** o backend não sobe sem `JWT_SECRET`.
- **Motor de custos com testes:** as regras numéricas ficam em `backend/src/shared/calculos.ts`, puras e cobertas por Jest.

## Rodar local

```bash
docker compose up -d --build
```

Frontend em http://localhost:8081, API em http://localhost:4100/api, MySQL na porta 3308 (usuário `scientia`, senha `scientia123`, banco `scientia`). Portas diferentes do v1 para os dois conviverem.

Testes do backend, na sua máquina:

```bash
cd backend && npm install && npm test
```

## Estrutura

```
backend/src
  auth/        cadastro, login, sessão, guard com conta + empresa, papéis
  contas/      dados da conta, totais e auditoria recente
  empresas/    empresas da conta
  usuarios/    usuários da conta (nunca excluídos, só inativados)
  auditoria/   trilha de auditoria (global)
  shared/      funções puras de cálculo (com testes) e filtro de erros
  db/          pool MySQL
frontend/src
  App.jsx      rotas públicas (entrar, cadastro) e a área logada
  Shell.jsx    menu lateral, seletor de empresa, cabeçalho
  pages/       Dashboard, Empresas, Usuários, Conta, Login, Cadastro
mysql/init     schema inicial (só roda em volume novo)
mysql/migrations  scripts idempotentes, aplicados em produção antes do deploy
```

## Próximas fases

1. Identidade: verificação de e-mail, recuperação de senha, convites.
2. Domínio: matérias-primas com lotes FIFO, fórmulas, linhas de processo, envases, produção, custos (portados do v1 sobre testes).
3. Cobrança: planos, limites, Stripe ou Asaas, bloqueio suave.
4. Operação: super-admin do operador, backups, monitoramento.

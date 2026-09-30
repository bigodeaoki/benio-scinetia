# Scientia SaaS

Custos de produção industrial como serviço. Recomeço do zero do Scientia v1 (repositório `benio-back`, tag `legado-v1`), na mesma stack: NestJS + MySQL no backend, React + Vite no frontend, Docker para rodar local e Railway para produção.

## Escopo (quem vê o quê)

- **Admin** — operador do SaaS, sem empresa. Visão global: cadastra empresas (matriz) já com o dono, edita e suspende empresas, controla usuários de qualquer empresa. Não cadastra filial.
- **Dono (owner)** — usuário da matriz. Cadastra filiais e usuários operacionais do seu grupo (matriz + filiais) e alterna entre as empresas do grupo pelo seletor do topo.
- **Demais papéis** (produção, qualidade, compras, vendas, administrativo, financeiro, operador) — pertencem a uma empresa, matriz ou filial, e só enxergam ela. O papel define o que podem alterar.

Não existe filial sem matriz: toda filial aponta para a sua matriz (`empresas.empresa_id`), e o banco recusa qualquer outra combinação. Não há cadastro público: o primeiro admin nasce na subida (`ADMIN_EMAIL` / `ADMIN_SENHA`) e cria as empresas.

## Convenções

- **Entidades:** id UUID v4 gerado na aplicação, `criado_em` e `atualizado_em` mantidos pelo banco, sem exclusão física (`ativo`). Cadastros de referência (ex.: matérias-primas, itens de envase) são de cada empresa e carregam o vínculo com a matriz (`matriz_id`): a filial vê os seus e os da matriz, e não repete nome que a matriz já tem.
- **Escopo em toda requisição:** o guard monta `escopo` (papel, matriz do grupo, empresas permitidas) e valida o header `X-Empresa-Id`. Serviços sempre filtram por esse escopo.
- **Validação por DTO** em toda entrada; campo desconhecido é recusado.
- **Auditoria** em toda escrita: quem fez o quê, em qual empresa de qual grupo.
- **Segredos obrigatórios em produção:** o backend não sobe sem `JWT_SECRET`.
- **Regras numéricas puras e testadas** em `backend/src/shared/calculos.ts` (Jest).

## Rodar local

```bash
docker compose up -d --build
```

Frontend em http://localhost:8081, API em http://localhost:4100/api, MySQL na porta 3308 (usuário `scientia`, senha `scientia123`, banco `scientia`). Portas diferentes do v1 para os dois conviverem. Acesso inicial: `admin@scientia.com` / `admin123`.

Testes do backend, na sua máquina:

```bash
cd backend && npm install && npm test
```

## Estrutura

```
backend/src
  auth/        login, sessão, guard de escopo, papéis, bootstrap do admin
  admin/       visão global: empresas (matriz + dono) e usuários de qualquer empresa
  empresas/    empresas do escopo; filiais (só o dono)
  usuarios/    usuários operacionais do grupo (só o dono)
  materias/    matérias-primas da empresa ativa; a filial enxerga também as da matriz (só a dona altera a sua); na tela de cadastro a dona vê o grupo inteiro, com filtro por empresa
  envases/     itens de envase (frascos, tampas, rótulos, caixas) da empresa ativa; sem quantidade, o estoque controla; mesma visibilidade das matérias-primas; na tela de cadastro a dona vê o grupo inteiro, com filtro por empresa
  maquinas/    maquinário de cada empresa (título, modelo, custo R$/h, rendimento %); bem físico, não é compartilhado com filiais; a dona lista o grupo inteiro, com filtro por empresa
  veiculos/    logística: veículos de cada empresa (tipo livre, marca, modelo, ano, placa, custo R$/h, status, última manutenção); bem físico como o maquinário; a dona lista o grupo inteiro, com filtro por empresa
  utilitarios/ utilitários de cada empresa (energia, água, gás…) com nome, descrição e valor em R$; mesmo escopo do maquinário
  impostos/    impostos (nome e %) de cada empresa, com a filial enxergando os da matriz; usados na etapa de custos do pedido
  funcionarios/ mão de obra de cada empresa (nome, documento, e-mail, categoria livre, custo R$/h, admissão, status de RH); só dono, administrativo e financeiro leem e escrevem; a dona lista o grupo inteiro, com filtro por empresa
  documentos/  documentos do grupo (arquivo no banco, até 10 MB); status de download da matriz e das filiais, marcados no primeiro download de cada lado
  clientes/    clientes de cada empresa (dados, endereço, contatos, responsáveis, CNPJ validado); o grupo inteiro lê, a empresa dona altera
  pedidos/     entrada de pedidos em 4 etapas, salva no meio (status + etapa). Etapa 1: histórico de formulações do pedido (a nova põe a anterior em desuso) e envios de amostra (quantidade, embalagens, logística; gasto informativo, fora do custo), com a confirmação "cliente aprovou?" ao avançar. Etapa 2 (Produção): quantidade a produzir, matérias-primas necessárias (fórmula por 1 unidade × quantidade, com g→kg e mL→L) e maquinário com rendimento ajustável no pedido. Etapa 3 (Custos): sobre o custo global da etapa 2, mão de obra por categoria e impostos em %, e outros custos em R$ (envase, logística, avulsos), com o custo total do pedido e por unidade; só dono, administrativo e financeiro editam
  estoque/     entradas de compra por empresa, de matéria-prima ou de item de envase (um dos dois), com resumo por item e unidade
  painel/      resumo da tela inicial por visão
  auditoria/   trilha de auditoria (global)
  shared/      funções puras de cálculo (com testes), ids, DTOs comuns, filtro de erros
  db/          pool MySQL e migrações do schema, aplicadas na subida
frontend/src
  App.jsx      rota pública (entrar) e a área logada
  Shell.jsx    menu por visão, seletor de empresa, cabeçalho
  pages/       Dashboard, Pedidos, Clientes, Matérias-primas, Envase, Formulações, Maquinário, Logística, Utilitários, Impostos, Mão de obra, Estoque, Documentos, Filiais, Usuários, admin/Empresas, admin/Usuários, Login
backend/migrations  migrações do schema em ordem de nome (0001-baseline.sql é a base); a API aplica na subida
```

## Deploy no Railway

Três serviços no mesmo projeto: **MySQL** (modelo do Railway, com volume), **backend** e **frontend**. Os dois últimos ficam ligados a este repositório com *Root Directory* `/backend` e `/frontend`; cada pasta tem o seu `Dockerfile` e `railway.json`. O push na `main` dispara o deploy.

O banco não tem passo manual: na subida a API aplica as migrações de `backend/migrations` e cria o primeiro admin.

Variáveis do **backend**:

| Variável | Valor |
|---|---|
| `PORT` | `4000` |
| `DB_HOST` | `${{MySQL.MYSQLHOST}}` |
| `DB_PORT` | `${{MySQL.MYSQLPORT}}` |
| `DB_USER` | `${{MySQL.MYSQLUSER}}` |
| `DB_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
| `DB_NAME` | `${{MySQL.MYSQLDATABASE}}` |
| `JWT_SECRET` | segredo longo e aleatório. Obrigatório: sem ele a API não sobe |
| `ADMIN_EMAIL` | e-mail do primeiro admin |
| `ADMIN_SENHA` | senha do primeiro admin. Só é usada enquanto não existe nenhum admin |

Variáveis do **frontend**:

| Variável | Valor |
|---|---|
| `BACKEND_URL` | `http://${{Nome do serviço backend.RAILWAY_PRIVATE_DOMAIN}}:4000` |

`MySQL` e o nome do backend, nas referências, são os nomes dos serviços no projeto. O `PORT` do frontend é o Railway que injeta. Só o frontend precisa de domínio público (Settings › Networking › Generate Domain): o navegador fala com `/api` no próprio domínio e o nginx repassa ao backend pela rede privada, que usa IPv6, por isso a API escuta em `::`.

## Próximas fases

1. Identidade: recuperação de senha e convites por e-mail.
2. Domínio: lotes de compra (FIFO), linhas de processo, etapas de envase, produção e custos, portados do v1 sobre testes.
3. Cobrança por matriz: planos, limites, bloqueio suave.
4. Operação: backups, monitoramento, impersonação do admin para suporte.

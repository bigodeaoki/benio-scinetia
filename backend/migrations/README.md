# Migrações

A API aplica as migrações sozinha na subida (`src/db/migracoes.ts`), em ordem de nome, uma vez cada.
O que já foi aplicado fica na tabela `schema_migrations`. Vale para o Docker local e para o Railway:
basta fazer o deploy, não há passo manual no banco.

Regras:

- Um arquivo por mudança: `0002-descricao.sql`, `0003-...`. O número define a ordem.
- **Não edite** um arquivo que já foi para produção: crie o próximo.
- Escreva de forma idempotente quando der (`CREATE TABLE IF NOT EXISTS`), porque comando de schema
  no MySQL não tem rollback: se uma migração falhar no meio, a API não sobe e ela roda de novo na
  próxima tentativa.
- Comandos separados por ponto e vírgula no fim da linha. Sem ponto e vírgula dentro de texto e sem `DELIMITER`.

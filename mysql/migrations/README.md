# Migrações

Scripts idempotentes, um por mudança de schema, aplicados manualmente no banco de produção **antes** do deploy.
O `mysql/init/01-schema.sql` só roda em volume novo.

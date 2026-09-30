-- Etapa 1: custo da matéria-prima gasta em cada envio de amostra, calculado no
-- salvamento pela fórmula e pelos preços do cadastro. Gasto que a empresa arca:
-- fica à parte e não entra no custo global do pedido.
ALTER TABLE pedido_amostras ADD COLUMN custo_materia_prima DECIMAL(14,2) NULL AFTER logistica, ADD COLUMN custo_mp_incompleto TINYINT(1) NOT NULL DEFAULT 0 AFTER custo_materia_prima;

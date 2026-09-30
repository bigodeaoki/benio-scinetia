-- Custo global da produção (etapa 2): preço de compra da matéria-prima (R$ por
-- unidade do cadastro) e, nas máquinas do pedido, as horas de produção com o
-- custo-hora gravado na hora (mudar o cadastro depois não altera o pedido).
ALTER TABLE materias_primas ADD COLUMN valor_compra DECIMAL(14,4) NULL AFTER unidade;
ALTER TABLE pedido_maquinas ADD COLUMN horas DECIMAL(10,2) NULL AFTER rendimento_pct, ADD COLUMN custo_hora DECIMAL(12,2) NULL AFTER horas;

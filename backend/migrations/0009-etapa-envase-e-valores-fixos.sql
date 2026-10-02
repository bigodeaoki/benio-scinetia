-- Nova etapa 2 (Envase): itens de envase do pedido com quantidade e valor unitário.
-- Até a etapa 4 tudo é valor fixo em R$ somando no custo global; só a etapa 5
-- (Impostos) aplica % sobre esse total.
CREATE TABLE IF NOT EXISTS pedido_envases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  pedido_id CHAR(36) NOT NULL,
  envase_id CHAR(36) NOT NULL,
  descricao VARCHAR(150) NOT NULL,
  quantidade DECIMAL(14,3) NOT NULL DEFAULT 0,
  unidade VARCHAR(20) NOT NULL DEFAULT 'un',
  valor_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 1,
  usuario_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pedido_envases (pedido_id, ordem),
  CONSTRAINT ck_pedido_envase_valores CHECK (quantidade >= 0 AND valor_unitario >= 0),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (envase_id) REFERENCES envases(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- O envase lançado em "Outros custos" da etapa de custos passa para a etapa de envase
INSERT INTO pedido_envases (id, pedido_id, envase_id, descricao, quantidade, unidade, valor_unitario, total, ordem)
  SELECT UUID(), pedido_id, referencia_id, descricao, quantidade, unidade, valor_unitario, total, ordem FROM pedido_custos WHERE tipo = 'envase' AND referencia_id IS NOT NULL;
DELETE FROM pedido_custos WHERE tipo = 'envase' AND referencia_id IS NOT NULL;

-- Mão de obra por área deixa de ser % do custo global e passa a valor fixo em R$
ALTER TABLE pedido_mao_de_obra DROP CHECK ck_pedido_mao_de_obra_pct;
ALTER TABLE pedido_mao_de_obra DROP COLUMN percentual;
ALTER TABLE pedido_mao_de_obra ADD COLUMN valor DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER categoria;
ALTER TABLE pedido_mao_de_obra ADD CONSTRAINT ck_pedido_mao_de_obra_valor CHECK (valor >= 0);

-- Com a etapa 2 nova, quem já tinha passado da etapa 1 anda uma posição e continua
-- na mesma etapa de antes (Produção vira 3, Custos 4, Impostos 5)
UPDATE pedidos SET etapa = etapa + 1 WHERE etapa >= 2;

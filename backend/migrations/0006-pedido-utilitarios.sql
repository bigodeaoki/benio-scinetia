-- Utilitários do pedido (etapa 2, Produção): itens de utilidade da empresa do
-- pedido com a quantidade consumida; o valor unitário é gravado na hora (mudar o
-- cadastro depois não altera o pedido). Custo = quantidade × valor, entra no
-- custo global junto com matéria-prima e máquinas. Lista regravada a cada edição.
CREATE TABLE IF NOT EXISTS pedido_utilitarios (
  id CHAR(36) NOT NULL PRIMARY KEY,
  pedido_id CHAR(36) NOT NULL,
  utilitario_id CHAR(36) NOT NULL,
  quantidade DECIMAL(14,3) NULL,
  valor DECIMAL(14,4) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 1,
  usuario_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pedido_utilitario (pedido_id, utilitario_id),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (utilitario_id) REFERENCES utilitarios(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Etapa 3 (Custos): linhas de custo do pedido, regravadas por inteiro a cada
-- edição da etapa. Cada linha aponta (ou não) para um cadastro: matéria-prima,
-- envase, máquina, funcionário ou veículo; "outro" é custo avulso. O nome e o
-- valor unitário são gravados na hora (snapshot): mudar o cadastro depois não
-- altera o custo do pedido.
CREATE TABLE IF NOT EXISTS pedido_custos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  pedido_id CHAR(36) NOT NULL,
  tipo ENUM('materia_prima','envase','maquina','mao_de_obra','veiculo','outro') NOT NULL,
  referencia_id CHAR(36) NULL,
  descricao VARCHAR(150) NOT NULL,
  quantidade DECIMAL(14,3) NOT NULL DEFAULT 1,
  unidade VARCHAR(20) NOT NULL DEFAULT 'un',
  valor_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pedido_custos (pedido_id, ordem),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

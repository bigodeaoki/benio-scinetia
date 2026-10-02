-- Etapa 3 (Custos), logística do pedido: veículos da empresa do pedido com as
-- horas de uso. O custo-hora do cadastro fica gravado ao salvar a etapa.
CREATE TABLE IF NOT EXISTS pedido_veiculos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  pedido_id CHAR(36) NOT NULL,
  veiculo_id CHAR(36) NOT NULL,
  horas DECIMAL(10,2) NULL,
  custo_hora DECIMAL(12,2) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 1,
  usuario_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pedido_veiculo (pedido_id, veiculo_id),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Etapa 3 (Custos), depreciação: item à parte do pedido, sem cadastro, com nome
-- e valor em R$. Lista regravada a cada edição da etapa.
CREATE TABLE IF NOT EXISTS pedido_depreciacoes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  pedido_id CHAR(36) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  valor DECIMAL(14,2) NOT NULL DEFAULT 0,
  ordem INT NOT NULL DEFAULT 1,
  usuario_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pedido_depreciacoes (pedido_id, ordem),
  CONSTRAINT ck_pedido_depreciacao_valor CHECK (valor >= 0),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

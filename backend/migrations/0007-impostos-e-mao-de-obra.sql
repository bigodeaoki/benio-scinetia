-- Impostos: nome e percentual, de cada empresa, com o vínculo à matriz (como
-- matérias-primas e envase): a filial enxerga os da matriz; só a dona altera.
CREATE TABLE IF NOT EXISTS impostos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  matriz_id CHAR(36) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  percentual DECIMAL(8,4) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_imposto_nome (empresa_id, nome),
  KEY idx_impostos_matriz (matriz_id),
  CONSTRAINT ck_imposto_percentual CHECK (percentual > 0 AND percentual <= 100),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Etapa 3 (Custos): mão de obra por categoria (as dos funcionários da empresa do
-- pedido), em % do custo global da produção. Só categorias com % maior que zero.
CREATE TABLE IF NOT EXISTS pedido_mao_de_obra (
  id CHAR(36) NOT NULL PRIMARY KEY,
  pedido_id CHAR(36) NOT NULL,
  categoria VARCHAR(60) NOT NULL,
  percentual DECIMAL(8,4) NOT NULL,
  ordem INT NOT NULL DEFAULT 1,
  usuario_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pedido_categoria (pedido_id, categoria),
  CONSTRAINT ck_pedido_mao_de_obra_pct CHECK (percentual >= 0 AND percentual <= 1000),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Etapa 3 (Custos): impostos do pedido, em % do custo global. O percentual vem do
-- cadastro e fica gravado no pedido (pode ser ajustado só para ele).
CREATE TABLE IF NOT EXISTS pedido_impostos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  pedido_id CHAR(36) NOT NULL,
  imposto_id CHAR(36) NOT NULL,
  percentual DECIMAL(8,4) NOT NULL,
  ordem INT NOT NULL DEFAULT 1,
  usuario_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pedido_imposto (pedido_id, imposto_id),
  CONSTRAINT ck_pedido_imposto_pct CHECK (percentual >= 0 AND percentual <= 100),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (imposto_id) REFERENCES impostos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

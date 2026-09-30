-- Utilitários: itens de utilidade de cada empresa (energia, água, gás, vapor…)
-- com um valor em R$. Bem de cada empresa, matriz ou filial, como o maquinário:
-- a dona do grupo escolhe a empresa, os demais só a sua.
CREATE TABLE IF NOT EXISTS utilitarios (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao VARCHAR(255) NULL,
  valor DECIMAL(14,4) NOT NULL DEFAULT 0,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_utilitario_nome (empresa_id, nome),
  CONSTRAINT ck_utilitario_valor CHECK (valor >= 0),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

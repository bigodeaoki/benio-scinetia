-- =====================================================================
-- MIGRAÇÃO 2026-09-25 — matérias-primas (primeira entidade de domínio)
--
-- Convenção adotada daqui em diante: id UUID gerado na aplicação, criado_em
-- e atualizado_em mantidos pelo banco. A auditoria passa a aceitar UUID em
-- entidade_id.
--
-- Sem USE de propósito: roda no banco em que você conectar.
-- Pode ser executado mais de uma vez sem duplicar nada.
-- =====================================================================

CREATE TABLE IF NOT EXISTS materias_primas (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id INT NOT NULL,
  nome VARCHAR(150) NOT NULL,
  unidade VARCHAR(20) NOT NULL DEFAULT 'un',
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_materia_nome (empresa_id, nome),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET @tipo := (SELECT DATA_TYPE FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auditoria' AND COLUMN_NAME = 'entidade_id');
SET @sql := IF(@tipo = 'int',
  'ALTER TABLE auditoria MODIFY entidade_id VARCHAR(36) NULL',
  'SELECT "auditoria.entidade_id já aceita UUID" AS aviso');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT (SELECT COUNT(*) FROM materias_primas) AS materias_primas,
       (SELECT DATA_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auditoria' AND COLUMN_NAME = 'entidade_id') AS auditoria_entidade_id;

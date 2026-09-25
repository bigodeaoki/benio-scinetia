-- =====================================================================
-- SCIENTIA SaaS — schema v1 (escopo)
--
-- Três visões:
--   admin  — operador do SaaS, sem empresa: cadastra empresas (matriz) e seus
--            donos e controla usuários de qualquer empresa. Não cria filial.
--   owner  — dono da matriz: cadastra filiais e usuários do seu grupo
--            (matriz + filiais) e alterna entre as empresas do grupo.
--   demais — pertencem a uma empresa (matriz ou filial) e só enxergam ela.
--
-- Convenção das entidades: id UUID gerado na aplicação, criado_em e
-- atualizado_em mantidos pelo banco, sem exclusão física (ativo).
-- Só roda em volume novo; mudanças posteriores entram em mysql/migrations/.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE empresas (
  id CHAR(36) NOT NULL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  cnpj VARCHAR(14) NULL,
  matriz TINYINT(1) NOT NULL DEFAULT 1,
  filial TINYINT(1) NOT NULL DEFAULT 0,
  empresa_id CHAR(36) NULL,                              -- matriz desta filial; NULL quando é matriz
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_empresas_matriz (empresa_id),
  -- não existe filial sem matriz, nem matriz apontando para outra empresa
  CONSTRAINT ck_empresa_tipo CHECK (
    (matriz = 1 AND filial = 0 AND empresa_id IS NULL) OR
    (matriz = 0 AND filial = 1 AND empresa_id IS NOT NULL)
  ),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NULL,                              -- NULL só para o admin global
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  senha_hash VARCHAR(100) NOT NULL,
  papel ENUM('admin','owner','producao','qualidade','compras','vendas','administrativo','financeiro','operador') NOT NULL DEFAULT 'operador',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_login_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_usuarios_empresa (empresa_id),
  CONSTRAINT ck_usuario_empresa CHECK (
    (papel = 'admin' AND empresa_id IS NULL) OR (papel <> 'admin' AND empresa_id IS NOT NULL)
  ),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Trilha de auditoria: quem fez o quê, em qual empresa de qual grupo (matriz)
CREATE TABLE auditoria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  matriz_id CHAR(36) NULL,                               -- grupo onde aconteceu; NULL em ações globais do admin
  empresa_id CHAR(36) NULL,
  usuario_id CHAR(36) NULL,
  acao VARCHAR(60) NOT NULL,                             -- ex.: filial.criada, usuario.inativado
  entidade VARCHAR(60) NULL,
  entidade_id VARCHAR(36) NULL,
  detalhes JSON NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auditoria_matriz (matriz_id, id),
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE SET NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Matérias-primas: insumos de cada empresa (matriz ou filial)
CREATE TABLE materias_primas (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  unidade VARCHAR(20) NOT NULL DEFAULT 'un',             -- kg, L, un...
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_materia_nome (empresa_id, nome),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- SCIENTIA SaaS — schema inicial (v0)
--
-- Uma CONTA é um cliente do SaaS: tem suas empresas, seus usuários e seus
-- dados. Todo dado de negócio pertence a uma empresa, e a empresa a uma
-- conta. Um usuário pertence a uma única conta (e-mail único no sistema).
--
-- Só roda em volume novo (docker-entrypoint-initdb.d). Mudanças depois
-- disso entram em mysql/migrations/, sempre idempotentes.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE contas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  slug VARCHAR(60) NOT NULL UNIQUE,                    -- identificador público (url, suporte)
  plano ENUM('trial','basico','pro') NOT NULL DEFAULT 'trial',
  status ENUM('ativa','suspensa','cancelada') NOT NULL DEFAULT 'ativa',
  trial_ate DATE NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_id INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  senha_hash VARCHAR(100) NOT NULL,
  papel ENUM('admin','producao','qualidade','compras','vendas','administrativo','financeiro','operador') NOT NULL DEFAULT 'operador',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  email_verificado_em DATETIME NULL,
  ultimo_login_em DATETIME NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_usuarios_conta (conta_id),
  FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE empresas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conta_id INT NOT NULL,
  razao_social VARCHAR(200) NOT NULL,
  nome_fantasia VARCHAR(200),
  cnpj VARCHAR(14),
  ie VARCHAR(20),
  uf CHAR(2) NOT NULL DEFAULT 'SP',
  municipio VARCHAR(120),
  endereco VARCHAR(255),
  regime ENUM('simples','presumido','real') NOT NULL DEFAULT 'presumido',
  aliquota_simples DECIMAL(6,3) NOT NULL DEFAULT 6.000, -- alíquota efetiva do DAS (%)
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_empresas_conta (conta_id),
  FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Trilha de auditoria: quem fez o quê, em qual empresa da conta
CREATE TABLE auditoria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conta_id INT NOT NULL,
  empresa_id INT NULL,
  usuario_id INT NULL,
  acao VARCHAR(60) NOT NULL,                           -- ex.: empresa.criada, usuario.inativado
  entidade VARCHAR(60) NULL,
  entidade_id VARCHAR(36) NULL,                        -- id numérico ou UUID da entidade
  detalhes JSON NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auditoria_conta (conta_id, id),
  FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Matérias-primas: insumos de cada empresa. Convenção de entidade do SaaS:
-- id UUID (gerado na aplicação), criado_em e atualizado_em mantidos pelo banco,
-- escopo por empresa (que pertence à conta) e sem exclusão física (ativo).
CREATE TABLE materias_primas (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id INT NOT NULL,
  nome VARCHAR(150) NOT NULL,
  unidade VARCHAR(20) NOT NULL DEFAULT 'un',            -- kg, L, un...
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_materia_nome (empresa_id, nome),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

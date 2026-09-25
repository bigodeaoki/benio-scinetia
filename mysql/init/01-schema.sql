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
  papel ENUM('admin','owner','farmacia','producao','qualidade','compras','vendas','administrativo','financeiro','operador') NOT NULL DEFAULT 'operador',
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

-- Matérias-primas: insumos de cada empresa. Cada uma é de uma empresa (matriz
-- ou filial) e carrega o vínculo com a matriz do grupo; a filial enxerga as
-- suas e as da matriz, e só a empresa dona altera a sua.
CREATE TABLE materias_primas (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  matriz_id CHAR(36) NOT NULL,                          -- matriz do grupo (vínculo para as filiais enxergarem)
  nome VARCHAR(150) NOT NULL,
  unidade VARCHAR(20) NOT NULL DEFAULT 'un',             -- kg, L, un...
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_materia_nome (empresa_id, nome),
  KEY idx_materias_matriz (matriz_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Estoque: entradas de compra de matéria-prima por empresa. Cada entrada é um
-- lote: quantidade na unidade informada (kg, L, un...), data da compra e de
-- vencimento. A matéria-prima pode ser da própria empresa ou da matriz.
-- Entrada errada é cancelada (ativo = 0), nunca apagada.
CREATE TABLE estoque (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  materia_prima_id CHAR(36) NOT NULL,
  quantidade DECIMAL(14,3) NOT NULL,
  unidade VARCHAR(20) NOT NULL,
  data_compra DATE NOT NULL,
  data_vencimento DATE NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_estoque_empresa (empresa_id, materia_prima_id, data_compra),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_prima_id) REFERENCES materias_primas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Formulações: fórmulas da empresa, mantidas pelo papel farmácia (e pelo dono).
-- Uma formulação é uma lista ordenada de matérias-primas com quantidade e
-- unidade. Como as matérias-primas, carrega o vínculo com a matriz: a filial
-- enxerga as fórmulas da matriz e só a empresa dona altera a sua.
CREATE TABLE formulacoes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  matriz_id CHAR(36) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_formulacao_nome (empresa_id, nome),
  KEY idx_formulacoes_matriz (matriz_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE formulacao_itens (
  formulacao_id CHAR(36) NOT NULL,
  materia_prima_id CHAR(36) NOT NULL,
  ordem INT NOT NULL DEFAULT 1,                          -- sequência de adição
  quantidade DECIMAL(14,4) NOT NULL,
  unidade VARCHAR(20) NOT NULL,
  PRIMARY KEY (formulacao_id, materia_prima_id),
  FOREIGN KEY (formulacao_id) REFERENCES formulacoes(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_prima_id) REFERENCES materias_primas(id)
) ENGINE=InnoDB;

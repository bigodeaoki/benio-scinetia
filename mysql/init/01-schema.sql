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

-- Envase: itens de envasamento (frascos, tampas, rótulos, caixas...). Sem
-- quantidade aqui: quem controla é o estoque, por entradas de compra. Mesma
-- visibilidade das matérias-primas (a filial enxerga os da matriz).
CREATE TABLE envases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  matriz_id CHAR(36) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_envase_nome (empresa_id, nome),
  KEY idx_envases_matriz (matriz_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Estoque: entradas de compra por empresa, de matéria-prima OU de envase
-- (exatamente um dos dois). Cada entrada é um lote: quantidade na unidade
-- informada, data da compra e de vencimento. Entrada errada é cancelada.
CREATE TABLE estoque (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  materia_prima_id CHAR(36) NULL,
  envase_id CHAR(36) NULL,
  quantidade DECIMAL(14,3) NOT NULL,
  unidade VARCHAR(20) NOT NULL,
  data_compra DATE NOT NULL,
  data_vencimento DATE NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_estoque_materia (empresa_id, materia_prima_id, data_compra),
  KEY idx_estoque_envase (empresa_id, envase_id, data_compra),
  CONSTRAINT ck_estoque_item CHECK ((materia_prima_id IS NOT NULL) + (envase_id IS NOT NULL) = 1),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_prima_id) REFERENCES materias_primas(id) ON DELETE CASCADE,
  FOREIGN KEY (envase_id) REFERENCES envases(id) ON DELETE CASCADE
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

-- Maquinário: máquinas e equipamentos de cada empresa (bem físico, não é
-- compartilhado com as filiais). Custo por hora em R$ e rendimento em %,
-- usado como fator de perda como no v1 (custo / (rendimento/100)).
CREATE TABLE maquinas (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  descricao VARCHAR(255) NULL,
  modelo VARCHAR(100) NULL,
  custo_hora DECIMAL(12,2) NOT NULL DEFAULT 0,
  rendimento_pct DECIMAL(6,2) NOT NULL DEFAULT 100,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_maquina_titulo (empresa_id, titulo),
  CONSTRAINT ck_maquina_custo CHECK (custo_hora >= 0),
  CONSTRAINT ck_maquina_rendimento CHECK (rendimento_pct > 0 AND rendimento_pct <= 100),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Logística: veículos de cada empresa (caminhão, carro, van ou qualquer meio
-- de transporte; o tipo é texto livre). Bem físico como o maquinário: a
-- filial não enxerga os da matriz. Custo por hora em R$; status operacional
-- separado do `ativo` (que é a exclusão lógica).
CREATE TABLE veiculos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  marca VARCHAR(80) NULL,
  modelo VARCHAR(100) NULL,
  ano SMALLINT NULL,
  placa VARCHAR(10) NULL,
  custo_hora DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('disponivel','em_uso','manutencao') NOT NULL DEFAULT 'disponivel',
  ultima_manutencao DATE NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_veiculo_placa (empresa_id, placa),
  KEY idx_veiculos_empresa (empresa_id, tipo),
  CONSTRAINT ck_veiculo_custo CHECK (custo_hora >= 0),
  CONSTRAINT ck_veiculo_ano CHECK (ano IS NULL OR ano BETWEEN 1900 AND 2100),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Mão de obra: funcionários de cada empresa (matriz ou filial), com categoria
-- livre (financeiro, marketing, produção…) e custo por hora em R$ para o
-- custeio. Não é o login do sistema (usuarios): nem todo funcionário acessa
-- o app. Status é a situação de RH; `ativo` é a exclusão lógica.
CREATE TABLE funcionarios (
  id CHAR(36) NOT NULL PRIMARY KEY,
  empresa_id CHAR(36) NOT NULL,
  nome VARCHAR(150) NOT NULL,
  documento VARCHAR(20) NULL,
  email VARCHAR(150) NULL,
  categoria VARCHAR(60) NOT NULL,
  custo_hora DECIMAL(12,2) NOT NULL DEFAULT 0,
  data_admissao DATE NULL,
  status ENUM('ativo','ferias','afastado','desligado') NOT NULL DEFAULT 'ativo',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_funcionario_documento (empresa_id, documento),
  UNIQUE KEY uk_funcionario_email (empresa_id, email),
  KEY idx_funcionarios_empresa (empresa_id, categoria, nome),
  CONSTRAINT ck_funcionario_custo CHECK (custo_hora >= 0),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Documentos do grupo: qualquer usuário sobe um arquivo (guardado no banco,
-- até 10 MB) e todo o grupo enxerga. Dois status de download: viram
-- verdadeiros quando alguém da matriz, ou de alguma filial, baixa o arquivo
-- (a data guardada é a do primeiro download de cada lado).
CREATE TABLE documentos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  matriz_id CHAR(36) NOT NULL,
  empresa_id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NULL,
  titulo VARCHAR(150) NOT NULL,
  descricao VARCHAR(255) NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  tamanho INT UNSIGNED NOT NULL,
  conteudo LONGBLOB NOT NULL,
  baixado_matriz TINYINT(1) NOT NULL DEFAULT 0,
  baixado_matriz_em DATETIME NULL,
  baixado_filial TINYINT(1) NOT NULL DEFAULT 0,
  baixado_filial_em DATETIME NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_documentos_grupo (matriz_id, ativo, criado_em),
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Clientes: cada empresa cadastra os seus, e todo o grupo (matriz e filiais)
-- enxerga. Altera quem tem a empresa dona no escopo. CNPJ só com os 14
-- caracteres (numérico ou alfanumérico), único no grupo quando informado.
CREATE TABLE clientes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  matriz_id CHAR(36) NOT NULL,
  empresa_id CHAR(36) NOT NULL,
  razao_social VARCHAR(150) NOT NULL,
  nome_fantasia VARCHAR(150) NULL,
  cnpj VARCHAR(14) NULL,
  inscricao_estadual VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  telefone VARCHAR(30) NULL,
  cep CHAR(8) NULL,
  logradouro VARCHAR(150) NULL,
  numero VARCHAR(20) NULL,
  complemento VARCHAR(80) NULL,
  bairro VARCHAR(80) NULL,
  cidade VARCHAR(100) NULL,
  uf CHAR(2) NULL,
  observacoes VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cliente_cnpj (matriz_id, cnpj),
  KEY idx_clientes_grupo (matriz_id, ativo, razao_social),
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Responsáveis (contatos) do cliente, na ordem informada; regravados a cada edição
CREATE TABLE cliente_responsaveis (
  cliente_id CHAR(36) NOT NULL,
  ordem INT NOT NULL,
  nome VARCHAR(150) NOT NULL,
  cargo VARCHAR(80) NULL,
  telefone VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  PRIMARY KEY (cliente_id, ordem),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Pedidos: entrada em etapas, salva no meio (status + etapa onde parou).
-- Etapa 1: cliente do grupo e formulação (pode nascer só com o nome; a
-- farmácia completa os ingredientes depois). Número sequencial por empresa.
-- Cancelar é status, nunca exclusão.
CREATE TABLE pedidos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  matriz_id CHAR(36) NOT NULL,
  empresa_id CHAR(36) NOT NULL,
  numero INT NOT NULL,
  cliente_id CHAR(36) NOT NULL,
  formulacao_id CHAR(36) NULL,
  status ENUM('rascunho','concluido','cancelado') NOT NULL DEFAULT 'rascunho',
  etapa TINYINT NOT NULL DEFAULT 1,
  observacoes VARCHAR(255) NULL,
  usuario_id CHAR(36) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pedido_numero (empresa_id, numero),
  KEY idx_pedidos_grupo (matriz_id, status, criado_em),
  FOREIGN KEY (matriz_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (formulacao_id) REFERENCES formulacoes(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

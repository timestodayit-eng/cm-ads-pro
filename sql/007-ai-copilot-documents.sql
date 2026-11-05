-- Ads Command Center v0.8: ADDITIVE MySQL 8 migration.
-- Back up your existing production database. Do NOT import the fresh-install schema on a live database.
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS ai_conversations (
  id CHAR(36) PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  scope_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ai_convo_owner (owner_id,updated_at),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id CHAR(36) NOT NULL UNIQUE,
  conversation_id CHAR(36) NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  evidence_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_msg_convo_time(conversation_id,created_at),
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ai_documents (
  id CHAR(36) PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  conversation_id CHAR(36) NULL,
  title VARCHAR(180) NOT NULL,
  status ENUM('draft','final') NOT NULL DEFAULT 'draft',
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ai_doc_owner(owner_id,updated_at),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ai_document_versions (
  id CHAR(36) PRIMARY KEY,
  document_id CHAR(36) NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  sections_json JSON NOT NULL,
  sources_json JSON NULL,
  change_summary VARCHAR(250) NOT NULL DEFAULT 'Document saved',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_doc_version(document_id,version_no),
  FOREIGN KEY (document_id) REFERENCES ai_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

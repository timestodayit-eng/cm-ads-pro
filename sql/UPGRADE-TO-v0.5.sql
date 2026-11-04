-- Coastal v0.5 additive upgrade for EXISTING v0.4 databases. Backup first.
-- It creates Custom Reports and Panel Name tables only. No tables are dropped.
SET NAMES utf8mb4;
-- Coastal Ads Command Center v0.5: Additive schema. Back up your database first.
-- Import AFTER 004-publishing.sql, once, through phpMyAdmin. No data is dropped.
CREATE TABLE IF NOT EXISTS custom_report_templates (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  config_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id),
  INDEX idx_report_templates_updated(updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing MySQL databases: run once after 005-custom-reports.sql.
-- Does not replace, delete or modify your users, campaigns, Meta accounts or settings.
CREATE TABLE IF NOT EXISTS workspace_branding (
 id TINYINT UNSIGNED PRIMARY KEY,
 panel_name VARCHAR(80) NOT NULL DEFAULT 'Coastal Ads Command Center',
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_brand_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO workspace_branding(id,panel_name) VALUES (1,'Coastal Ads Command Center');

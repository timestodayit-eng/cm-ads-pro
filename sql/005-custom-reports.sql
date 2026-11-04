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

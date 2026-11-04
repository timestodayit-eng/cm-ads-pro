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

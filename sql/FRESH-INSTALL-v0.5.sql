-- COASTAL ADS COMMAND CENTER v0.4 FRESH DATABASE ONLY.
-- New empty MySQL 8 database, UTF8MB4. No credentials or passwords in this file.
SET NAMES utf8mb4;


-- ===== BEGIN 001-initial.sql =====
-- New database only. Import using phpMyAdmin. No credentials or seed password.
-- MySQL 8.0+, InnoDB, utf8mb4. Existing CI staff tables are NOT migrated.
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS app_locks (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO app_locks (id) VALUES (1);
CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('super_admin','manager','analyst') NOT NULL DEFAULT 'analyst',
 active TINYINT(1) NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,expires_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,INDEX(expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS rate_limits (
 key_hash CHAR(64) PRIMARY KEY,window_end DATETIME NOT NULL,hits INT NOT NULL DEFAULT 1
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS oauth_states (
 state_hash CHAR(64) PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,session_hash CHAR(64) NOT NULL,expires_at DATETIME NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS meta_connections (
 id CHAR(36) PRIMARY KEY,meta_user_id VARCHAR(50) NOT NULL UNIQUE,owner_id BIGINT UNSIGNED NOT NULL,
 token_cipher TEXT NOT NULL,expires_at DATETIME NULL,connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ad_accounts (
 account_id VARCHAR(64) PRIMARY KEY,connection_id CHAR(36) NOT NULL,
 name VARCHAR(255) NOT NULL,currency VARCHAR(10) NOT NULL,timezone_name VARCHAR(80) NOT NULL,
 slot INT NULL UNIQUE,account_status INT NULL,
 last_sync DATETIME NULL,last_error VARCHAR(100) NULL,
 billing_snapshot JSON NULL,
 FOREIGN KEY(connection_id) REFERENCES meta_connections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS insight_daily (
 account_id VARCHAR(64) NOT NULL,ad_id VARCHAR(64) NOT NULL,day DATE NOT NULL,
 campaign_id VARCHAR(64) NOT NULL,adset_id VARCHAR(64) NOT NULL,ad_name VARCHAR(255) NOT NULL,
 spend DECIMAL(18,6) NOT NULL,impressions BIGINT UNSIGNED NOT NULL,clicks BIGINT UNSIGNED NOT NULL,
 actions_json JSON NOT NULL,synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id,ad_id,day),FOREIGN KEY(account_id) REFERENCES ad_accounts(account_id) ON DELETE CASCADE,INDEX(day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS campaign_drafts (
 id CHAR(36) PRIMARY KEY,name VARCHAR(150) NOT NULL,created_by BIGINT UNSIGNED NOT NULL,
 config_json JSON NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ai_reports (
 id CHAR(36) PRIMARY KEY,created_by BIGINT UNSIGNED NULL,model VARCHAR(100) NOT NULL,
 period_days INT NOT NULL,status ENUM('running','completed','failed') NOT NULL,
 snapshot_json JSON NOT NULL,report_json JSON NULL,error_code VARCHAR(100) NULL,
 input_tokens INT NULL,output_tokens INT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,INDEX(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ai_daily_usage (
 day DATE PRIMARY KEY,attempts INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS jobs (
 id CHAR(36) PRIMARY KEY,kind ENUM('sync_account','ai_report') NOT NULL,dedupe_key VARCHAR(180) NOT NULL UNIQUE,
 payload_json JSON NOT NULL,status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
 attempts INT NOT NULL DEFAULT 0,run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 lease_until DATETIME NULL,error_code VARCHAR(100) NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 finished_at DATETIME NULL,INDEX(status,run_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit_log (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NULL,event_name VARCHAR(100) NOT NULL,
 entity_id VARCHAR(100) NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX(created_at)
) ENGINE=InnoDB;

-- ===== END 001-initial.sql =====

-- ===== BEGIN 002-media-finance.sql =====
-- Coastal v0.2 upgrade: import into the EXISTING Coastal database after a backup.
-- No DROP/DELETE/ALTER of existing users, sessions, accounts, drafts or reports.
-- Re-running this migration is safe. For a new installation, import 001 first.
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS media_assets (
 id CHAR(36) PRIMARY KEY,
 client_upload_id CHAR(36) NOT NULL UNIQUE,
 owner_id BIGINT UNSIGNED NOT NULL,
 original_name VARCHAR(240) NOT NULL,
 mime_type VARCHAR(80) NOT NULL,
 kind ENUM('video','image') NOT NULL,
 byte_size BIGINT UNSIGNED NOT NULL,
 fingerprint CHAR(64) NOT NULL,
 object_key VARCHAR(255) NOT NULL UNIQUE,
 bucket_name VARCHAR(100) NOT NULL,
 upload_id TEXT NULL,
 part_size INT UNSIGNED NOT NULL,
 status ENUM('initializing','uploading','completing','ready','aborted','failed','deleting','deleted') NOT NULL,
 error_code VARCHAR(100) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 completed_at DATETIME NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY(owner_id) REFERENCES users(id),
 INDEX(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS draft_media (
 draft_id CHAR(36) NOT NULL, media_id CHAR(36) NOT NULL,
 PRIMARY KEY(draft_id,media_id),
 FOREIGN KEY(draft_id) REFERENCES campaign_drafts(id) ON DELETE CASCADE,
 FOREIGN KEY(media_id) REFERENCES media_assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS account_spend_daily (
 account_id VARCHAR(64) NOT NULL,day DATE NOT NULL,
 currency VARCHAR(10) NOT NULL,timezone_name VARCHAR(80) NOT NULL,
 spend DECIMAL(18,6) NOT NULL,
 synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id,day),
 FOREIGN KEY(account_id) REFERENCES ad_accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== END 002-media-finance.sql =====

-- ===== BEGIN 003-monitoring.sql =====
-- Coastal 0.3: ADDITIVE migration. Back up first, then import into the EXISTING DB.
-- Requires 001 and 002. No users, credentials or saved data are deleted.
CREATE TABLE IF NOT EXISTS workspace_settings (
 id TINYINT PRIMARY KEY, config_json JSON NOT NULL, updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduler_status (
 id TINYINT PRIMARY KEY, last_tick_at DATETIME NULL, last_finished_at DATETIME NULL,
 source VARCHAR(30) NULL, last_result JSON NULL,runner_token CHAR(36) NULL,runner_until DATETIME NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO scheduler_status (id) VALUES (1);
CREATE TABLE IF NOT EXISTS account_sync_state (
 account_id VARCHAR(64) PRIMARY KEY,
 last_attempt_at DATETIME NULL,last_success_at DATETIME NULL,next_allowed_at DATETIME NULL,
 history_synced_at DATETIME NULL,hourly_synced_at DATETIME NULL,
 last_error VARCHAR(100) NULL,details_json JSON NULL,
 FOREIGN KEY(account_id) REFERENCES ad_accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS account_hourly (
 account_id VARCHAR(64) NOT NULL,local_day DATE NOT NULL,hour_label VARCHAR(40) NOT NULL,
 start_utc DATETIME NOT NULL,end_utc DATETIME NOT NULL,timezone_name VARCHAR(80) NOT NULL,
 currency VARCHAR(10) NOT NULL,spend DECIMAL(18,6) NOT NULL,
 impressions BIGINT UNSIGNED NULL,clicks BIGINT UNSIGNED NULL,link_clicks BIGINT UNSIGNED NULL,
 synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id,local_day,hour_label),INDEX(account_id,start_utc),
 FOREIGN KEY(account_id) REFERENCES ad_accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS insight_extras (
 account_id VARCHAR(64) NOT NULL,ad_id VARCHAR(64) NOT NULL,day DATE NOT NULL,
 link_clicks BIGINT UNSIGNED NULL,raw_actions JSON NOT NULL,
 PRIMARY KEY(account_id,ad_id,day),
 FOREIGN KEY(account_id,ad_id,day) REFERENCES insight_daily(account_id,ad_id,day) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== END 003-monitoring.sql =====

-- ===== BEGIN 004-publishing.sql =====
-- Coastal Ads Command Center v0.4: safe, additive Meta publishing module.
-- Backup the database and import once AFTER sql/003-monitoring.sql.
-- Do not run this migration against the original Creative International schema.
-- New 0.4 string identifiers intentionally lack foreign keys to legacy tables
-- because existing 0.3 deployments can have mismatched MySQL 8 collations.
-- The app validates these references before insertion; new run/batch FKs remain.
ALTER TABLE jobs MODIFY COLUMN kind ENUM('sync_account','ai_report','publish_step','activate_step','pause_step') NOT NULL;
CREATE TABLE IF NOT EXISTS publish_batches (
 id CHAR(36) PRIMARY KEY,
 draft_id CHAR(36) NOT NULL,
 request_key CHAR(36) NOT NULL UNIQUE,
 approved_by BIGINT UNSIGNED NOT NULL,
 status ENUM('queued','building','ready_for_review','partial','failed','activation_queued','active','paused') NOT NULL DEFAULT 'queued',
 config_json JSON NOT NULL,
 currency VARCHAR(10) NOT NULL,
 combined_daily_minor BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(approved_by) REFERENCES users(id),
 INDEX(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS publish_account_runs (
 id CHAR(36) PRIMARY KEY,
 batch_id CHAR(36) NOT NULL,
 account_id VARCHAR(64) NOT NULL,
 page_id VARCHAR(40) NOT NULL,
 status ENUM('queued','building','waiting_media','ready_for_review','needs_review','failed','activating','active','pausing','paused') NOT NULL DEFAULT 'queued',
 stage VARCHAR(36) NOT NULL DEFAULT 'campaign',
 content_index INT UNSIGNED NOT NULL DEFAULT 0,
 inflight TINYINT(1) NOT NULL DEFAULT 0,
 inflight_stage VARCHAR(36) NULL,
 campaign_id VARCHAR(64) NULL,
 activation_index INT UNSIGNED NOT NULL DEFAULT 0,
 activation_stage VARCHAR(36) NULL,
 error_code VARCHAR(100) NULL,
 error_message VARCHAR(350) NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(batch_id) REFERENCES publish_batches(id) ON DELETE CASCADE,
 UNIQUE KEY uniq_batch_account(batch_id,account_id),
 INDEX(status,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS publish_items (
 id CHAR(36) PRIMARY KEY,
 run_id CHAR(36) NOT NULL,
 content_index INT UNSIGNED NOT NULL,
 media_asset_id CHAR(36) NOT NULL,
 status VARCHAR(36) NOT NULL DEFAULT 'queued',
 meta_media_id VARCHAR(64) NULL,
 image_hash VARCHAR(128) NULL,
 adset_id VARCHAR(64) NULL,
 creative_id VARCHAR(64) NULL,
 ad_id VARCHAR(64) NULL,
 error_code VARCHAR(100) NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(run_id) REFERENCES publish_account_runs(id) ON DELETE CASCADE,
 UNIQUE KEY uniq_run_content(run_id,content_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS meta_media_cache (
 account_id VARCHAR(64) NOT NULL,
 media_asset_id CHAR(36) NOT NULL,
 meta_media_id VARCHAR(64) NULL,
 image_hash VARCHAR(128) NULL,
 status VARCHAR(36) NOT NULL DEFAULT 'processing',
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id,media_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== END 004-publishing.sql =====

-- ===== BEGIN 005-custom-reports.sql =====
-- Coastal v0.5 templates for fresh installs.
CREATE TABLE IF NOT EXISTS custom_report_templates (
 id CHAR(36) PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 owner_id BIGINT UNSIGNED NOT NULL,
 config_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(owner_id) REFERENCES users(id), INDEX idx_report_templates_updated(updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END 005-custom-reports.sql =====

-- ===== BEGIN 006-workspace-branding.sql =====
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
-- ===== END 006-workspace-branding.sql =====

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
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS account_spend_daily (
 account_id VARCHAR(64) NOT NULL,day DATE NOT NULL,
 currency VARCHAR(10) NOT NULL,timezone_name VARCHAR(80) NOT NULL,
 spend DECIMAL(18,6) NOT NULL,
 synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id,day),
 FOREIGN KEY(account_id) REFERENCES ad_accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Coastal 0.3: ADDITIVE migration. Back up first, then import into the EXISTING DB.
-- Requires 001 and 002. No users, credentials or saved data are deleted.
CREATE TABLE IF NOT EXISTS workspace_settings (
 id TINYINT PRIMARY KEY, config_json JSON NOT NULL, updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS account_hourly (
 account_id VARCHAR(64) NOT NULL,local_day DATE NOT NULL,hour_label VARCHAR(40) NOT NULL,
 start_utc DATETIME NOT NULL,end_utc DATETIME NOT NULL,timezone_name VARCHAR(80) NOT NULL,
 currency VARCHAR(10) NOT NULL,spend DECIMAL(18,6) NOT NULL,
 impressions BIGINT UNSIGNED NULL,clicks BIGINT UNSIGNED NULL,link_clicks BIGINT UNSIGNED NULL,
 synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(account_id,local_day,hour_label),INDEX(account_id,start_utc),
 FOREIGN KEY(account_id) REFERENCES ad_accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS insight_extras (
 account_id VARCHAR(64) NOT NULL,ad_id VARCHAR(64) NOT NULL,day DATE NOT NULL,
 link_clicks BIGINT UNSIGNED NULL,raw_actions JSON NOT NULL,
 PRIMARY KEY(account_id,ad_id,day),
 FOREIGN KEY(account_id,ad_id,day) REFERENCES insight_daily(account_id,ad_id,day) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

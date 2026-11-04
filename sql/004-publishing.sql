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

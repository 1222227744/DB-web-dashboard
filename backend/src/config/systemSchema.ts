import pool from './db.js';
import { env } from './env.js';

type InformationSchemaColumnRow = {
  total: number;
};

export const ensureSystemSchema = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户内部唯一 ID',
      user_name VARCHAR(50) NOT NULL COMMENT '用户名，仅供展示',
      account_no VARCHAR(10) NOT NULL COMMENT '登录账号，10 位随机数字',
      password_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt 加密后的密码哈希值',
      status ENUM('active', 'disabled') NOT NULL DEFAULT 'active' COMMENT '用户状态',
      register_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '账号注册时间',
      last_login_at TIMESTAMP NULL DEFAULT NULL COMMENT '最近登录时间',
      UNIQUE KEY uk_users_account_no (account_no),
      KEY idx_users_status (status)
    ) COMMENT='系统用户表'
  `);

  await ensureColumn('users', 'status', `
    ALTER TABLE users
      ADD COLUMN status ENUM('active', 'disabled') NOT NULL DEFAULT 'active' COMMENT '用户状态'
  `);
  await ensureColumn('users', 'last_login_at', `
    ALTER TABLE users
      ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL COMMENT '最近登录时间'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INT PRIMARY KEY COMMENT '用户 ID',
      nickname VARCHAR(50) NOT NULL COMMENT '展示昵称',
      avatar_asset_id BIGINT NULL COMMENT '当前头像资源 ID',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      CONSTRAINT fk_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) COMMENT='用户资料表'
  `);
  await ensureColumn('user_profiles', 'avatar_asset_id', `
    ALTER TABLE user_profiles
      ADD COLUMN avatar_asset_id BIGINT NULL COMMENT '当前头像资源 ID'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INT PRIMARY KEY COMMENT '用户 ID',
      theme_color VARCHAR(20) NOT NULL DEFAULT '#409EFF' COMMENT '主题色',
      background_mode ENUM('particle', 'image', 'gradient') NOT NULL DEFAULT 'particle' COMMENT '背景类型',
      background_asset_id BIGINT NULL COMMENT '背景资源 ID',
      layout_json JSON NULL COMMENT '工作台布局配置',
      confirm_preferences_json JSON NULL COMMENT '二次确认偏好',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      CONSTRAINT fk_preferences_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) COMMENT='用户偏好表'
  `);
  await ensureColumn('user_preferences', 'background_mode', `
    ALTER TABLE user_preferences
      ADD COLUMN background_mode ENUM('particle', 'image', 'gradient') NOT NULL DEFAULT 'particle' COMMENT '背景类型'
  `);
  await ensureColumn('user_preferences', 'background_asset_id', `
    ALTER TABLE user_preferences
      ADD COLUMN background_asset_id BIGINT NULL COMMENT '背景资源 ID'
  `);
  await ensureColumn('user_preferences', 'layout_json', `
    ALTER TABLE user_preferences
      ADD COLUMN layout_json JSON NULL COMMENT '工作台布局配置'
  `);
  await ensureColumn('user_preferences', 'confirm_preferences_json', `
    ALTER TABLE user_preferences
      ADD COLUMN confirm_preferences_json JSON NULL COMMENT '二次确认偏好'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_assets (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '资源 ID',
      user_id INT NOT NULL COMMENT '用户 ID',
      asset_type ENUM('avatar', 'background', 'other') NOT NULL COMMENT '资源类型',
      storage_type VARCHAR(30) NOT NULL DEFAULT 'local' COMMENT '存储类型',
      storage_key VARCHAR(500) NOT NULL COMMENT '存储键',
      original_name VARCHAR(255) NULL COMMENT '原始文件名',
      mime_type VARCHAR(100) NOT NULL COMMENT 'MIME 类型',
      file_size BIGINT UNSIGNED NOT NULL COMMENT '文件大小',
      checksum VARCHAR(128) NOT NULL COMMENT '文件校验和',
      status ENUM('active', 'deleted') NOT NULL DEFAULT 'active' COMMENT '状态',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      deleted_at DATETIME NULL COMMENT '删除时间',
      CONSTRAINT fk_assets_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      KEY idx_assets_user_type (user_id, asset_type),
      KEY idx_assets_user_time (user_id, created_at),
      KEY idx_assets_status (status)
    ) COMMENT='用户资源元信息表'
  `);
  await ensureColumn('user_assets', 'storage_type', `
    ALTER TABLE user_assets
      ADD COLUMN storage_type VARCHAR(30) NOT NULL DEFAULT 'local' COMMENT '存储类型'
  `);
  await ensureColumn('user_assets', 'storage_key', `
    ALTER TABLE user_assets
      ADD COLUMN storage_key VARCHAR(500) NULL COMMENT '存储键'
  `);
  await ensureColumn('user_assets', 'file_size', `
    ALTER TABLE user_assets
      ADD COLUMN file_size BIGINT UNSIGNED NULL COMMENT '文件大小'
  `);
  await ensureColumn('user_assets', 'checksum', `
    ALTER TABLE user_assets
      ADD COLUMN checksum VARCHAR(128) NULL COMMENT '文件校验和'
  `);
  await ensureColumn('user_assets', 'status', `
    ALTER TABLE user_assets
      ADD COLUMN status ENUM('active', 'deleted') NOT NULL DEFAULT 'active' COMMENT '状态'
  `);
  await ensureColumn('user_assets', 'deleted_at', `
    ALTER TABLE user_assets
      ADD COLUMN deleted_at DATETIME NULL COMMENT '删除时间'
  `);
  await migrateUserAssetColumns();
  await pool.query(`
    ALTER TABLE user_assets
      MODIFY asset_type ENUM('avatar', 'background', 'other') NOT NULL COMMENT '资源类型',
      MODIFY storage_key VARCHAR(500) NOT NULL COMMENT '存储键',
      MODIFY file_size BIGINT UNSIGNED NOT NULL COMMENT '文件大小',
      MODIFY checksum VARCHAR(128) NOT NULL COMMENT '文件校验和'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_databases (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '用户数据库元数据 ID',
      user_id INT NOT NULL COMMENT '用户 ID',
      display_name VARCHAR(64) NOT NULL COMMENT '用户可见数据库名',
      schema_name VARCHAR(128) NOT NULL COMMENT '实际 MySQL schema 名称',
      status ENUM('active', 'deleting', 'deleted') NOT NULL DEFAULT 'active' COMMENT '数据库状态',
      table_count INT NOT NULL DEFAULT 0 COMMENT '表数量快照',
      size_bytes BIGINT NOT NULL DEFAULT 0 COMMENT '容量快照',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      deleted_at TIMESTAMP NULL DEFAULT NULL COMMENT '删除时间',
      CONSTRAINT fk_user_databases_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE KEY uk_user_databases_schema_name (schema_name),
      UNIQUE KEY uk_user_databases_user_display_status (user_id, display_name, status),
      KEY idx_user_databases_user_status_time (user_id, status, created_at)
    ) COMMENT='用户数据库元数据表'
  `);

  await pool.query(`
    ALTER TABLE user_databases
      MODIFY status ENUM('active', 'deleting', 'deleted') NOT NULL DEFAULT 'active' COMMENT '数据库状态'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '日志 ID',
      trace_id VARCHAR(64) NOT NULL COMMENT '请求追踪 ID',
      user_id INT NULL COMMENT '操作用户 ID',
      database_id BIGINT UNSIGNED NULL COMMENT '平台数据库 ID',
      transaction_id BIGINT UNSIGNED NULL COMMENT '事务会话 ID',
      object_type VARCHAR(30) NOT NULL COMMENT '对象类型',
      object_name VARCHAR(128) NULL COMMENT '对象名称',
      action_type VARCHAR(50) NOT NULL COMMENT '操作类型',
      summary VARCHAR(255) NOT NULL COMMENT '操作摘要',
      detail_json JSON NULL COMMENT '操作详情',
      success BOOLEAN NOT NULL DEFAULT TRUE COMMENT '成功状态',
      error_code VARCHAR(80) NULL COMMENT '错误码',
      error_message VARCHAR(500) NULL COMMENT '错误消息',
      duration_ms INT UNSIGNED NULL COMMENT '耗时毫秒',
      ip_address VARCHAR(45) NULL COMMENT '客户端 IP',
      user_agent VARCHAR(255) NULL COMMENT 'User-Agent',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL,
      CONSTRAINT fk_audit_database
        FOREIGN KEY (database_id) REFERENCES user_databases(id)
        ON DELETE SET NULL,
      KEY idx_audit_trace (trace_id),
      KEY idx_audit_user_time (user_id, created_at),
      KEY idx_audit_database_time (database_id, created_at),
      KEY idx_audit_action_time (action_type, created_at),
      KEY idx_audit_object_time (object_type, created_at)
    ) COMMENT='操作审计日志表'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stat_snapshots (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '快照 ID',
      user_id INT NOT NULL COMMENT '用户 ID',
      database_id BIGINT UNSIGNED NULL COMMENT '平台数据库 ID',
      table_name VARCHAR(64) NULL COMMENT '表名',
      scope ENUM('user', 'database', 'table') NOT NULL COMMENT '统计范围',
      metric_json JSON NOT NULL COMMENT '统计指标',
      captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',
      CONSTRAINT fk_stat_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_stat_database
        FOREIGN KEY (database_id) REFERENCES user_databases(id)
        ON DELETE CASCADE,
      KEY idx_stat_user_scope_time (user_id, scope, captured_at),
      KEY idx_stat_database_time (database_id, captured_at)
    ) COMMENT='统计快照表'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Refresh Token ID',
      user_id INT NOT NULL COMMENT '用户 ID',
      token_hash CHAR(64) NOT NULL COMMENT 'Refresh Token SHA-256 哈希',
      token_family CHAR(36) NOT NULL COMMENT 'Token 家族 ID',
      expires_at TIMESTAMP NOT NULL COMMENT '过期时间',
      revoked_at TIMESTAMP NULL DEFAULT NULL COMMENT '撤销时间',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      CONSTRAINT fk_refresh_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE KEY idx_refresh_token_hash (token_hash),
      KEY idx_refresh_user_family (user_id, token_family),
      KEY idx_refresh_user_expires (user_id, expires_at)
    ) COMMENT='Refresh Token 会话表'
  `);
};

const migrateUserAssetColumns = async (): Promise<void> => {
  const hasStoredPath = await columnExists('user_assets', 'stored_path');
  const hasSizeBytes = await columnExists('user_assets', 'size_bytes');

  if (hasStoredPath) {
    await pool.query(`
      UPDATE user_assets
      SET storage_key = COALESCE(storage_key, stored_path, CONCAT('missing/', id))
      WHERE storage_key IS NULL
    `);
  } else {
    await pool.query(`
      UPDATE user_assets
      SET storage_key = COALESCE(storage_key, CONCAT('missing/', id))
      WHERE storage_key IS NULL
    `);
  }

  if (hasSizeBytes) {
    await pool.query(`
      UPDATE user_assets
      SET file_size = COALESCE(file_size, size_bytes, 0)
      WHERE file_size IS NULL
    `);
  } else {
    await pool.query(`
      UPDATE user_assets
      SET file_size = COALESCE(file_size, 0)
      WHERE file_size IS NULL
    `);
  }

  await pool.query(`
    UPDATE user_assets
    SET checksum = COALESCE(checksum, SHA2(CONCAT(storage_key, '#', id), 256))
    WHERE checksum IS NULL
  `);
};

const ensureColumn = async (tableName: string, columnName: string, alterSql: string): Promise<void> => {
  const exists = await columnExists(tableName, columnName);

  if (!exists) {
    await pool.query(alterSql);
  }
};

const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = ?
       AND column_name = ?`,
    [env.dbName, tableName, columnName]
  );

  const total = Number((rows as InformationSchemaColumnRow[])[0]?.total ?? 0);

  return total > 0;
};

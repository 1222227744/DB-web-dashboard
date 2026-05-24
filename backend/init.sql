CREATE DATABASE IF NOT EXISTS DB_App
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE DB_App;

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
) COMMENT='系统用户表';

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INT PRIMARY KEY COMMENT '用户 ID',
  nickname VARCHAR(50) NOT NULL COMMENT '展示昵称',
  avatar_asset_id BIGINT NULL COMMENT '当前头像资源 ID',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  CONSTRAINT fk_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) COMMENT='用户资料表';

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
) COMMENT='用户偏好表';

CREATE TABLE IF NOT EXISTS user_assets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '资源 ID',
  user_id INT NOT NULL COMMENT '用户 ID',
  asset_type ENUM('avatar', 'background') NOT NULL COMMENT '资源类型',
  original_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
  stored_path VARCHAR(500) NOT NULL COMMENT '服务端相对存储路径',
  mime_type VARCHAR(100) NOT NULL COMMENT 'MIME 类型',
  size_bytes BIGINT NOT NULL COMMENT '文件大小',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  CONSTRAINT fk_assets_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  KEY idx_assets_user_type (user_id, asset_type),
  KEY idx_assets_user_time (user_id, created_at)
) COMMENT='用户资源元信息表';

CREATE TABLE IF NOT EXISTS user_databases (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '用户数据库元数据 ID',
  user_id INT NOT NULL COMMENT '用户 ID',
  display_name VARCHAR(64) NOT NULL COMMENT '用户可见数据库名',
  schema_name VARCHAR(128) NOT NULL COMMENT '实际 MySQL schema 名称',
  status ENUM('active', 'deleted') NOT NULL DEFAULT 'active' COMMENT '数据库状态',
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
) COMMENT='用户数据库元数据表';

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
) COMMENT='Refresh Token 会话表';

ALTER TABLE users AUTO_INCREMENT = 10000;

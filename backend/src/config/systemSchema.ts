import pool from './db.js';

export const ensureSystemSchema = async (): Promise<void> => {
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
};

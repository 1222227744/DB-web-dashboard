-- db实验数据库创建
create database if not exists DB_App;

-- 使用刚刚创建的数据库
use DB_App;

-- App用户信息存储表
create table if not exists users(
    id int auto_increment primary key comment '用户内部唯一ID',
    user_name varchar(50) not null comment '用户名（仅供展示）',
    account_no varchar(10) not null unique comment '登录账号（10位随机数字，唯一）',
    password_hash varchar(255) not null comment 'Bcrypt加密后的密码哈希值',
    register_time timestamp default current_timestamp comment '账号注册时间'
);

-- 用户ID默认初始值（保持为五位数）
ALTER TABLE users auto_increment = 10000;
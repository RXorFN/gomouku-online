# 在线五子棋

一个基于 Node.js + Socket.IO 的在线五子棋对战游戏。

## 功能特性

- 用户注册与登录（JWT 认证）
- 天梯匹配系统
- 实时对战
- 战绩统计
- 聊天功能

## 技术栈

- 后端：Node.js + Express + Socket.IO
- 前端：原生 JavaScript + Canvas
- 数据库：SQL.js (SQLite)
- 认证：JWT

## 安装与运行

```bash
npm install
npm start
```

访问 http://localhost:3000

## 部署到云服务器

1. 安装 Node.js
2. 上传代码
3. `npm install`
4. `npm start`
5. 配置防火墙开放 3000 端口
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'gomoku.db');

async function listUsers() {
  const SQL = await initSqlJs();
  
  if (!fs.existsSync(dbPath)) {
    console.log('数据库文件不存在');
    return;
  }
  
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  
  const stmt = db.prepare('SELECT id, username, email, rating, wins, losses, draws, created_at FROM users');
  
  const users = [];
  while (stmt.step()) {
    users.push(stmt.getAsObject());
  }
  stmt.free();
  
  if (users.length === 0) {
    console.log('暂无注册用户');
  } else {
    console.log('=== 已注册用户 ===');
    console.log('总数:', users.length);
    console.log('');
    users.forEach(u => {
      const winRate = u.wins + u.losses + u.draws > 0 
        ? ((u.wins / (u.wins + u.losses + u.draws)) * 100).toFixed(1) 
        : '0.0';
      console.log(`ID: ${u.id}`);
      console.log(`用户名: ${u.username}`);
      console.log(`邮箱: ${u.email}`);
      console.log(`天梯分: ${u.rating}`);
      console.log(`战绩: ${u.wins}胜 ${u.losses}负 ${u.draws}平 (胜率: ${winRate}%)`);
      console.log(`注册时间: ${u.created_at}`);
      console.log('---');
    });
  }
}

listUsers();
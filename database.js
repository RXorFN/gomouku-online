const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'gomoku.db');

let db;
let initialized = false;

async function initDatabase() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        rating INTEGER DEFAULT 1500,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        avatar TEXT DEFAULT 'default.png',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      CREATE TABLE game_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        player_a_id INTEGER NOT NULL,
        player_b_id INTEGER NOT NULL,
        winner_id INTEGER,
        result TEXT NOT NULL,
        board_snapshot TEXT,
        duration INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    saveDatabase();
  }
  
  initialized = true;
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function query(sql, params = []) {
  if (!initialized) throw new Error('Database not initialized');
  
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  
  return results;
}

function run(sql, params = []) {
  if (!initialized) throw new Error('Database not initialized');
  
  db.run(sql, params);
  saveDatabase();
  
  const lastIdResult = query('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: lastIdResult[0]?.id || 0, changes: 1 };
}

function get(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

function all(sql, params = []) {
  return query(sql, params);
}

const User = {
  create: (username, password, email) => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    try {
      const result = run(
        'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
        [username, hashedPassword, email]
      );
      return { id: result.lastInsertRowid, username, email };
    } catch (err) {
      if (err.message.includes('UNIQUE constraint')) {
        throw new Error('用户名或邮箱已存在');
      }
      throw err;
    }
  },

  findByUsername: (username) => {
    return get('SELECT * FROM users WHERE username = ?', [username]);
  },

  findById: (id) => {
    return get('SELECT id, username, email, rating, wins, losses, draws, avatar, created_at FROM users WHERE id = ?', [id]);
  },

  verifyPassword: (user, password) => {
    return bcrypt.compareSync(password, user.password);
  },

  updateRating: (userId, ratingChange, isWin, isDraw = false) => {
    let winChange = 0, lossChange = 0, drawChange = 0;
    if (isDraw) {
      drawChange = 1;
    } else if (isWin) {
      winChange = 1;
    } else {
      lossChange = 1;
    }
    
    run(
      'UPDATE users SET rating = rating + ?, wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE id = ?',
      [ratingChange, winChange, lossChange, drawChange, userId]
    );
    return User.findById(userId);
  },

  getHistory: (userId, limit = 20) => {
    return all(
      `SELECT gr.*, ua.username as player_a_name, ub.username as player_b_name
       FROM game_records gr
       JOIN users ua ON gr.player_a_id = ua.id
       JOIN users ub ON gr.player_b_id = ub.id
       WHERE gr.player_a_id = ? OR gr.player_b_id = ?
       ORDER BY gr.created_at DESC
       LIMIT ?`,
      [userId, userId, limit]
    );
  }
};

const GameRecord = {
  create: (roomId, playerAId, playerBId, boardSnapshot) => {
    const result = run(
      'INSERT INTO game_records (room_id, player_a_id, player_b_id, board_snapshot) VALUES (?, ?, ?, ?)',
      [roomId, playerAId, playerBId, boardSnapshot]
    );
    return result.lastInsertRowid;
  },

  updateResult: (roomId, winnerId, result, duration) => {
    run(
      'UPDATE game_records SET winner_id = ?, result = ?, duration = ? WHERE room_id = ?',
      [winnerId, result, duration, roomId]
    );
  }
};

module.exports = { initDatabase, User, GameRecord };
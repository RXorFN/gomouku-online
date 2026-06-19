const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const { initDatabase, User, GameRecord } = require('./database');
const { authMiddleware, generateToken } = require('./auth');
const { MatchQueue, RoomManager, calculateRatingChange } = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const matchQueue = new MatchQueue();
const roomManager = new RoomManager();
const onlineUsers = new Map();

app.post('/api/register', (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
      return res.status(400).json({ error: '请填写完整信息' });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在3-20字符之间' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    const user = User.create(username, password, email);
    const token = generateToken(user);
    
    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }
    
    const user = User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    if (!User.verifyPassword(user, password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    const token = generateToken(user);
    
    res.json({ 
      success: true, 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        rating: user.rating,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        winRate: user.wins + user.losses + user.draws > 0 
          ? ((user.wins / (user.wins + user.losses + user.draws)) * 100).toFixed(1) 
          : '0.0'
      }
    });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/user', authMiddleware, (req, res) => {
  try {
    const user = User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      rating: user.rating,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      winRate: user.wins + user.losses + user.draws > 0 
        ? ((user.wins / (user.wins + user.losses + user.draws)) * 100).toFixed(1) 
        : '0.0',
      created_at: user.created_at
    });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/history', authMiddleware, (req, res) => {
  try {
    const history = User.getHistory(req.user.id);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/online', (req, res) => {
  res.json({ count: onlineUsers.size });
});

io.on('connection', (socket) => {
  console.log('客户端连接:', socket.id);
  
  let currentUser = null;

  socket.on('auth', (data) => {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(data.token, 'gomoku-secret-key-2024');
      currentUser = User.findById(decoded.id);
      
      if (currentUser) {
        onlineUsers.set(currentUser.id, socket);
        socket.userId = currentUser.id;
        socket.emit('auth_success', { 
          user: {
            id: currentUser.id,
            username: currentUser.username,
            rating: currentUser.rating
          }
        });
        console.log(`用户 ${currentUser.username} 已连接`);
        io.emit('online_update', { count: onlineUsers.size });
      }
    } catch (err) {
      socket.emit('auth_error', { error: '认证失败' });
    }
  });

  socket.on('match', () => {
    if (!currentUser) {
      socket.emit('error', { message: '请先登录' });
      return;
    }

    const existingRoom = roomManager.getPlayerRoom(currentUser.id);
    if (existingRoom) {
      socket.emit('error', { message: '你已经在游戏中' });
      return;
    }

    const inQueue = matchQueue.queue.find(p => p.id === currentUser.id);
    if (inQueue) {
      socket.emit('error', { message: '已经在匹配队列中' });
      return;
    }

    const playerEntry = matchQueue.addPlayer({
      id: currentUser.id,
      username: currentUser.username,
      rating: currentUser.rating
    });

    socket.emit('match_waiting', { 
      message: '匹配中...',
      waitTime: 0 
    });

    console.log(`用户 ${currentUser.username} 进入匹配队列`);

    const match = matchQueue.findMatch(playerEntry);
    if (match) {
      const [player1, player2] = match;
      const roomId = uuidv4();
      
      const room = roomManager.createRoom(roomId, player1, player2);
      GameRecord.create(roomId, player1.id, player2.id, room.board.getSnapshot());
      
      const socket1 = onlineUsers.get(player1.id);
      const socket2 = onlineUsers.get(player2.id);
      
      if (socket1) {
        socket1.join(roomId);
        socket1.emit('match_success', {
          roomId,
          player: 'A',
          opponent: { id: player2.id, username: player2.username, rating: player2.rating },
          currentTurn: 'A'
        });
      }
      
      if (socket2) {
        socket2.join(roomId);
        socket2.emit('match_success', {
          roomId,
          player: 'B',
          opponent: { id: player1.id, username: player1.username, rating: player1.rating },
          currentTurn: 'A'
        });
      }
      
      console.log(`房间 ${roomId} 创建成功: ${player1.username} vs ${player2.username}`);
    }
  });

  socket.on('cancel_match', () => {
    if (!currentUser) return;
    matchQueue.removePlayer(currentUser.id);
    socket.emit('match_cancelled');
    console.log(`用户 ${currentUser.username} 取消匹配`);
  });

  socket.on('move', (data) => {
    if (!currentUser) {
      socket.emit('error', { message: '请先登录' });
      return;
    }

    const { roomId, x, y } = data;
    const room = roomManager.getRoom(roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }

    const player = room.playerA.id === currentUser.id ? 'A' : (room.playerB.id === currentUser.id ? 'B' : null);
    
    if (!player) {
      socket.emit('error', { message: '你不是房间内的玩家' });
      return;
    }

    const result = room.makeMove(x, y, player);
    
    if (!result.success) {
      socket.emit('move_error', { error: result.error });
      return;
    }

    io.to(roomId).emit('move', {
      x, y, player,
      currentTurn: result.currentTurn,
      gameStatus: result.gameStatus,
      winner: result.winner
    });

    if (result.gameStatus === 'finished') {
      handleGameEnd(room, result.winner);
    }
  });

  socket.on('chat', (data) => {
    if (!currentUser) return;
    const { roomId, message } = data;
    io.to(roomId).emit('chat', {
      userId: currentUser.id,
      username: currentUser.username,
      message: message.substring(0, 200)
    });
  });

  socket.on('leave_room', (data) => {
    if (!currentUser) return;
    const { roomId } = data;
    const room = roomManager.getRoom(roomId);
    
    if (room && room.gameStatus === 'playing') {
      const leaver = room.playerA.id === currentUser.id ? 'A' : 'B';
      const winner = leaver === 'A' ? 'B' : 'A';
      
      room.gameStatus = 'abandoned';
      room.winner = winner;
      
      io.to(roomId).emit('game_abandoned', { winner });
      handleGameEnd(room, winner);
    }
    
    socket.leave(roomId);
  });

  socket.on('disconnect', () => {
    console.log('客户端断开:', socket.id);
    
    if (currentUser) {
      onlineUsers.delete(currentUser.id);
      matchQueue.removePlayer(currentUser.id);
      
      const room = roomManager.getPlayerRoom(currentUser.id);
      if (room && room.gameStatus === 'playing') {
        const leaver = room.playerA.id === currentUser.id ? 'A' : 'B';
        const winner = leaver === 'A' ? 'B' : 'A';
        
        room.gameStatus = 'abandoned';
        room.winner = winner;
        
        io.to(room.roomId).emit('game_abandoned', { winner });
        handleGameEnd(room, winner);
      }
      
      io.emit('online_update', { count: onlineUsers.size });
    }
  });
});

function handleGameEnd(room, winner) {
  try {
    const playerA = room.playerA;
    const playerB = room.playerB;
    let result, winnerId;
    
    if (winner === 'draw') {
      result = 'draw';
      winnerId = null;
      User.updateRating(playerA.id, 0, false, true);
      User.updateRating(playerB.id, 0, false, true);
    } else {
      const winPlayer = winner === 'A' ? playerA : playerB;
      const losePlayer = winner === 'A' ? playerB : playerA;
      
      const ratingChange = calculateRatingChange(winPlayer.rating, losePlayer.rating);
      User.updateRating(winPlayer.id, ratingChange, true);
      User.updateRating(losePlayer.id, -ratingChange, false);
      
      result = winner === 'A' ? 'A_win' : 'B_win';
      winnerId = winPlayer.id;
    }
    
    GameRecord.updateResult(room.roomId, winnerId, result, room.getDuration());
    
    setTimeout(() => {
      roomManager.deleteRoom(room.roomId);
    }, 5000);
    
    console.log(`房间 ${room.roomId} 游戏结束: ${result}`);
  } catch (err) {
    console.error('游戏结束处理错误:', err);
  }
}

async function startServer() {
  try {
    await initDatabase();
    console.log('数据库初始化完成');
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('启动失败:', err);
  }
}

startServer();
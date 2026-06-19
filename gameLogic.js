// 匹配队列类
class MatchQueue {
  constructor() {
    this.queue = [];
    this.matchTimeout = 30000; // 30秒超时
    this.initialRange = 100;   // 初始匹配分数差距
    this.maxRange = 500;       // 最大匹配分数差距
  }

  addPlayer(player) {
    const entry = {
      ...player,
      enteredAt: Date.now(),
      currentRange: this.initialRange
    };
    this.queue.push(entry);
    return entry;
  }

  removePlayer(userId) {
    this.queue = this.queue.filter(p => p.id !== userId);
  }

  findMatch(player) {
    const now = Date.now();
    const waitTime = now - player.enteredAt;
    
    if (waitTime > this.matchTimeout) {
      player.currentRange = this.maxRange;
    } else {
      player.currentRange = this.initialRange + Math.floor(waitTime / 5000) * 50;
    }

    for (let i = 0; i < this.queue.length; i++) {
      const candidate = this.queue[i];
      if (candidate.id !== player.id) {
        const ratingDiff = Math.abs(candidate.rating - player.rating);
        if (ratingDiff <= player.currentRange && ratingDiff <= candidate.currentRange) {
          this.queue = this.queue.filter(p => p.id !== player.id && p.id !== candidate.id);
          return [player, candidate];
        }
      }
    }
    return null;
  }

  getQueueSize() {
    return this.queue.length;
  }

  getWaitingPlayers() {
    return this.queue.map(p => ({ id: p.id, username: p.username, rating: p.rating, waitTime: Date.now() - p.enteredAt }));
  }
}

// 游戏板类
class GameBoard {
  constructor(size = 15) {
    this.size = size;
    this.board = Array(size).fill(null).map(() => Array(size).fill(null));
    this.history = [];
  }

  placeStone(x, y, player) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      return { success: false, error: '坐标超出范围' };
    }
    if (this.board[y][x] !== null) {
      return { success: false, error: '该位置已有棋子' };
    }
    
    this.board[y][x] = player;
    this.history.push({ x, y, player });
    return { success: true };
  }

  checkWin(x, y, player) {
    const directions = [
      { dx: 1, dy: 0 },  // 水平
      { dx: 0, dy: 1 },  // 垂直
      { dx: 1, dy: 1 },  // 左上到右下
      { dx: 1, dy: -1 }  // 右上到左下
    ];

    for (const { dx, dy } of directions) {
      let count = 1;
      
      // 正向检查
      for (let i = 1; i < 5; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size && this.board[ny][nx] === player) {
          count++;
        } else {
          break;
        }
      }
      
      // 反向检查
      for (let i = 1; i < 5; i++) {
        const nx = x - dx * i;
        const ny = y - dy * i;
        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size && this.board[ny][nx] === player) {
          count++;
        } else {
          break;
        }
      }
      
      if (count >= 5) {
        return true;
      }
    }
    return false;
  }

  isFull() {
    return this.board.every(row => row.every(cell => cell !== null));
  }

  getSnapshot() {
    return JSON.stringify(this.board);
  }

  restoreFromSnapshot(snapshot) {
    this.board = JSON.parse(snapshot);
  }
}

// 房间类
class GameRoom {
  constructor(roomId, playerA, playerB) {
    this.roomId = roomId;
    this.playerA = playerA;
    this.playerB = playerB;
    this.board = new GameBoard(15);
    this.currentTurn = 'A'; // A先手
    this.gameStatus = 'playing'; // playing, finished, abandoned
    this.winner = null;
    this.startTime = Date.now();
  }

  makeMove(x, y, player) {
    if (this.gameStatus !== 'playing') {
      return { success: false, error: '游戏已结束' };
    }

    const turn = player === 'A' ? 'A' : 'B';
    if (this.currentTurn !== turn) {
      return { success: false, error: '不是你的回合' };
    }

    const result = this.board.placeStone(x, y, player);
    if (!result.success) {
      return result;
    }

    const won = this.board.checkWin(x, y, player);
    if (won) {
      this.gameStatus = 'finished';
      this.winner = player;
      this.currentTurn = null;
    } else if (this.board.isFull()) {
      this.gameStatus = 'finished';
      this.winner = 'draw';
      this.currentTurn = null;
    } else {
      this.currentTurn = player === 'A' ? 'B' : 'A';
    }

    return {
      success: true,
      x, y, player,
      currentTurn: this.currentTurn,
      gameStatus: this.gameStatus,
      winner: this.winner
    };
  }

  getDuration() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getState() {
    return {
      roomId: this.roomId,
      board: this.board.board,
      currentTurn: this.currentTurn,
      gameStatus: this.gameStatus,
      winner: this.winner,
      playerA: this.playerA,
      playerB: this.playerB,
      duration: this.getDuration()
    };
  }
}

// 房间管理器
class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(roomId, playerA, playerB) {
    const room = new GameRoom(roomId, playerA, playerB);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  getPlayerRoom(userId) {
    for (const room of this.rooms.values()) {
      if (room.playerA.id === userId || room.playerB.id === userId) {
        return room;
      }
    }
    return null;
  }
}

// 计算等级分变化
const calculateRatingChange = (winnerRating, loserRating, isDraw = false) => {
  const K = 32; // 等级分变化系数
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  
  if (isDraw) {
    return Math.round(K * (0.5 - expectedWinner));
  }
  return Math.round(K * (1 - expectedWinner));
};

module.exports = { MatchQueue, GameBoard, GameRoom, RoomManager, calculateRatingChange };

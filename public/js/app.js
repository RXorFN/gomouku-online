// 在线五子棋客户端
class GomokuClient {
  constructor() {
    this.socket = io();
    this.currentUser = null;
    this.currentRoom = null;
    this.currentPlayer = null;
    this.board = [];
    this.boardSize = 15;
    this.isMyTurn = false;
    this.gameTimer = null;
    this.gameStartTime = null;
    
    this.initSocket();
    this.initUI();
    this.initBoard();
  }

  // 初始化Socket.IO事件
  initSocket() {
    this.socket.on('connect', () => {
      console.log('已连接到服务器');
    });

    this.socket.on('auth_success', (data) => {
      this.currentUser = data.user;
      this.showLobby();
      this.refreshUserInfo();
    });

    this.socket.on('auth_error', (data) => {
      this.showError('认证失败，请重新登录');
    });

    this.socket.on('match_waiting', (data) => {
      document.getElementById('match-btn').disabled = true;
      document.getElementById('match-status').classList.remove('hidden');
      document.getElementById('cancel-match-btn').classList.remove('hidden');
      this.updateMatchStatus(data.waitTime);
    });

    this.socket.on('match_cancelled', () => {
      this.resetMatchUI();
    });

    this.socket.on('match_success', (data) => {
      this.currentRoom = data.roomId;
      this.currentPlayer = data.player;
      this.showGame(data);
    });

    this.socket.on('error', (data) => {
      this.showError(data.message);
    });

    this.socket.on('move', (data) => {
      this.handleMove(data);
    });

    this.socket.on('move_error', (data) => {
      this.showError(data.error);
    });

    this.socket.on('game_abandoned', (data) => {
      this.showResult('对手离开', data.winner === this.currentPlayer ? 'win' : 'loss');
    });

    this.socket.on('chat', (data) => {
      this.addChatMessage(data);
    });

    this.socket.on('online_update', (data) => {
      document.getElementById('online-count').textContent = data.count;
    });
  }

  // 初始化UI事件
  initUI() {
    // Tab切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tab = btn.dataset.tab;
        document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
        document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
        document.getElementById('auth-error').textContent = '';
      });
    });

    // 登录表单
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          this.socket.emit('auth', { token: data.token });
        } else {
          this.showError(data.error);
        }
      } catch (err) {
        this.showError('登录失败');
      }
    });

    // 注册表单
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          this.socket.emit('auth', { token: data.token });
        } else {
          this.showError(data.error);
        }
      } catch (err) {
        this.showError('注册失败');
      }
    });

    // 匹配按钮
    document.getElementById('match-btn').addEventListener('click', () => {
      this.socket.emit('match');
    });

    // 取消匹配
    document.getElementById('cancel-match-btn').addEventListener('click', () => {
      this.socket.emit('cancel_match');
      this.resetMatchUI();
    });

    // 退出登录
    document.getElementById('logout-btn').addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.reload();
    });

    // 棋盘点击
    document.getElementById('game-board').addEventListener('click', (e) => {
      this.handleBoardClick(e);
    });

    // 聊天
    document.getElementById('chat-send').addEventListener('click', () => {
      this.sendChat();
    });
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });

    // 离开房间
    document.getElementById('leave-room-btn').addEventListener('click', () => {
      if (this.currentRoom) {
        this.socket.emit('leave_room', { roomId: this.currentRoom });
        this.showLobby();
      }
    });

    // 结果弹窗关闭
    document.getElementById('result-close').addEventListener('click', () => {
      document.getElementById('result-modal').classList.add('hidden');
      this.showLobby();
    });

    // 检查本地存储的token
    const token = localStorage.getItem('token');
    if (token) {
      this.socket.emit('auth', { token });
    } else {
      this.showAuth();
    }
  }

  // 初始化棋盘
  initBoard() {
    this.board = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
  }

  // 绘制棋盘
  drawBoard() {
    const canvas = document.getElementById('game-board');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / this.boardSize;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < this.boardSize; i++) {
      ctx.beginPath();
      ctx.moveTo(cellSize / 2, cellSize / 2 + i * cellSize);
      ctx.lineTo(canvas.width - cellSize / 2, cellSize / 2 + i * cellSize);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(cellSize / 2 + i * cellSize, cellSize / 2);
      ctx.lineTo(cellSize / 2 + i * cellSize, canvas.height - cellSize / 2);
      ctx.stroke();
    }
    
    // 绘制棋子
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        if (this.board[y][x]) {
          this.drawStone(x, y, this.board[y][x]);
        }
      }
    }
  }

  // 绘制棋子
  drawStone(x, y, player) {
    const canvas = document.getElementById('game-board');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / this.boardSize;
    const centerX = cellSize / 2 + x * cellSize;
    const centerY = cellSize / 2 + y * cellSize;
    const radius = cellSize * 0.4;
    
    // 棋子阴影
    ctx.beginPath();
    ctx.arc(centerX + 2, centerY + 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();
    
    // 棋子本体
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    
    if (player === 'A') {
      ctx.fillStyle = '#1a1a2e';
    } else {
      ctx.fillStyle = '#e94560';
    }
    ctx.fill();
    
    // 棋子高光
    ctx.beginPath();
    ctx.arc(centerX - radius * 0.2, centerY - radius * 0.2, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
  }

  // 处理棋盘点击
  handleBoardClick(e) {
    if (!this.isMyTurn || !this.currentRoom) return;
    
    const canvas = document.getElementById('game-board');
    const rect = canvas.getBoundingClientRect();
    const cellSize = canvas.width / this.boardSize;
    
    const x = Math.floor((e.clientX - rect.left) / cellSize);
    const y = Math.floor((e.clientY - rect.top) / cellSize);
    
    if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
      if (this.board[y][x] === null) {
        this.socket.emit('move', { roomId: this.currentRoom, x, y });
      }
    }
  }

  // 处理落子
  handleMove(data) {
    this.board[data.y][data.x] = data.player;
    this.drawBoard();
    
    this.updateTurnIndicator(data.currentTurn);
    
    if (data.gameStatus === 'finished') {
      this.stopTimer();
      let result, resultType;
      
      if (data.winner === 'draw') {
        result = '平局';
        resultType = 'draw';
      } else {
        result = data.winner === this.currentPlayer ? '你赢了!' : '你输了';
        resultType = data.winner === this.currentPlayer ? 'win' : 'loss';
      }
      
      this.showResult(result, resultType);
    } else {
      this.isMyTurn = data.currentTurn === this.currentPlayer;
    }
  }

  // 更新回合指示器
  updateTurnIndicator(currentTurn) {
    const playerAInfo = document.getElementById('player-a-info');
    const playerBInfo = document.getElementById('player-b-info');
    
    playerAInfo.classList.toggle('current-turn', currentTurn === 'A');
    playerBInfo.classList.toggle('current-turn', currentTurn === 'B');
    
    const statusEl = document.getElementById('game-status');
    if (currentTurn === this.currentPlayer) {
      statusEl.textContent = '你的回合';
      statusEl.style.color = '#4ecdc4';
    } else {
      statusEl.textContent = '对手回合';
      statusEl.style.color = '#e94560';
    }
  }

  // 显示认证页面
  showAuth() {
    document.getElementById('auth-page').classList.remove('hidden');
    document.getElementById('lobby-page').classList.add('hidden');
    document.getElementById('game-page').classList.add('hidden');
  }

  // 显示大厅
  showLobby() {
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('lobby-page').classList.remove('hidden');
    document.getElementById('game-page').classList.add('hidden');
    document.getElementById('result-modal').classList.add('hidden');
    
    this.resetMatchUI();
    this.refreshUserInfo();
    this.loadHistory();
  }

  // 显示游戏页面
  showGame(data) {
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('lobby-page').classList.add('hidden');
    document.getElementById('game-page').classList.remove('hidden');
    
    // 初始化棋盘
    this.initBoard();
    this.drawBoard();
    
    // 设置玩家信息
    document.getElementById('player-a-name').textContent = data.player === 'A' ? this.currentUser.username : data.opponent.username;
    document.getElementById('player-a-rating').textContent = data.player === 'A' ? this.currentUser.rating : data.opponent.rating;
    document.getElementById('player-b-name').textContent = data.player === 'B' ? this.currentUser.username : data.opponent.username;
    document.getElementById('player-b-rating').textContent = data.player === 'B' ? this.currentUser.rating : data.opponent.rating;
    
    // 清空聊天
    document.getElementById('chat-messages').innerHTML = '';
    
    // 设置游戏状态
    this.isMyTurn = this.currentPlayer === 'A';
    document.getElementById('game-status').textContent = this.isMyTurn ? '你的回合' : '等待对手...';
    
    console.log('进入游戏页面', data);
    
    // 开始计时器
    this.startTimer();
    
    // 更新回合指示器
    this.updateTurnIndicator('A');
  }

  // 刷新用户信息
  async refreshUserInfo() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const response = await fetch('/api/user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.id) {
        this.currentUser = data;
        document.getElementById('username-display').textContent = data.username;
        document.getElementById('rating-display').textContent = data.rating;
        document.getElementById('winrate-display').textContent = data.winRate + '%';
        document.getElementById('record-display').textContent = `${data.wins}胜${data.losses}负${data.draws}平`;
      }
    } catch (err) {
      console.error('获取用户信息失败');
    }
  }

  // 加载历史记录
  async loadHistory() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const response = await fetch('/api/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      const historyList = document.getElementById('history-list');
      
      if (data.history && data.history.length > 0) {
        historyList.innerHTML = data.history.map(record => {
          const isPlayerA = record.player_a_id === this.currentUser?.id;
          const opponent = isPlayerA ? record.player_b_name : record.player_a_name;
          const isWin = (record.winner_id === this.currentUser?.id);
          const isDraw = record.result === 'draw';
          
          let resultClass, resultText;
          if (isDraw) {
            resultClass = 'draw';
            resultText = '平局';
          } else if (isWin) {
            resultClass = 'win';
            resultText = '胜利';
          } else {
            resultClass = 'loss';
            resultText = '失败';
          }
          
          return `
            <div class="history-item">
              <div class="players">
                <span>vs ${opponent}</span>
                <span class="opponent">${new Date(record.created_at).toLocaleDateString()}</span>
              </div>
              <span class="result ${resultClass}">${resultText}</span>
            </div>
          `;
        }).join('');
      } else {
        historyList.innerHTML = '<p class="empty-hint">暂无对局记录</p>';
      }
    } catch (err) {
      console.error('获取历史记录失败');
    }
  }

  // 更新匹配状态
  updateMatchStatus(waitTime) {
    const status = document.getElementById('match-status');
    const seconds = Math.floor(waitTime / 1000);
    status.textContent = `匹配中... ${seconds}秒`;
  }

  // 重置匹配UI
  resetMatchUI() {
    document.getElementById('match-btn').disabled = false;
    document.getElementById('match-status').classList.add('hidden');
    document.getElementById('cancel-match-btn').classList.add('hidden');
  }

  // 发送聊天
  sendChat() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (message && this.currentRoom) {
      this.socket.emit('chat', { roomId: this.currentRoom, message });
      input.value = '';
    }
  }

  // 添加聊天消息
  addChatMessage(data) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<span class="sender">${data.username}:</span><span class="text">${data.message}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // 显示结果
  showResult(message, type) {
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    const msg = document.getElementById('result-message');
    
    title.textContent = message;
    msg.textContent = type === 'win' ? '恭喜你获得胜利!' : (type === 'loss' ? '下次再接再厉' : '棋逢对手');
    
    modal.classList.remove('hidden', 'win', 'loss', 'draw');
    modal.classList.add(type);
    
    this.currentRoom = null;
    this.stopTimer();
  }

  // 开始计时器
  startTimer() {
    this.gameStartTime = Date.now();
    this.gameTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const seconds = (elapsed % 60).toString().padStart(2, '0');
      document.getElementById('game-timer').textContent = `${minutes}:${seconds}`;
    }, 1000);
  }

  // 停止计时器
  stopTimer() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
  }

  // 显示错误
  showError(message) {
    document.getElementById('auth-error').textContent = message;
  }
}

// 启动应用
const app = new GomokuClient();

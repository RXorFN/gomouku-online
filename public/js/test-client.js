console.log('=== Gomoku Client Loaded ===');

const socket = io();
let currentUser = null;

socket.on('connect', () => {
  console.log('✓ Socket连接成功:', socket.id);
  const token = localStorage.getItem('token');
  if (token) {
    console.log('自动发送认证:', token.substring(0, 20));
    socket.emit('auth', { token });
  }
});

socket.on('auth_success', (data) => {
  console.log('✓ 认证成功:', data);
  currentUser = data.user;
  alert(`登录成功！欢迎 ${currentUser.username}`);
});

socket.on('auth_error', () => {
  console.error('✗ 认证失败');
});

socket.on('match_waiting', () => {
  console.log('✓ 进入匹配队列');
  document.getElementById('match-status').classList.remove('hidden');
});

socket.on('match_success', (data) => {
  console.log('✓ 匹配成功:', data);
  alert(`匹配成功！对手: ${data.opponent.username}`);
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  console.log('登录请求:', username);
  
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  console.log('登录响应:', data);
  
  if (data.success) {
    localStorage.setItem('token', data.token);
    socket.emit('auth', { token: data.token });
  } else {
    alert('登录失败: ' + data.error);
  }
});

document.getElementById('match-btn').addEventListener('click', () => {
  console.log('点击匹配按钮, 当前用户:', currentUser);
  if (!currentUser) {
    alert('请先登录');
    return;
  }
  socket.emit('match');
});

document.getElementById('cancel-match-btn').addEventListener('click', () => {
  socket.emit('cancel_match');
  document.getElementById('match-status').classList.add('hidden');
});
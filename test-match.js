const { MatchQueue } = require('./gameLogic');

const queue = new MatchQueue();

console.log('=== 测试匹配逻辑 ===');

// 模拟两个玩家
const player1 = queue.addPlayer({
  id: 1,
  username: '玩家1',
  rating: 1500
});

console.log('玩家1加入队列，当前队列长度:', queue.queue.length);

const player2 = queue.addPlayer({
  id: 2,
  username: '玩家2',
  rating: 1500
});

console.log('玩家2加入队列，当前队列长度:', queue.queue.length);

// 尝试匹配
console.log('\n尝试匹配玩家1...');
const match1 = queue.findMatch(player1);
console.log('匹配结果:', match1);
console.log('匹配后队列长度:', queue.queue.length);

if (!match1) {
  console.log('\n尝试匹配玩家2...');
  const match2 = queue.findMatch(player2);
  console.log('匹配结果:', match2);
  console.log('匹配后队列长度:', queue.queue.length);
}

console.log('\n=== 测试取消匹配 ===');
const player3 = queue.addPlayer({
  id: 3,
  username: '玩家3',
  rating: 1500
});
console.log('玩家3加入队列，当前队列长度:', queue.queue.length);

queue.removePlayer(3);
console.log('玩家3取消匹配，当前队列长度:', queue.queue.length);

// 再次添加玩家3测试
const player3Again = queue.addPlayer({
  id: 3,
  username: '玩家3',
  rating: 1500
});
console.log('玩家3再次加入，当前队列长度:', queue.queue.length);
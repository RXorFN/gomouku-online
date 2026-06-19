const jwt = require('jsonwebtoken');

const SECRET_KEY = 'gomoku-secret-key-2024';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权访问' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username },
    SECRET_KEY,
    { expiresIn: '7d' }
  );
};

module.exports = { authMiddleware, generateToken, SECRET_KEY };

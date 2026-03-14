const express = require('express');
const path = require('path');
const { existsSync } = require('fs');
const https = require('https');
const http = require('http');

const app = express();
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 3000;
const STATIC_DIR = '/Users/rancaizhu/lottery-preview';

// 启动后端
const backend = require('child_process').spawn('npm', ['start'], {
  cwd: '/Users/rancaizhu/lottery-system/backend',
  stdio: 'ignore'
});

// API 代理
app.use('/api', async (req, res) => {
  const url = `http://localhost:${BACKEND_PORT}${req.originalUrl}`;
  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        ...req.headers,
        host: 'localhost'
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 静态文件服务
app.use((req, res) => {
  let filePath = path.join(STATIC_DIR, req.path);
  if (!existsSync(filePath) || path.extname(filePath) === '') {
    filePath = path.join(STATIC_DIR, 'index.html');
  }
  if (existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Not found');
  }
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Lottery running on http://localhost:${PORT}`);
});

/**
 * 前端静态 + API 代理。不启动后端，避免端口占用。
 * 使用前请在 lottery-system/backend 单独启动后端（如 npm run start），默认端口 3000。
 */
const express = require('express');
const path = require('path');
const { existsSync } = require('fs');

const app = express();
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 3000;
const STATIC_DIR = path.join(__dirname);

// 不在此处启动后端，避免端口占用。后端请单独在 lottery-system/backend 启动（如 npm run start）。
// 前端仅做静态服务 + 将 /api 代理到已有后端。

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API 代理：转发到已有后端
app.use('/api', async (req, res) => {
  const url = `http://localhost:${BACKEND_PORT}${req.originalUrl}`;
  const headers = { ...req.headers, host: `localhost:${BACKEND_PORT}` };
  delete headers['content-length'];
  const opts = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    opts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (typeof req.body === 'object') headers['content-type'] = 'application/json';
  }
  try {
    const response = await fetch(url, opts);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).set('Content-Type', contentType).send(text);
    }
  } catch (e) {
    res.status(502).json({ error: 'Backend unreachable: ' + e.message });
  }
});

// 静态文件服务
app.use((req, res) => {
  let filePath = path.join(STATIC_DIR, req.path);
  if (!existsSync(filePath) || path.extname(filePath) === '') {
    filePath = path.join(STATIC_DIR, 'index.html');
  }
  if (existsSync(filePath)) {
    const ext = path.extname(filePath);
    if (ext === '.html' || ext === '') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    res.sendFile(filePath);
  } else {
    res.status(404).send('Not found');
  }
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Frontend: http://localhost:${PORT}  (API → http://localhost:${BACKEND_PORT})`);
});

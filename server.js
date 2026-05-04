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

// 安全响应头（纵深防御；nginx 也应配相同头）
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// API 代理：转发到已有后端
app.use('/api', async (req, res) => {
  const url = `http://localhost:${BACKEND_PORT}${req.originalUrl}`;
  const headers = { ...req.headers, host: `localhost:${BACKEND_PORT}` };
  delete headers['content-length'];
  delete headers['transfer-encoding'];
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
    // 不暴露内网拓扑（端口/IP/系统调用错误码）
    if (process.env.NODE_ENV !== 'production') console.warn('[proxy] backend error:', e.message);
    res.status(502).json({ error: 'Backend unreachable' });
  }
});

// 静态文件服务（含 path traversal 防御）
app.use((req, res) => {
  // 防 path traversal：req.path 可能含未规范化的 ..；path.resolve 后必须仍在 STATIC_DIR 内
  const candidate = path.resolve(STATIC_DIR, '.' + req.path);
  if (candidate !== STATIC_DIR && !candidate.startsWith(STATIC_DIR + path.sep)) {
    return res.status(403).send('Forbidden');
  }
  let filePath = candidate;
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
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 前端静态站（本目录）: http://localhost:${PORT}`);
  console.log(`   磁盘路径: ${STATIC_DIR}`);
  console.log(`   merchant.html: ${path.join(STATIC_DIR, 'merchant.html')}`);
  console.log(`🔗 /api 会代理到后端: http://localhost:${BACKEND_PORT}`);
  console.log('');
  console.log('⚠️  仅运行 lottery-system/backend 的 npm run start:dev 不会出现本页。');
  console.log('   后端默认只提供 API（3000）；8080 必须单独开本前端：');
  console.log('   cd ~/lottery-preview && npm start');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

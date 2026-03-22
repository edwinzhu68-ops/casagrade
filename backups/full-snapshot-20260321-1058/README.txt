彩票系统快照 20260321-1058

包含：
- lottery.db：后端 SQLite 数据库（同时已复制为 ../lottery.db.20260321-1058）
- lottery-preview.git.bundle：前端仓库 git bundle（git clone xxx.bundle）
- lottery-system.git.bundle：后端仓库 git bundle
- backend-src.tar.gz：backend 目录源码（排除 node_modules）
- lottery-preview-src.tar.gz：lottery-preview 目录源码（排除 node_modules）

恢复示例：
  git clone lottery-preview.git.bundle lottery-preview-restored
  git clone lottery-system.git.bundle lottery-system-restored

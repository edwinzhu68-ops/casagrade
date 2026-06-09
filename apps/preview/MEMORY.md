# MEMORY.md — 彩票系统完整文档

> ⚠️ **重要**：本文档是彩票系统的完整操作手册。未来的 AI 或新管理员应能完全接手，只需阅读此文件即可了解一切。

---

## 关于主人
- 巴拿马时区 (America/Panama, EST/EDT)
- 有两个 AI 协助：小舞（部署/维护）+ Claude（代码编写）
- 小舞 = 十万年柔骨兔化形，活泼傲娇，Emoji 🐰
- 主人称呼：主人

---

## 系统概述

这是一个巴拿马彩票系统（Billeté / Chance），面向本地老板和顾客。

**网址**: https://casagrade.com
- 前台（顾客）: https://casagrade.com/index.html
- 老板端: https://casagrade.com/merchant.html
- 结果页: https://casagrade.com/result.html
- 总后台: https://casagrade.com/dashboard.html

---

## 服务器

- **提供商**: DigitalOcean NYC
- **IP**: 138.197.47.220
- **SSH**: `ssh root@138.197.47.220`
- **SSH 密钥**: `~/.ssh/id_ed25519`
- **域名**: casagrade.com（Let's Encrypt SSL）
- **代码路径**: `/var/www/lottery-system/`
- **前端代码**: `/var/www/lottery-preview/`
- **数据库**: `/var/www/lottery-system/backend/lottery.db` (SQLite)
- **APK 下载目录**: `/var/www/lottery-system/download/`
- **PM2 服务**:
  - `lottery-api` (后端 NestJS，端口 3000)
  - `lottery-web` (前端静态文件，端口 8080)
- **Nginx**: 反向代理 443 → 8080(前端) / 3000(API)
- **日志**: `/root/.pm2/logs/`

---

## GitHub 仓库

| 仓库 | 地址 | 用途 |
|------|------|------|
| lottery-system | https://github.com/edwinzhu68-ops/lottery-system | 后端 NestJS |
| lottery-preview | https://github.com/edwinzhu68-ops/lottery-preview | 前端静态页 |
| lottery-customer-app | https://github.com/edwinzhu68-ops/lottery-customer-app | 顾客端 APP 源码 |
| lottery-merchant-app | https://github.com/edwinzhu68-ops/lottery-merchant-app | 老板端 APP 源码 |

本地路径:
- `~/lottery-system/` — 后端
- `~/lottery-preview/` — 前端
- `~/lottery-customer-app/` — 顾客 APP
- `~/lottery-merchant-app/` — 老板 APP

---

## GitHub Actions CI/CD

### lottery-system (后端)
推送 main → npm ci → npm run build → SSH 部署 → pm2 restart lottery-api

### lottery-preview (前端)
推送 main → SSH git pull → pm2 restart lottery-web

### lottery-customer-app (顾客 APP)
推送 main → npm ci → npx cap sync → ./gradlew assembleRelease → SCP 上传 APK

### lottery-merchant-app (老板 APP)
推送 main → npm ci → npx cap sync → ./gradlew assembleRelease → SCP 上传 APK

### Secrets（每个仓库都需要）
- `SERVER_HOST`: 138.197.47.220
- `SERVER_SSH_KEY`: ED25519 私钥（部署用）

**部署私钥**: 本地 `~/.ssh/deploy_key`，公钥在服务器 `~/.ssh/authorized_keys`

### 服务器部署脚本
- `/root/deploy-scripts/deploy.sh` — 含 build 检查 / 钉钉告警
- `/root/health-check.sh` — pm2 reload 而非 restart

---

## APP 下载

- 顾客端: https://casagrade.com/download/lottery-customer.apk
- 老板端: https://casagrade.com/download/lottery-merchant.apk

两个 APK 由 GitHub Actions 自动构建推送，存放在 `/var/www/lottery-system/download/`

**何时需要重打包 APK**:
- 修改了 Capacitor 插件（如新增蓝牙权限）
- 修改了 capacitor.config.ts
- 升级了 @capacitor/android 版本

---

## 数据库结构 (SQLite)

路径: `/var/www/lottery-system/backend/lottery.db`

主要表:
- `user` — 老板账号（登录信息）
- `shop` — 店铺
- `shop_binding` — 大庄/小庄绑定关系
- `card_code` — 充值卡密
- `draw` — 开奖期次（含开奖号 winning_numbers）
- `order` — 顾客订单

**⚠️ 不要手动修改数据库，除非明确知道后果**

---

## 后端模块说明

| 模块 | 文件 | 职责 |
|------|------|------|
| draw | draw.controller.ts | 开奖、结算、Firebase 拉取 |
| settlement | settlement.service.ts | Billete/Chance 赔付计算 |
| merchant | merchant.controller.ts | 老板注册/登录/店铺管理 |
| order | order.controller.ts | 顾客下单/确认/兑奖 |
| admin | admin.controller.ts | 总后台管理 |
| draw-day | draw-day.service.ts | 自动开奖定时任务 |
| order-cancel | order-cancel.service.ts | 超时未付款自动取消 |
| local-lottery | local-lottery.service.ts | 本地 TICA/NICA 彩票开奖（含店铺锁） |

---

## 前端文件说明

| 文件 | 角色 | 路径 |
|------|------|------|
| index.html | 顾客端 | lottery-preview |
| merchant.html | 老板端 | lottery-preview |
| result.html | 开奖结算页 | lottery-preview |
| dashboard.html | 总后台 | lottery-preview |

---

## 彩票规则

### Billete (4位数) 赔率
| 匹配方式 | 一等奖 | 二等奖 | 三等奖 |
|------|--------|--------|--------|
| 四位全中 | 2000 | 600 | 300 |
| 前三位 | 50 | 20 | 10 |
| 后三位 | 50 | 20 | 10 |
| 前两位 | 3 | 0 | 0 |
| 后两位 | 3 | 2 | 1 |
| 最后一位 | 1 | 0 | 0 |

### Chance (2位数) 赔率
- 后两位中：头奖 14元、二奖 3元、三奖 2元
- 三奖可叠加

### 开奖时间
- 巴拿马时间每周三、周日 15:00
- 开奖前5分钟停售

---

## 安全修复记录

1. ✅ **TOKEN_SECRET 环境变量** — 已配置到服务器 `.env`
2. ✅ **登录限流** — 同一 IP 连续失败10次锁定15分钟
3. ✅ **开奖结算加事务** — draw.controller.ts 和 settlement.service.ts 都加了事务
4. ✅ **删除订单加 Token 验证** — 需 Authorization header 验证身份
5. ✅ **TICA/NICA 开奖加店铺锁** — withShopLock 防止并发开奖冲突

---

## 日常维护

### 代码更新流程
```bash
# 后端
cd ~/lottery-system && git add . && git commit -m "描述" && git push origin main
# 自动部署，服务器上 pm2 restart lottery-api

# 前端
cd ~/lottery-preview && git add . && git commit -m "描述" && git push origin main
# 自动部署，服务器上 pm2 restart lottery-web
```

### 手动服务器部署（备用）
```bash
ssh root@138.197.47.220 "cd /var/www/lottery-system && git stash; git pull --rebase; cd backend && npm run build && pm2 restart lottery-api; git stash drop"
```

### 查看服务状态
```bash
ssh root@138.197.47.220 "pm2 list"
```

### 查看日志
```bash
pm2 logs lottery-api --err --lines 50 --nostream
```

---

## 注意事项

- **不要动数据库** — 只更新代码和重启服务
- **服务器 stash** — 服务器有本地修改时先 `git stash`，拉取后 `git stash drop`
- **TOKEN_SECRET** — 生产环境必须设置，已在服务器配置
- **Build 失败不重启** — deploy.sh 有检查，不会在 build 失败时重启
- **APK 下载** — nginx alias 已配置 MIME type 为 `application/vnd.android.package-archive`，直接下载不经过 API

---

## OpenClaw AI 助手（小舞）

- 运行在主人的 Mac mini 上
- 主要职责：部署、运维、服务器管理、环境配置
- 代码编写主要由另一个 AI (Claude via Codex/CLI) 负责
- **GitHub Actions**: `gh` CLI 已配置（edwinzhu68-ops 账号）
- **部署私钥**: `~/.ssh/deploy_key`
- **SSH 私钥**: `~/.ssh/id_ed25519`
- **时区**: America/Panama (EST/EDT)

---

## Lessons Learned

1. 分析漏洞要读完整代码，不能凭感觉
2. 验证码古加强制要结合业务场景
3. Claude 代码能力比小舞强，值得信任
4. 小舞负责维护和部署，Claude 负责写代码
5. 部署脚本必须有 build 成功检查，否则服务崩溃重启循环（教训：229次重启）
6. GitHub Actions runners 可能临时不稳定，判断方法：连 echo 都 6 秒失败
7. APK 下载要配置正确的 MIME type（application/vnd.android.package-archive），否则浏览器会把 APK 当文本打开

---
name: 系统完整业务文档
description: casagrade彩票系统的全部流程、实现逻辑、赔率规则、设计原因和技术坑，供任何新对话直接上手
type: project
---

# casagrade 彩票系统完整业务文档

## 架构概览

```
前端（无编译）                后端（NestJS）            数据库
├─ index.html   ──────────> OrdersController  ──────> TypeORM
├─ merchant.html ─────────> MerchantController
├─ dashboard.html ────────> DrawController / AdminController
├─ result.html  ──────────> SettlementService
└─ guide.html（纯说明页）
```

- 前端：HTML + Tailwind CDN + 原生JS，无打包步骤，UI西班牙语，注释中文
- 生产API：`https://api.casagrade.com`；本地：`localhost:3000`（server.js代理）

---

## 一、客户端流程（index.html）

1. 输入店号 → `GET /api/shop/:shopNumber`
2. 选游戏类型（Billete/Chance）+ 输入号码和数量
3. 下单 `POST /api/orders`
   - 后端重算金额防篡改（Billete $1/张，Chance $0.25/张）
   - 检查 pending 期、停售窗口（14:55~次日07:00 巴拿马时区）
   - 检查每号限额（若配置）、per-shop mutex 防超卖
   - 生成订单号（时间戳36进制+随机4位）和核销码（5位）
4. 支付页轮询 `GET /api/orders/:orderNumber` 直到 status=1
5. 支付完成 → 显示确认页 → 跳转 result.html

**CHANCE自动补0**：输入位数不足时，CHANCE补0到2位，BILLETE不补（弹键盘）

---

## 二、商户端流程（merchant.html）

1. 登录 `POST /api/merchant/login`（失败10次锁15分钟）
   - 返回 HMAC-SHA256 token，存 localStorage
   - 刷新页面自动检测 localStorage token，免重登
2. 收银台轮询（每2秒）显示本期销售数据
3. 确认收款 `POST /api/orders/:orderNumber/confirm`（验30分钟超时）
4. 显示订阅到期日（登录/刷新后自动显示）
5. 兑奖：搜索后4位 → 点击兑奖 `POST /api/orders/:orderNumber/redeem`
   - 原子操作：`WHERE redeemed_at IS NULL` 防并发重复兑奖

---

## 三、管理后台流程（dashboard.html）

### 开奖数据获取（两源对比）
- **Firebase** `GET /api/draw/fetch-firebase`：爬 loteria-panama.firebaseio.com
- **LNB官网** `GET /api/draw/fetch-lnb`：爬 lnb.gob.pa HTML，按日期分组取最新一期
- 两源同时显示，自动对比；不一致 → 红色警报 + alert弹窗；一致 → 绿色确认

### GORDITO检测逻辑
- 条件：头奖≥4位 + 二奖1~2位 + 三奖≥1位 → 判定为GORDITO
- GORDITO时：二三奖不参与Billete结算（只算后2位的Chance规则）

### 提交开奖 `POST /api/draw/manual`
- 找当前 pending 期 → 调用 `settleOrdersForDraw()` 全量结算
- 60秒内防重复开奖
- 取消所有 status=0 的未付款订单

### 其他管理操作
- `POST /api/draw/time`：手动设置开奖时间
- `POST /api/draw/rollback`：回滚开奖（有已兑奖订单则拒绝）
- `POST /api/admin/clear-settlement`：归档当期 → 结算页显示"等待开奖"

### 店铺管理
- 搜索框+分页（每页50条）
- 批量续期：包含大庄本身的shopId
- 总后台「+注册小庄」：无数量上限，传 adminOverride:true 绕过验证

---

## 四、结算页流程（result.html）

1. 显示最新 completed 且 archived_at IS NULL 的期次
2. 计算：销售额 / 支出（win_amount sum）/ 纯利润 / 佣金（10%）
3. 订单列表按订单号末4位升序排列（方便快速定位）
4. 兑奖筛选：输入末4位 → 仅显示 status=3 且 redeemed_at IS NULL
5. 历史20期 `GET /api/settlement/history`

---

## 五、核心业务规则

### 期次状态
```
pending → (开奖) → completed → (clear-settlement) → archived_at=NOW()
```
- pending：接受下单
- completed：已开奖，可查结算和兑奖
- archived：历史归档，结算页显示"等待开奖"

**Why分两步**：completed到archived之间给商户时间兑奖，不被新期冲掉

### 订单状态
```
0(待付) → 1(已付) → 2(未中奖) / 3(已中奖) → redeemed_at=NOW()
-1(已取消)
```

### Billete赔率（4位数，$1/张）

| 档位 | 头奖 | 二奖 | 三奖 |
|------|------|------|------|
| 4位全中 | $2000 | $600 | $300 |
| 前3位中 | $50 | $20 | $10 |
| 后3位中 | $50 | $20 | $10 |
| 前2位中 | $3 | $0 | $0 |
| 后2位中 | $3 | $2 | $1 |
| 最后1位 | $1 | $0 | $0 |

- 每个奖级只取最高档（不累加），三个奖级结果相加
- GORDITO时二三奖不参与Billete计算

### Chance赔率（2位数，$0.25/张）

| 匹配 | 赔率 |
|------|------|
| 头奖后2位 | $14/张 |
| 二奖后2位 | $3/张 |
| 三奖后2位 | $2/张 |

- **三奖可叠加**（同时中三奖 = 14+3+2 = $19/张）
- **必须是 quantity × rate**，绝不能写成 amount × multiplier

### win_amount显示规则（前端关键）
```javascript
function getOrderWinAmount(order) {
  if (order.win_amount > 0) return Number(order.win_amount);  // 优先
  if (Array.isArray(order.win_breakdown)) {
    return order.win_breakdown.reduce((s, i) => s + (i.win||0), 0);
  }
  return 0;
}
```
**永远不在前端重新计算中奖金额**

---

## 六、权限体系

- 商户token：`Authorization: Bearer xxx`（HMAC-SHA256，存localStorage）
- 管理员token：`X-Admin-Token: xxx`（环境变量 ADMIN_TOKEN）
- 例外：`POST /api/admin/clear-settlement` 不需要X-Admin-Token（登录即可）

---

## 七、关键技术坑

### 1. CHANCE赔率编译BUG（曾发生！）
旧代码把 CHANCE_RATE 编译成单个数字80，导致巨额赔付。
**现在必须是数组 [14, 3, 2]，计算公式 qty × rate**

### 2. TypeScript增量编译缓存
新增文件后 dist 不更新 → `rm tsconfig.tsbuildinfo && npm run build`

### 3. dist/目录已从git追踪移除
`git rm -r --cached dist/` 后不再追踪，部署流程：
```
Claude改代码 → git push → 服务器 git pull → npm run build → pm2 restart
前端只需 git pull（无需编译）
```

### 4. 巴拿马时区（UTC-5）
停售和开奖时间全部依赖 `Intl.DateTimeFormat` 转换，不能用服务器本地时间

### 5. 并发防超卖
Per-shop mutex（Promise链）：同一店铺的订单请求串行化
集群部署时需换成Redis分布式锁

### 6. 手动开奖防重复
60秒内已完成开奖则拒绝新请求

### 7. 前端DEBUG上线前关闭
`const DEBUG = false` 在 merchant.html 和 result.html 中

### 8. LNB爬取多期问题
lnb.gob.pa页面含多期数据，必须按日期分组取最新一期（西班牙语月份→数字映射）

### 9. 批量注册小庄上限
- 大庄管理中心（main-shop.html）：最多10个，超出提示联系WhatsApp 68040864
- 总后台（dashboard.html）：无上限，传 adminOverride:true

---

## 八、部署规范

```bash
# 后端修改（必须重新编译）
git add && git commit && git push
# 服务器上：
git pull && rm -f tsconfig.tsbuildinfo && npm run build && pm2 restart all

# 前端修改（无需编译）
git add && git commit && git push
# 服务器上：
git pull
```

**Why:** backend/dist 不在git中，每次服务器需自行编译；前端是静态HTML直接serve

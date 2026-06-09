# CLAUDE.md - 彩票系统前端 (lottery-preview)

## 沟通语言
- 所有回复必须用中文

## 启动命令
```bash
npm install
npm start                        # 前端 port 8080
PORT=9000 npm start              # 自定义前端端口
BACKEND_PORT=4000 npm start      # 指向其他后端端口
```
后端(lottery-system)需要先启动, 默认 port 3000。

---

## 项目架构

前端纯HTML/JS/CSS项目, 无构建步骤。`server.js`(Express)做静态文件服务+API代理。

### 页面与角色

| 文件 | 角色 | 功能 | 行数 |
|------|------|------|------|
| `index.html` | 客户 | 输入店号→选Billete/Chance→下单→QR支付→轮询→确认/结果 | ~3800 |
| `merchant.html` | 店主 | 登录→收银台(销售统计/待处理订单)→确认支付→兑奖→跳转结算 | ~6200 |
| `dashboard.html` | 管理员 | 拉取Firebase开奖→手动发送开奖→分配店号→清除结算 | ~2300 |
| `result.html` | 店主 | 结算视图: 销售/赔付/利润, 订单列表(按后4位排序), 近20期历史 | ~2900 |
| `main-shop.html` | 大店主 | 子店管理, 合并佣金, 号码汇总 | - |
| `guide.html` | 公共 | 使用指南, 定价, 下载链接 | - |

---

## 功能模块详解 & 依赖地图

### 1. 客户下单流程 (index.html)

**页面状态流:**
```
#page-home (输入店号)
  → #page-shop (选号+下注)
    → #page-pay (QR码+轮询支付状态, 每2秒)
      → #page-confirmed (支付确认/等待开奖/中奖/未中)
```

**调用的API:**
- `GET /api/shop/{shopNumber}` — 验证店铺+获取TICA/NICA状态
- `GET /api/bet-status?shopId={shopId}` — 获取当前期和停售状态
- `POST /api/orders` — 创建订单(shopId, numbers, amount, gameType, lotteryKind)
- `GET /api/orders/{orderNumber}` — 轮询订单状态
- `GET /api/draw/latest` — 获取最新开奖结果

**关键函数:**
- `submitBet()` — 提交下注, 含幂等键
- `pollPendingOrdersStatus()` — 每2秒轮询待付款订单
- `setGameType(type)` — 切换Billete($1)/Chance($0.25)
- `setClientLotteryMode()` — 切换NACIONAL/TICA/NICA
- `getOrderWinAmount(order)` — 安全读取中奖金额(**永远不在前端重算**)

**⚠️ 修改影响:**
- 修改submitBet → 影响订单创建, 需与后端POST /api/orders格式一致
- 修改轮询逻辑 → 影响支付确认体验
- 修改gameType切换 → 影响票价($1 vs $0.25), 号码位数校验(4位 vs 2位)
- 修改lotteryKind → 影响TICA/NICA tab显示和API参数

---

### 2. 商家收银台 (merchant.html)

**页面状态流:**
```
#page-login (登录)
  → #page-cashier (收银台主界面)
    → QR扫码确认支付
    → 代客下单模态框
    → 跳转result.html (开奖结算)
    → 设置面板(打印机/订阅/限额/赔率)
```

**调用的API:**
- `POST /api/merchant/login` — 登录(account或shop_number, password)
- `POST /api/merchant/register` — 注册
- `GET /api/draw/pending` — 当前期状态
- `GET /api/bet-status?shopId={shopId}` — 销售统计
- `GET /api/shop/orders?shopId=...&status=...` — 订单列表
- `POST /api/orders/{orderNumber}/confirm` — 确认支付
- `POST /api/orders/{orderNumber}/redeem` — 兑奖
- `POST /api/orders` — 代客下单
- `PATCH /api/shop/{shopId}/limits` — 设置限额
- `PATCH /api/shop/{shopId}/rates` — 设置赔率
- `POST /api/local-lottery/settle` — TICA/NICA开奖结算
- `PATCH /api/local-lottery/accepting` — 切换TICA/NICA接单
- `POST /api/merchant/activate-card` — 激活订阅卡
- `POST /api/merchant/change-password` — 修改密码

**关键函数:**
- `login(forceLogin)` — 登录+token存储
- `loadDashboard()` — 加载销售数据
- `cashierPostOrdersAndConfirm()` — 代客下单+立即确认
- `startQrScan()` — QR扫码确认
- `confirmRedeem()` — 兑奖确认
- `openSettlement()` — 跳转result.html
- `connectPrinter()` — 蓝牙打印机连接
- `fillCashierEticket()` — 生成电子票据(html2canvas)

**⚠️ 修改影响:**
- 修改登录逻辑 → 影响token存储, 所有后续API认证
- 修改代客下单 → 影响订单创建+立即确认流程
- 修改兑奖逻辑 → 影响redeemed_at原子操作
- 修改打印功能 → 仅影响蓝牙打印, 不影响核心业务
- 修改TICA/NICA设置 → 影响index.html客户端展示

---

### 3. 管理后台 (dashboard.html)

**调用的API:**
- `POST /api/merchant/login` — 管理员登录(复用商家登录)
- `GET /api/draw/fetch-firebase` — 拉取Firebase开奖数据
- `POST /api/draw/manual` — 手动发送开奖结果(primer/segundo/tercero)
- `POST /api/draw/rollback` — 回滚上次开奖
- `POST /api/draw/reset-pending` — 重置损坏的期
- `POST /api/admin/clear-settlement` — 归档已开奖期
- `GET /api/admin/shops` — 列出所有商店
- `POST /api/merchant/register` — 创建商家账号(adminOverride)
- `POST /api/admin/reset-password` — 重置商家密码

**GORDITO检测:**
- 条件: 一等奖≥4位 AND 二等奖1-2位 AND 三等奖≥1位
- 效果: 二/三等奖不参与Billete计算(只算Chance末2位)

**⚠️ 修改影响:**
- 修改手动开奖发送 → 影响winning_numbers格式, 后端结算触发
- 修改clear-settlement → 影响期的归档和新期创建
- 修改Firebase拉取 → 仅影响自动开奖, 手动开奖不受影响

---

### 4. 结算视图 (result.html)

**调用的API:**
- `GET /api/settlement/history` — 历史结算数据(近20期)
- `GET /api/draw/latest` — 当前已开奖结果
- `GET /api/shop/orders?shopId=...` — 订单列表
- `POST /api/orders/{orderNumber}/redeem` — 兑奖
- `PATCH /api/shop/{shopId}/rates` — 修改赔率

**关键逻辑:**
- `getOrderWinAmount(order)` — 安全取win_amount (有值用win_amount, 否则sum win_breakdown)
- 订单按后4位排序(0000-9999)
- 支持按后4位过滤查找中奖订单
- TICA/NICA期独立展示

**⚠️ 修改影响:**
- 修改中奖展示 → 必须用getOrderWinAmount(), 永远不在前端重算
- 修改订单排序 → 仅影响展示, 不影响数据
- 修改赔率面板 → 影响后端结算金额(下一期生效)

---

### 5. 大店管理 (main-shop.html)

**调用的API:**
- `GET /api/shop-bindings?mainShopId=...` — 获取子店列表
- `GET /api/shop/orders?shopId=...` — 各子店订单
- 佣金计算: 基于binding的commission_rate

**⚠️ 修改影响:**
- 修改佣金计算 → 影响大店利润展示
- 修改ShopBinding相关 → 影响子店绑定/解绑

---

## 跨页面影响矩阵 ⭐⭐⭐

| 如果你修改了... | 会影响到... |
|----------------|-------------|
| **POST /api/orders 请求格式** | index.html submitBet(), merchant.html 代客下单 |
| **订单status值** | index.html 状态展示, merchant.html 订单列表, result.html 结算统计 |
| **win_amount/win_breakdown** | result.html 中奖展示, merchant.html 兑奖金额 |
| **shop API响应格式** | index.html 店铺展示, merchant.html 配置面板 |
| **draw API响应格式** | index.html 开奖结果, dashboard.html 开奖管理, result.html 结算 |
| **Token认证格式** | merchant.html 登录, 所有需要Bearer的API调用 |
| **TICA/NICA接口** | index.html tab展示, merchant.html 设置, result.html 本地彩票结算 |
| **赔率字段名** | merchant.html 赔率设置面板, result.html 赔率展示, 后端结算 |
| **限额字段** | merchant.html 限额设置, 后端订单创建校验 |
| **QR码内容格式** | index.html 生成QR, merchant.html 扫码确认 |
| **verification_code** | index.html 展示, merchant.html 核销输入 |
| **LocalStorage键名** | 对应页面的状态恢复(token/语言/模式) |

---

## 前端-后端联动地图

| 前端功能 | 后端模块 | 关键接口 |
|----------|----------|----------|
| 客户下单 | OrderModule | POST /api/orders |
| 客户取消 | OrderCancelController | POST /api/orders-cancel |
| 支付确认 | OrderController | POST /api/orders/:id/confirm |
| 兑奖 | OrderController | POST /api/orders/:id/redeem |
| 商家登录 | MerchantModule | POST /merchant/login |
| 商家注册 | MerchantModule | POST /merchant/register |
| 开奖发送 | DrawModule | POST /api/draw/complete |
| 结算查询 | SettlementModule | GET /api/settlement/history |
| TICA/NICA | LocalLotteryModule | POST /api/local-lottery/* |
| 店铺管理 | AdminModule | GET/PATCH /api/admin/shops/* |
| 限额设置 | ShopController | PATCH /api/shop/:id/limits |
| 赔率设置 | ShopController | PATCH /api/shop/:id/rates |

---

## 移动端App (WebView包装)

| App | 远程加载页面 | 原生插件 |
|-----|-------------|----------|
| lottery-customer-app | https://casagrade.com/index.html | 无 |
| lottery-merchant-app | https://casagrade.com/merchant.html | 蓝牙打印, QR扫码, App生命周期 |

**修改前端页面直接影响两个移动端App**, 无需重新发布APK。

---

## API Base URL逻辑
- 优先: `localStorage.lottery_api_base`
- localhost/file协议: → `http://localhost:3000`
- 其他: → `https://api.casagrade.com`
- 生产环境不经过server.js, 页面直接调后端API

## Auth
- 商家/管理员: `POST /api/merchant/login` 获取token
- Admin操作: `X-Admin-Token` header (匹配ADMIN_TOKEN环境变量)
- 例外: `POST /api/admin/clear-settlement` 和健康检查不需要Admin Token

## 已知陷阱
- **两条结算路径**: DrawController.settleOrdersForDraw(手动开奖触发)写per-order win_amount; SettlementService处理期级聚合。两者Chance计算必须用 `quantity × rate`。
- **Chance赔率编译bug**: 曾把rate编译成80而非[14,3,2], 导致巨额超付。后端改结算逻辑后必须rebuild dist并验证。
- **`POST /api/admin/clear-settlement`** 注册在draw.controller.ts的AdminController下 — 如果报`Cannot POST`, 检查路由注册重复/缺失。
- **DEBUG = false**: merchant/result页面上线前必须设为false。
- **getOrderWinAmount()**: 永远不在前端重算中奖金额, 只读API返回的win_amount。

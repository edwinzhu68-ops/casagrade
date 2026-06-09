# 审查必修清单（已逐条核实为真 bug）

审查日期：2026-04-19
审查人：Claude + 9 个并行 agent 扫，然后逐条拉代码核实
剔除所有 agent 拍脑袋的误判。未核实的不在此清单。

---

## 🚨 P0 — SaaS 命门（订阅 / 租户 / 安全底线）

### 生产环境变量实锤

**实测 `/proc/<pm2 pid>/environ`**：
- ❌ `ADMIN_TOKEN` 未设
- ❌ `TOKEN_SECRET` 未设
- ✅ `NODE_ENV` 已设

### 1. AdminTokenGuard 完全失效（4 连 bug）

文件：`backend/src/guards/admin-token.guard.ts`

```ts
canActivate(context) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || adminToken === '') {
    return true;   // ← 未设直接放行
  }
  const req = context.switchToHttp().getRequest<Request>();
  if (req.path && (req.path.includes('admin/health') || req.path.includes('admin/clear-settlement'))) {
    return true;   // ← includes() 匹配，任何含这俩子串的路径都放行
  }
  const token = req.headers['x-admin-token'];
  if (token !== adminToken) {   // ← 字符串 !== 比较（时序攻击）
    throw new UnauthorizedException('需要管理员密钥');
  }
  return true;
}
```

**现状后果**：
- 生产 ADMIN_TOKEN 未设 → 整个 Guard 直接 return true → 所有 admin 接口**裸奔**
- 任何人可 `POST /api/admin/generate-cards` 免费造卡密
- 任何人可 `POST /api/admin/reset-password` 重置任何店密码
- 任何人可 `POST /api/draw/rollback` 回滚开奖

**修复**：
1. 启动时强制校验 `process.env.ADMIN_TOKEN`，缺失抛错不启动
2. 路径匹配改为精确数组：`['/api/admin/health', '/api/admin/clear-settlement'].includes(req.path)`
3. 用 `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminToken))`

---

### 2. TOKEN_SECRET 硬编码默认

文件：`backend/src/modules/order/order.controller.ts:26`、`modules/merchant/merchant.controller.ts:39`

```ts
const TOKEN_SECRET = () => process.env.TOKEN_SECRET || 'lottery-token-secret-change-in-prod';
```

**现状**：生产 TOKEN_SECRET 未设 → 所有 HMAC 签名用硬编码默认 → 任何人可用同一秘钥伪造任意 userId 的 token → 冒充任意老板登录、下单、修改设置、兑奖

**修复**：
1. 启动时强制校验 `process.env.TOKEN_SECRET`，缺失抛错不启动
2. **部署前还要手动作废所有现存 token**（因为已经用默认 secret 签发过）——可以通过改 secret 自动生效（旧 token 都验不过）

---

### 3. clear-settlement 无任何鉴权

文件：`backend/src/modules/draw/draw.controller.ts:932`

```ts
@Post('clear-settlement')
async clearSettlement() {
  // 没 @UseGuards、没 @Req()、没 token 校验
  ...
}
```

AdminController 虽然 `@UseGuards(AdminTokenGuard)`，但 Guard 里主动放行了这个路径（见 #1）。注释说"登录即可，不需管理员密钥"——但**代码根本没检查登录**。

**现状后果**：任何外网请求（不登录）可调用 → 归档当前期（影响对账、结算页丢数据）

**修复**：
- 要么加 merchant token 校验（走 `parseSignedToken` 流程）
- 要么改回 admin token 校验（最简单）

---

### 4. 多个 binding 查询接口不校验 owner_id

文件：`backend/src/modules/merchant/merchant.controller.ts`

**无校验的接口**：
- `GET /merchant/binding/incoming?mainShopId=` (L777)
- `GET /merchant/binding/sub-shops?mainShopId=` (L1055)
- `GET /merchant/binding/sub-shop-data?mainShopId=` (L1086)
- `GET /merchant/binding/history?mainShopId=` (L1278)
- `GET /merchant/binding/my-binding?shopId=` (L930)
- `GET /merchant/binding/pending?shopId=` (L703)

**写接口有校验（做得对）**：
- `POST /merchant/binding/request` (L641) ✅
- `POST /merchant/binding/batch-create-subs` (L960) ✅

**等同问题：`POST /api/orders/:orderNumber/confirm` 也只验 token 有效不验店归属**
- 文件：`order.controller.ts:584-627`
- token 通过后没校验 `tokenUserId` 是 `order.shop_id` 的 owner
- 商家 A 拿到 B 的订单号可替 B 点"确认收款"，把未付款订单强标 paid
- 不转移金钱，但是跨店干扰/骚扰
- 修复：按订单的 shop_id 查 shop.owner_id 和 tokenUserId 比对

**现状后果**：只要传 `mainShopId=X`，任何人可看到 X 这个大店的：
- 子店列表 + 店号 + 店名
- 各期销售额、赔付、佣金、利润
- 历史汇总
- 收到的邀请

竞争对手可以系统性抄数据。**老板知道了会立刻跑路**。

**修复**（同一套模式，套所有查询接口）：
```ts
async subShopData(
  @Query('mainShopId') mainShopId: string,
  @Req() req: any,   // ← 加
) {
  ...
  const tokenInfo = parseSignedToken((req.headers?.authorization || '').replace(/^\s*bearer\s+/i, '').trim());
  if (!tokenInfo) throw new UnauthorizedException('请先登录');
  const mainShop = await shopRepo.findOne({ where: { shop_id: Number(mainShopId) } });
  if (!mainShop || mainShop.owner_id !== tokenInfo.userId) {
    throw new UnauthorizedException('无权查看该店铺数据');
  }
  ...
}
```

---

### 5. 前端 `lottery_api_base` 可被劫持 API

文件：`index.html:572-574`、`merchant.html:923`

```js
var saved = localStorage.getItem('lottery_api_base');
if (saved !== null && saved !== '') return normalizeBase(saved);
```

**无白名单校验**。浏览器插件、XSS、或老板被社工骗"打开控制台输入这行代码" → 所有 API 打到攻击者服务器 → token + 订单数据泄露 + 中间人改中奖金额。

**修复**：
```js
function isAllowedApiBase(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const allowed = ['api.casagrade.com', 'localhost', '127.0.0.1'];
    return allowed.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
var saved = localStorage.getItem('lottery_api_base');
if (saved && isAllowedApiBase(saved)) return normalizeBase(saved);
```

index.html / merchant.html / result.html / dashboard.html / main-shop.html 五个页面都要改。

---

### 额外 P0：`POST /merchant/forgot-password` 匿名即可触发强制改密

文件：`backend/src/modules/merchant/merchant.controller.ts:261-314`

**现状**：
- 无 IP 限流、无验证码、无 "点邮件链接确认" 流程
- 任何人 POST `{ email: "victim@..." }` → **立即服务端生成新密码 → 保存 → 发邮件**
- 只要知道老板邮箱（名片、WhatsApp、朋友圈）就能：
  - 连续调该接口，老板账户被无限次强制改密码
  - 每次老板必须去邮箱找新密码才能登录 → **收银台持续瘫痪**
  - 若老板邮箱被入侵（弱密码/撞库）→ 攻击者可直接接管老板账户
- 附带问题：`throw NotFoundException('该邮箱未绑定任何账号')` 泄露邮箱是否存在（user enumeration）

**修复**：改为"两步重置"标准流程：
1. 第一步：只发送带 reset token（30 分钟过期）的邮件，**不改密码**
2. 第二步：用户点击邮件里的链接 + 提交 token + 新密码
3. 加 IP 限流（每小时 3 次）+ 邮箱限流（每邮箱 24 小时 3 次）
4. 统一错误消息不区分邮箱存在/不存在

### 额外 P0：`DELETE /api/admin/accounts/:id` 只删店铺，不删关联订单/抽签

文件：`backend/src/modules/admin/admin.controller.ts:198-213`

**现状**：只 `shopRepo.delete(shop.shop_id)`，Order / Draw / Settlement 全留在库里。Shop 表重用 shop_id 分配给新账号时，历史订单变成新店的数据。

**修复**：按顺序删 Order → Draw → ShopBinding → Shop。或加 CASCADE。

### 额外 P1：batch-create-subs 默认密码弱

文件：`backend/src/modules/merchant/merchant.controller.ts:1010-1015` 附近

**现状**：
- `customPwd` 传空串 / 短串不拒绝
- 默认生成 `shopNumber + 2 随机小写字母`（如 `10001kx`，7 位，无大写无数字）
- 违反注册流程自己的密码规则

**修复**：强制 6+ 位、含大小写 + 数字。

### 额外 P1：`binding/history` TICA/NICA 漏 `lottery_type` 过滤

文件：`backend/src/modules/merchant/merchant.controller.ts:1365-1412`

**现状**：TICA/NICA 分支 WHERE 含 shop_id + status + archived_at，**没加 lottery_type = localKind**。大店在 TICA 汇总页可能看到 NACIONAL 期的数据。

**修复**：TICA/NICA 分支 where 加 `lottery_type: localKind`。

### 额外 P1：`binding/sub-shop-data` TICA/NICA 合计可能漏子店数据

文件：`backend/src/modules/merchant/merchant.controller.ts:1196-1215`

**现状**：`periodDrawBySub` 对创建 pending 失败的子店没有 set（catch 分支），后续 `.get(shop_id) === o.draw_id` 比较时，该子店订单全部被过滤掉，主店看到的 `summary.total_sales` 漏算。

**修复**：失败分支显式 set `null` 并在汇总时标记"无数据"而非静默丢。

### 额外 P1：前端 `index.html` 轮询不处理 401

文件：`index.html:1088` (pollPendingOrdersStatus) 和 `index.html:2715-2724` (startStatusPolling)

**现状**：`if (!res.ok) continue;` 把 401 和 500 全吞了，token 失效时前端不停轮询，也不提示用户。

**修复**：
- 401 → 停止轮询 + toast "登录失效，请重新进入"
- 网络错误 → 指数退避，达上限停止

### 额外 P1：前端切换彩种不清空 betList

文件：`index.html:1992` (setClientLotteryMode)

**现状**：用户在 NACIONAL 模式加了 4 位号码进 betList，切到 TICA（2 位玩法），betList 里 4 位号码还在。点下注后端收到格式不符的号码（虽然会被拒绝，但用户体验很差）。

**修复**：`setClientLotteryMode` 里当模式真变化时 `betList = []; currentNumber = ''; currentQuantity = '';`。

### 额外 P2：logout 不清 `User.session_token`

文件：`backend/src/modules/merchant/merchant.controller.ts:435` 附近

logout 只删 Session 表记录，User 表的 `session_token` 字段不清。如果 `verifySession` 走 fallback 到 User.session_token 会认成有效。

**修复**：logout 同时 `User.session_token = null`。

---

## 🔴 P1 — 产品质量（可导致真实错账 / UI 故障）

### 6. ensureShopPendingDraw 无锁

文件：`backend/src/modules/local-lottery/local-lottery.service.ts:49-78`

```ts
async ensureShopPendingDraw(shopId, kind, skipFeatureCheck=false) {
  ...
  let d = await findShopPendingLocalDraw(drawRepo, shopId, kind);
  if (d) return d;
  // ↓ 并发两个请求都到这里（都没找到 pending）
  const periodNo = await getNextPeriodNoForScope(...);
  d = drawRepo.create({ ... status: 'pending' ... });
  await drawRepo.save(d);  // ← 两个都 save → 同 shop 同 kind 两个 pending 期
  return d;
}
```

**现状后果**：并发下单时创建重复 pending 期，订单分散到两期，结算和展示全乱。

**修复**：用 `withShopLock` 包装整个逻辑，或给 Draw 加 UNIQUE(shop_id, lottery_type, status='pending')（SQLite 部分索引）。

---

### 7. draw.status 大小写混乱

- `settlement.service.ts:120` NACIONAL 结算写 `status='COMPLETED'`
- `settlement.service.ts:188` TICA/NICA 结算写 `status='completed'`
- `draw.controller.ts:940` clear-settlement 查询两者都兼容 `IN ('COMPLETED', 'completed')`
- `utils/draw-queries.ts:19,35` 查询也兼容两者
- 其他未兼容的查询点可能出 bug

**修复**：统一改为小写 `'completed'`；数据库现存大写数据用 migration 统一：
```sql
UPDATE draws SET status = LOWER(status) WHERE status IN ('COMPLETED', 'PENDING', 'CANCELED');
```

---

### 8. rollback 无"已归档拒绝"保护

文件：`backend/src/modules/draw/draw.controller.ts:865-916`

现状：`rollbackDraw` 只检查 `redeemed_at IS NOT NULL`，**不检查是否已归档**。归档期可被回滚 → 历史数据被篡改。

**修复**：在 redeemed 检查之后加：
```ts
if (completed.archived_at != null) {
  return { success: false, error: '已归档期不可回滚' };
}
```

---

### 9. 手动开奖后创建下一期漏过滤

文件：`backend/src/modules/draw/draw.controller.ts:722-726`

检查"是否已有下一期 pending"时，**漏了** `lottery_type=NACIONAL AND shop_id IS NULL` 条件。如果某店正好有 TICA/NICA pending，会误判为"已有全国下一期"，下一期全国不创建。

**修复**：加条件：
```ts
.andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
.andWhere('d.shop_id IS NULL')
```

---

## 🟡 P2 — 体验修复

### 10. 蓝牙打印超时 `cashierOrderBusy` 不重置

文件：`merchant.html:4377-4392`

超时后 catch 只显示 toast，没重置 `cashierOrderBusy=false`，老板必须刷新页面才能继续下单。

### 11. QR 扫码 `scanStreamRef` 未置空

文件：`merchant.html:2900-2913`

关流后不清空引用，连续扫码导致摄像头资源泄漏。

### 12. shop-order-lock 内存泄漏

文件：`backend/src/utils/shop-order-lock.ts`

```ts
shopOrderLocks.set(shopId, next.catch(() => {}));
```

Map 永不删除 key，每个活跃店各占一条。规模大时内存慢涨。异常路径下前一个 Promise 卡住，该店所有后续订单串行等死。

**修复**：`next.finally(() => { if (shopOrderLocks.get(shopId) === next.catch(...)) shopOrderLocks.delete(shopId); })`，或用带超时包装。

### 13. Nodemailer 升级

`nodemailer@8.0.2` 有 SMTP CRLF 注入 CVE。升到 8.1.0+。

---

## ❌ 已确认误判（Agent 拍脑袋的，不要修）

- Redeem 无事务：原子 `UPDATE...WHERE redeemed_at IS NULL` 已安全
- Math.random 幂等键：单客户端碰撞 ~0
- GORDITO 头奖 2 位误判：业务上头奖总是 4 位，不发生
- Chance "00" 空号超付：空号是异常场景，且前端已校验
- rollback 不清 archived_at：**实际有清**（L901）
- win_breakdown 字段名不匹配：**前端已主动兼容两种格式**（merchant.html:5024-5031）
- 子店可绑多大店：UNIQUE(sub_shop_id) 保护，rejected 是 UPSERT 覆盖而不是新增
- 卡密激活非原子：已有 `transaction + UPDATE WHERE used_at IS NULL`
- activateCard 不验 owner_id：卡密由 admin 唯一生成，老板花自己钱给别人店激活是他的事
- 赔率改动污染历史订单：老板自己决定的业务规则
- 限额 / 佣金含 canceled 订单：老板自己决定释放规则

---

## 修复顺序建议

**一次性修复时推荐顺序**：
1. 先改环境变量（服务器设 ADMIN_TOKEN + TOKEN_SECRET），配合代码加启动强校验
2. 修 AdminGuard（精确路径匹配 + timingSafeEqual）
3. 给所有 binding 查询接口加 owner_id 校验
4. 前端 5 个页面加 lottery_api_base 白名单校验
5. clear-settlement 补鉴权
6. ensureShopPendingDraw 加 withShopLock
7. draw.status 统一 + 数据迁移
8. rollback 加归档保护
9. 手动开奖下一期过滤补 lottery_type/shop_id
10. 蓝牙 / QR / Nodemailer / shop-order-lock（非紧急）

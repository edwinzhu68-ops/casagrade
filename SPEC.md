# 巴拿马彩票系统完整开发提示词

## 系统目标
- 支持 10000+ 店铺
- 单次开奖 50000+ 订单
- 高峰集中在开奖前3小时

---

## 一、账号系统

### 老板注册
- 随机5位数字账号（如48325）
- 字段：user_id, account_number, phone, password, created_at

### 店铺创建
- 随机5位店铺号（如73841）
- 字段：shop_id, shop_number, owner_id, shop_name, commission_rate, created_at

---

## 二、店铺绑定系统

- A店铺可申请绑定B店铺
- 绑定后佣金自动计算
- 字段：binding_id, shop_a, shop_b, commission_rate, status

---

## 三、客户端（顾客）

- 无需注册，输入店铺号进入
- 九宫格数字输入下单
- 订单状态：未付款 → 已付款 → 已开奖 → 已中奖

---

## 四、付款流程

1. 顾客下单 → 状态"未付款"
2. 顾客现金/WhatsApp转账
3. 老板端确认 → 状态"已付款"

---

## 五、订单系统

字段：
- order_id, shop_id, numbers, amount, status, draw_id, win_amount, created_at

状态：0未付款, 1已付款, 2已开奖, 3已中奖

订单号：时间戳+随机数

---

## 六、开奖系统

- 每周2次（周三、周日）
- Playwright爬虫自动获取
- 写入Redis缓存

---

## 七、中奖计算

- 批量处理（每批1000单）
- 避免数据库压力

---

## 八、数据保留规则

- 开奖后保留24小时
- 只保留统计数据到 shop_daily_stats

---

## 九、高并发架构

```
负载均衡 → API服务器×3 → Redis缓存 → PostgreSQL → RabbitMQ消息队列
```

---

## 十、防作弊机制

1. **开奖前5分钟停止下注**
2. **订单创建后不可修改**
3. **订单签名**：SHA256(order_id + numbers + amount + secret)
4. **管理员不可修改订单**
5. **防刷单**：同IP每秒最多5单
6. **二维码防伪**：order_id + order_hash

---

## 十一、通知系统

- WebSocket推送
- 新订单通知、绑定申请、开奖通知

---

## 开发优先级

1. 账号系统
2. 店铺系统
3. 客户端下注
4. 订单系统
5. 付款确认
6. 开奖爬虫
7. 中奖计算
8. 佣金系统
9. 防作弊
10. 高并发优化

---

## 当前实现状态（V1 快照说明）

### 代码备份

- 已在本地创建 V1 备份：
  - 前端 PWA 与后台页面：`~/lottery-preview/V1/lottery-preview-V1.tar.gz`
  - 新后端结算系统：`~/lottery-system/V1/lottery-system-V1.tar.gz`

### 后端架构说明（当前状态）

- **唯一对外后端：`~/lottery-system`（NestJS）**
  - 前端 `index.html / merchant.html / result.html / dashboard.html` 通过 **`API_BASE = https://api.casagrade.com`** 直接调用该后端（生产环境）。本地开发时可用 `server.js` 在 8080 提供静态页并代理 `/api` 到本机 NestJS（默认 3000）。
  - 已对外暴露、与前端兼容的 REST 接口包括：
    - 订单：`POST/GET /api/orders`、`GET /api/orders/:orderNumber`、`POST /api/orders/:orderNumber/confirm`、`POST /api/orders/:orderNumber/redeem`
    - 店铺：`GET /api/shop/:shopNumber`、`GET /api/shop/:shopId/orders`
    - 下注状态：`GET /api/bet-status`
    - 开奖：`GET /api/draw/latest`、`POST /api/draw/time`、`POST /api/draw/manual`
    - 老板端：`POST /api/merchant/login`、`POST /api/merchant/register`、`GET /api/merchant/shops`
    - 结算：`POST /api/settlement/settle/:drawId`、`GET /api/settlement/history`
    - 总后台：`GET /api/admin/health`、`GET /api/admin/shop-compare`
  - 内核能力：`OrderService`（下单、日限额、核销、30 分钟超时取消）、`SettlementService`（Billete + Chance 结算）、`loteria-rules.ts`（赔率与中奖计算）。

- **`lottery-preview/server.js` 的角色**
  - 仅作为**本地开发**用：提供静态页（默认端口 8080）+ 将 `/api` 代理到本机 NestJS（默认 3000）。不承载线上流量，也不是“旧后端”。

### 下注与赔率模型（已统一到新后端）

- **Billete**
  - 号码范围：`0000–9999`。
  - 单注金额：**$1 / 张**。
  - 赔率规则（每注按下注金额计算倍数）：
    - 头奖四位（Primer 4）：命中四位 → `2000 × 注金`，且**不再叠加头奖的前三位/后三位/前两位/后两位**。
    - 二奖四位（Segundo 4）：命中四位 → `600 × 注金`，且不再叠加本奖的后三位/后两位。
    - 三奖四位（Tercero 4）：命中四位 → `300 × 注金`，且不再叠加本奖的后三位/后两位。
    - 头奖前三位 / 后三位 / 前两位 / 后两位：仅在**未命中头奖四位**时生效。
    - 二奖后三位 / 后两位：仅在**未命中二奖四位**时生效。
    - 三奖后三位 / 后两位：仅在**未命中三奖四位**时生效。
  - 不同奖项之间可以叠加（例如同一号码既中头奖四位又中二奖后两位时，会同时给头奖四位 + 二奖后两位的奖金）。

- **Chance**
  - 号码范围：`00–99`。
  - 单注金额：**$0.25 / 张**（结算里按金额成倍放大赔率）。
  - 赔率规则（以 $0.25 为基准）：
    - 头奖后两位：$14 / 0.25。
    - 二奖后两位：$3 / 0.25。
    - 三奖后两位：$2 / 0.25。

### 订单与状态（新后端约定）

- 订单状态流转：
  - `Pending`：顾客下单未付款。
  - `Paid`：老板核销确认收款。
  - `Won` / `Lost`：开奖结算后按 Billete + Chance 的中奖结果更新。
  - `Canceled`：超过 30 分钟未付款自动取消，或后续清理任务取消。

- 日销售额和限额：
  - 日限额统计只包含状态 `Paid / Won / Lost` 的订单金额。
  - `Pending` 和 `Canceled` 不占用店铺的当日投注额度。

- 超时取消规则：
  - 在核销接口中检查订单 `created_at`：
    - 若创建时间距今超过 30 分钟且状态仍为 `Pending`，则：
      - 更新为 `Canceled`，记录 `canceled_at`。
      - 返回错误提示「订单已超过30分钟未支付，已自动取消」。

### 开奖数据结构（Dashboard → 后端）

- 总后台 Dashboard 手动发送开奖时，约定将 `Draw.winning_numbers` 写为 JSON：
  - 统一结构：`{ primer, segundo, tercero }`。
  - 各字段可以是 2 位 / 4 位 / 5 位字符串：
    - Billete 计算使用**最后 4 位**来匹配四位/三位/两位奖。
    - Chance 计算使用**最后 2 位**来匹配后两位奖。

### 数据与流量现状

- 前端（`~/lottery-preview`）在生产环境**直接连接 NestJS 后端**（`API_BASE = https://api.casagrade.com`），订单/开奖/统计均以 `lottery-system` 为准。
- 架构已收敛为 **单一后端（NestJS）+ 统一规则**；无需再“从旧后端迁移到新后端”。若后续新增前端页面或接口，只需在 NestJS 中扩展并保持路径兼容即可。

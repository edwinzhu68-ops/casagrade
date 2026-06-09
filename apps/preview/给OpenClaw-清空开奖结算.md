# 给 OpenClaw：清空开奖结算功能说明与自检

## 目标

总后台增加「清空开奖结算」按钮，效果与「开奖当天 15:00 前清除」一致：**当前期从结算页清除、转入历史**，结算页显示「等待开奖」，直到下次发送开奖结果。**只需登录即可操作，不需要管理员密钥。**

---

## 一、前端（lottery-preview）

### 1. 总后台 dashboard.html

- **按钮**：在「手动开奖」区块里，「发送开奖结果」旁边增加一个按钮：「🧹 清空开奖结算」。
- **点击逻辑**：
  1. 弹窗确认：「确定要清空开奖结算吗？当前期将转入历史……」
  2. 请求：`POST /api/admin/clear-settlement`，请求头带登录后的 `Authorization: Bearer <token>`（用 `getAdminHeaders(true)`），**不要**要求用户填管理员密钥。
  3. 成功：提示「已清空开奖结算，当前期已转入历史」，然后调用 `initDrawDefaults()` 和 `loadData()`。
  4. 失败：提示接口返回的 message 或「清空失败」。
- **说明文案**：页面下方写一句「登录即可操作」，不要写「需填写管理员密钥」。

### 2. 结算页 result.html（已有逻辑，无需改）

- `GET /api/draw/latest` 若返回 `draw: null`，页面会显示「等待开奖」、销售额/订单为 0。
- 后端在「清空」后让 latest 返回 null 即可。

---

## 二、后端（lottery-system/backend）

### 1. 数据层：Draw 表增加「归档」字段

- 在 **entities/draw.entity.ts** 里给 Draw 增加可选字段：
  - `archived_at: Date | null`（或 `datetime` 可空）
- 含义：非空表示该期已从「当前期」转入历史，结算页不再当作当前期展示。

### 2. GET /api/draw/latest 只返回「未归档」的当前期

- 在 **modules/draw/draw.controller.ts** 的 `getLatestDraw()` 里：
  - 查询条件加上：`archived_at` 为 null（或未归档）。
  - 只取最近一条 status 为已完成（如 `completed` / `COMPLETED`）且未归档的期次。
- 这样清空后，latest 会没有数据，结算页自然显示「等待开奖」。

### 3. 新增接口：POST /api/admin/clear-settlement

- **路径**：`POST /api/admin/clear-settlement`
- **鉴权**：**不校验管理员密钥（X-Admin-Token）**，只要求请求合法（登录后带 Bearer 即可，若你方有统一鉴权则按现有逻辑）。若当前所有 admin 接口都走 AdminTokenGuard，需要在该 Guard 里对路径 `admin/clear-settlement` 做放行（与 health 一样）。
- **逻辑**：
  1. 查「最近一条已开奖期」：status = completed（或 COMPLETED，兼容两种写法）。
  2. 若没有，返回 404 或 400，提示「暂无已开奖期，无需清空」。
  3. 若有，将该期的 `archived_at` 设为当前时间（即归档）。
  4. 返回：`{ success: true, message: '已清空开奖结算，当前期已转入历史', drawId }`。
- **路由注册**：项目里存在两个 AdminController（一个在 modules/admin，一个在 modules/draw 的 draw.controller.ts）。**必须保证至少有一个控制器注册了 `POST /api/admin/clear-settlement`**，否则会出现「Cannot POST /api/admin/clear-settlement」：
  - 若只在 **modules/admin** 的 AdminController 里加了该路由，需确认 AppModule 引入了 AdminModule，且部署/运行的是包含该模块的版本。
  - **推荐**：在 **modules/draw/draw.controller.ts** 的 AdminController 里也实现一遍 `POST clear-settlement`，这样只要 Draw 模块在，路由就一定存在。

### 4. 历史记录仍包含已归档期

- `GET /api/settlement/history`（或你们用来给结算页「最近 20 期」的接口）**不要**按 `archived_at` 过滤，要返回所有已完成期（含已归档），这样清空后该期仍在历史里可点进去看。
- 若历史项带 `drawId`/`draw_id`，前端可用来做「点进某期详情」；没有也可先不做。

---

## 三、自检清单（OpenClaw 做完可自查）

- [ ] 总后台有「清空开奖结算」按钮，点一次会弹确认再发请求。
- [ ] 请求为 `POST /api/admin/clear-settlement`，带 Bearer Token，不带管理员密钥；不要求用户填管理员密钥。
- [ ] 后端 Draw 有 `archived_at` 字段；清空接口会把最近已开奖期设为 `archived_at = now()`。
- [ ] `GET /api/draw/latest` 只返回未归档的最近已开奖期；清空后该接口返回 `draw: null`。
- [ ] 结算页在 latest 为 null 时显示「等待开奖」、销售额/订单为 0。
- [ ] 历史记录接口仍能查到刚清空的那一期（不因归档而消失）。
- [ ] 部署后重启/重新 build 后端，再在总后台点一次清空，确认不再出现「Cannot POST /api/admin/clear-settlement」。

---

## 四、若仍出现 Cannot POST /api/admin/clear-settlement

- 说明当前运行的后端里，没有任何控制器注册了该路由。请：
  1. 在 **draw.controller.ts** 的 AdminController（与 `POST admin/draw` 同属一个类）里添加 `@Post('clear-settlement')` 和对应方法（逻辑同上）。
  2. 确认 Nest 的 global prefix 是 `api`，因此完整路径为 `/api/admin/clear-settlement`。
  3. 重新 `npm run build` 并重启进程；若用 PM2/docker，需重启对应服务。

---

以上按顺序做完即可。若 OpenClaw 负责的是前端或后端其中一侧，可只做对应章节并和对方对齐接口约定（路径、鉴权、返回格式）。

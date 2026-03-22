# 本地开发：前端 + 后端要开两个终端

`merchant.html`、`index.html` 等页面在 **`lottery-preview`** 里，由 **`npm start`（8080）** 提供；  
`npm run start:dev` 在 **`lottery-system/backend`** 里只启动 **API（默认 3000）**，**不会**托管 8080 上的 HTML。

## 1）后端 API

```bash
cd ~/lottery-system/backend
npm run start:dev
```

控制台应出现：`Lottery API running on http://localhost:3000`

## 2）前端静态 + 把 `/api` 代理到上面后端

**另开一个终端：**

```bash
cd ~/lottery-preview
npm start
```

控制台会打印当前服务的**绝对路径**；请确认是你要改代码的那个 `lottery-preview` 目录。

## 3）浏览器

- 收银台：<http://localhost:8080/merchant.html>  
- 需**先登录**后，才看得到顶栏「代客下单」和中间大按钮「代客下单」。

若仍像旧版页面：对浏览器 **强制刷新**（Cmd+Shift+R / Ctrl+Shift+R），或关掉其它占用 8080 的程序后只保留 `npm start`。

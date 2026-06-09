# Casagrade — Lottery Platform Monorepo

巴拿马彩票（Lotería / TICA / NICA）无纸化下单 · 收款 · 结算平台。

本仓库为 **monorepo** 整合，把原先分散在 5 个独立仓库的应用归并管理。
**历史 commit 已通过 `git subtree add --no-squash` 完整保留**——每个子目录的 `git log` 仍能看到原始开发轨迹。

---

## 📁 目录结构

```
casagrade/
├── apps/
│   ├── customer-app/       用户端（投注者）  ← edwinzhu68-ops/lottery-customer-app
│   ├── merchant-app/       商户端（投注站）  ← edwinzhu68-ops/lottery-merchant-app
│   ├── pos/                POS 收银端（前端展示）← edwinzhu68-ops/casagrade-pos
│   └── preview/            Web 预览 / H5       ← edwinzhu68-ops/lottery-preview
└── services/
    └── lottery-system/     核心后端（TS）      ← edwinzhu68-ops/lottery-system
```

## 🔗 原始仓库（保留不动，本仓仅做镜像合并）

| 子目录 | 原仓库 | 主语言 |
|---|---|---|
| `apps/customer-app` | edwinzhu68-ops/lottery-customer-app | Java |
| `apps/merchant-app` | edwinzhu68-ops/lottery-merchant-app | Java |
| `apps/pos` | edwinzhu68-ops/casagrade-pos | HTML |
| `apps/preview` | edwinzhu68-ops/lottery-preview | HTML |
| `services/lottery-system` | edwinzhu68-ops/lottery-system | TypeScript |

## 🧩 子项目说明

| 子目录 | 来源 package | 技术栈 | 说明 |
|---|---|---|---|
| `services/lottery-system` | — (TS backend) | TypeScript + Node | 核心后端：订单 / 收款 / 结算 / 期次管理；多设备同步；TICA/NICA 开奖乐观锁 |
| `apps/merchant-app` | `lottery-merchant-app@1.0.0` | Capacitor + Android (Java) | 投注站商户端（老板侧） |
| `apps/customer-app` | `lottery-customer-app@1.0.0` | Capacitor + Android (Java) | C 端用户 App（投注者） |
| `apps/pos` | — (静态 HTML) | HTML/CSS/JS | POS 收银前端展示 |
| `apps/preview` | `lottery-preview@1.0.0` | Node + 前端 | Web H5 预览 / 营销展示 |

> 注：每个子目录的 `git log -- <path>` 仍能完整看到原仓库的开发历史。  
> 比如 `git log -- services/lottery-system` 会显示 189 个原始 commit。

## 📜 历史保留方式

本仓使用 `git subtree add --no-squash` 合并 5 个原仓库，每个原仓库的 commit 全部按时间顺序进入新仓历史。
顶部可见 5 个 "Add 'xxx/' from commit 'xxx'" 的 merge commit，作为子目录的引入标记。

如需追溯某个功能的原始 PR / commit，可以这样查：

```bash
# 看 lottery-system 的所有历史
git log -- services/lottery-system

# 看 merchant-app 在 5 月之后的修改
git log --since="2026-05-01" -- apps/merchant-app
```

## 🚧 状态

- ✅ 5 个仓库已合并（历史 commit 完整保留）
- ✅ 原仓库未做任何修改
- 🚧 各子项目仍可独立 build / deploy
- 🚧 跨项目重构 / CI 统一 尚待规划

---

## License

Private / Internal use only unless stated otherwise.
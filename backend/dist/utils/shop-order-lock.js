"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withShopLock = withShopLock;
const shopOrderLocks = new Map();
function withShopLock(shopId, fn) {
    const prev = shopOrderLocks.get(shopId) ?? Promise.resolve();
    const next = prev.then(() => fn());
    shopOrderLocks.set(shopId, next.catch(() => { }));
    return next;
}
//# sourceMappingURL=shop-order-lock.js.map
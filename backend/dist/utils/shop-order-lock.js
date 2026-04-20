"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withShopLock = withShopLock;
const shopOrderLocks = new Map();
function withShopLock(shopId, fn) {
    const prev = shopOrderLocks.get(shopId) ?? Promise.resolve();
    const next = prev.then(() => fn());
    const tracked = next.catch(() => { }).finally(() => {
        if (shopOrderLocks.get(shopId) === tracked) {
            shopOrderLocks.delete(shopId);
        }
    });
    shopOrderLocks.set(shopId, tracked);
    return next;
}
//# sourceMappingURL=shop-order-lock.js.map
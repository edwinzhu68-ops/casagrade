/**
 * 按店铺 ID 串行化「限额检查 + 写入」，防止并发超卖。
 * 全国单与店内单共用同一把锁（同 shop_id）。
 */
const shopOrderLocks = new Map<number, Promise<unknown>>();

export function withShopLock<T>(shopId: number, fn: () => Promise<T>): Promise<T> {
  const prev = shopOrderLocks.get(shopId) ?? Promise.resolve();
  const next = prev.then(() => fn());
  shopOrderLocks.set(shopId, next.catch(() => {}));
  return next;
}

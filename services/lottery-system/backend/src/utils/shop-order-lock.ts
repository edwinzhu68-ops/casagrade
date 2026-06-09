/**
 * 按店铺 ID 串行化「限额检查 + 写入」，防止并发超卖。
 * 全国单与店内单共用同一把锁（同 shop_id）。
 *
 * 修复点：用 finally 清理 Map 避免长期运行内存泄漏；
 *       清理时对比引用，防止误删后续请求的锁。
 */
const shopOrderLocks = new Map<number, Promise<unknown>>();

export function withShopLock<T>(shopId: number, fn: () => Promise<T>): Promise<T> {
  const prev = shopOrderLocks.get(shopId) ?? Promise.resolve();
  const next = prev.then(() => fn());
  // 存入前吞掉异常（让排队的下一个人还能跑），然后清理自己
  const tracked = next.catch(() => {}).finally(() => {
    if (shopOrderLocks.get(shopId) === tracked) {
      shopOrderLocks.delete(shopId);
    }
  });
  shopOrderLocks.set(shopId, tracked);
  return next;
}

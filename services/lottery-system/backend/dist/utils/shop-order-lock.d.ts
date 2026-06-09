export declare function withShopLock<T>(shopId: number, fn: () => Promise<T>): Promise<T>;

import { Shop } from './shop.entity';
export declare class ShopBinding {
    binding_id: number;
    main_shop_id: number;
    mainShop: Shop;
    sub_shop_id: number;
    subShop: Shop;
    commission_rate: number;
    status: string;
    created_at: Date;
    updated_at: Date;
}

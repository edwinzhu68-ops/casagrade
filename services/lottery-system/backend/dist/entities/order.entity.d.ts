import { Shop } from './shop.entity';
import { Draw } from './draw.entity';
export declare class Order {
    order_id: number;
    order_number: string;
    order_hash: string;
    shop_id: number;
    shop: Shop;
    customer_info: {
        name?: string;
        phone?: string;
        clientId?: string;
    };
    numbers: {
        n: string;
        q: number;
    }[];
    amount: number;
    game_type: string;
    lottery_type: string;
    status: number;
    draw_id: number;
    draw: Draw;
    win_amount: number;
    win_breakdown: {
        n: string;
        q: number;
        win: number;
    }[] | null;
    ip_address: string;
    device_fingerprint: string;
    verification_code: string;
    created_at: Date;
    updated_at: Date;
    paid_at: Date;
    canceled_at: Date;
    settled_at: Date;
    redeemed_at: Date;
    note: string;
    idempotency_key: string;
}

import { DataSource } from 'typeorm';
interface CreateOrderDto {
    shopId?: number;
    shop_id?: number;
    numbers: {
        n: string;
        q: number;
    }[];
    amount: number;
    gameType?: string;
    game_type?: string;
    clientId?: string;
    ipAddress?: string;
}
export declare class OrderController {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    createOrder(dto: CreateOrderDto): Promise<{
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
    }>;
    getOrder(orderNumber: string): Promise<{
        order_id: number;
        order_number: string;
        order_hash: string;
        amount: number;
        numbers: {
            n: string;
            q: number;
        }[];
        status: string;
        verification_code: string;
        shopId: number;
        shopNumber: string;
        win_amount: number;
        created_at: Date;
        paid_at: Date;
    }>;
    confirmOrder(orderNumber: string, body: {
        shopId: number;
    }): Promise<{
        success: boolean;
        order_id: number;
        order_number: string;
        status: string;
    }>;
    private generateOrderNumber;
    private generateVerificationCode;
}
export declare class ShopController {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    getShopByNumber(shopNumber: string): Promise<{
        shop: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            status: string;
            commission_rate: number;
        };
    }>;
    getShopOrders(shopId: string, limit?: string, status?: string): Promise<{
        shopId: number;
        shopNumber: string;
        shopName: string;
        orders: {
            order_id: number;
            order_number: string;
            order_hash: string;
            numbers: {
                n: string;
                q: number;
            }[];
            amount: number;
            game_type: string;
            status: string;
            win_amount: number;
            verification_code: string;
            created_at: Date;
            paid_at: Date;
        }[];
    }>;
}
export declare class BetStatusController {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    getBetStatus(shopId: string): Promise<{
        status: string;
        canBet: boolean;
        minutesUntilDraw: number;
        shopId?: undefined;
        orderCount?: undefined;
        orders?: undefined;
    } | {
        status: string;
        canBet: boolean;
        minutesUntilDraw: number;
        shopId: number;
        orderCount: number;
        orders: {
            order_id: number;
            order_number: string;
            status: number;
            amount: number;
        }[];
    }>;
}
export {};

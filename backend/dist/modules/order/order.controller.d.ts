import { OnModuleInit } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { DrawDayService } from '../draw/draw-day.service';
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
    idempotency_key?: string;
}
export declare class OrderController implements OnModuleInit {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    onModuleInit(): Promise<void>;
    createOrder(dto: CreateOrderDto, req: Request): Promise<{
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
        _idempotent: boolean;
    } | {
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
        _idempotent?: undefined;
    }>;
    deleteOrder(orderNumber: string, body: {
        shopId?: number;
    }, req: Request): Promise<{
        success: boolean;
        message: string;
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
        game_type: string;
        status: string;
        verification_code: string;
        shopId: number;
        shopNumber: string;
        win_amount: number;
        win_breakdown: any;
        redeemed_at: any;
        created_at: Date;
        paid_at: Date;
    }>;
    confirmOrder(orderNumber: string, body: {
        shopId: number;
    }): Promise<{
        success: boolean;
        message: string;
        order_id?: undefined;
        order_number?: undefined;
        status?: undefined;
    } | {
        success: boolean;
        order_id: number;
        order_number: string;
        status: string;
        message?: undefined;
    }>;
    redeemOrder(orderNumber: string, body: {
        shopId: number;
    }): Promise<{
        success: boolean;
        order_number: string;
        win_amount: number;
        message: string;
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
            limit_chance: any;
            limit_billete: any;
        };
    }>;
    updateShopLimits(shopId: string, body: {
        limitChance?: number | null;
        limitBillete?: number | null;
    }): Promise<{
        success: boolean;
        limit_chance: any;
        limit_billete: any;
    }>;
    getShopOrders(shopId: string, limit?: string, status?: string, suffix?: string, drawId?: string): Promise<{
        shopId: number;
        shopNumber: string;
        shopName: string;
        orders: {
            order_id: number;
            shop_id: number;
            order_number: string;
            order_hash: string;
            numbers: {
                n: string;
                q: number;
            }[];
            amount: number;
            game_type: string;
            status: string;
            draw_id: number;
            win_amount: number;
            win_breakdown: any;
            redeemed_at: any;
            verification_code: string;
            created_at: Date;
            paid_at: Date;
        }[];
    }>;
}
export declare class BetStatusController {
    private readonly dataSource;
    private readonly drawDayService;
    private readonly logger;
    constructor(dataSource: DataSource, drawDayService: DrawDayService);
    private static formatDrawPeriodDate;
    getBetStatus(shopId: string): Promise<{
        status: "ok";
        canBet: boolean;
        minutesUntilDraw: number;
        currentPeriodDate: string;
        isDrawWindow: boolean;
        confirmedDrawDay: string;
        confirmedDrawTime: string;
    } | {
        shopId: number;
        orderCount: number;
        orders: {
            order_id: number;
            order_number: string;
            status: number;
            amount: number;
        }[];
        status: "ok";
        canBet: boolean;
        minutesUntilDraw: number;
        currentPeriodDate: string;
        isDrawWindow: boolean;
        confirmedDrawDay: string;
        confirmedDrawTime: string;
    }>;
}
export {};

import { Request } from 'express';
import { LocalLotteryService, LocalCreateOrderDto } from './local-lottery.service';
export declare class LocalLotteryController {
    private readonly localLotteryService;
    constructor(localLotteryService: LocalLotteryService);
    current(shopId: string, kind: string): Promise<{
        draw_id: number;
        period_no: number;
        previousDrawId: number;
        custom_period: any;
        shop_id: number;
        lottery_type: "TICA" | "NICA";
        status: string;
        draw_date: Date;
        draw_time: string;
    }>;
    create(dto: LocalCreateOrderDto, req: Request): Promise<{
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
        lottery_type: "TICA" | "NICA";
        draw_id: number;
    } | {
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
        lottery_type: "TICA" | "NICA";
        _idempotent: boolean;
    }>;
    settle(body: {
        shopId: number;
        kind: string;
        n1: string;
        n2: string;
        n3: string;
    }, req: Request): Promise<{
        totalOrders: number;
        totalSales: number;
        totalPayout: number;
        wins: number;
        results: any[];
        settled_draw_id: number;
        next_draw_id: number;
        winning_numbers: {
            n1: string;
            n2: string;
            n3: string;
        };
    }>;
    accepting(shopId: string, body: {
        acceptingTicaOrders?: boolean;
        acceptingNicaOrders?: boolean;
    }, req: Request): Promise<{
        success: boolean;
        accepting_tica_orders: any;
        accepting_nica_orders: any;
    }>;
    shopSettings(shopId: string, body: {
        ticaEnabled?: boolean;
        nicaEnabled?: boolean;
        acceptingTicaOrders?: boolean;
        acceptingNicaOrders?: boolean;
    }, req: Request): Promise<{
        success: boolean;
        tica_enabled: boolean;
        nica_enabled: boolean;
        accepting_tica_orders: boolean;
        accepting_nica_orders: boolean;
    }>;
}

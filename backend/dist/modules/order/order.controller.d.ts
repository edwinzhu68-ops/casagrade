import { OnModuleInit } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { DrawDayService } from '../draw/draw-day.service';
import { LocalLotteryService } from '../local-lottery/local-lottery.service';
interface CreateOrderDto {
    shopId?: number;
    shop_id?: number;
    lotteryKind?: 'TICA' | 'NICA';
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
    private readonly localLotteryService;
    private readonly logger;
    constructor(dataSource: DataSource, localLotteryService: LocalLotteryService);
    onModuleInit(): Promise<void>;
    createOrder(dto: CreateOrderDto, req: Request): Promise<{
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
    } | {
        order_id: number;
        order_number: string;
        order_hash: string;
        draw_id: number;
        drawId: number;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
    } | {
        order_id: number;
        order_number: string;
        order_hash: string;
        verification_code: string;
        amount: number;
        status: number;
        created_at: Date;
        _idempotent: boolean;
    }>;
    deleteOrder(orderNumber: string, body: {
        shopId?: number;
    }, req: Request): Promise<{
        success: boolean;
        message: string;
    }>;
    patchOrder(orderNumber: string, body: {
        shopId?: number;
        numbers?: {
            n: string;
            q: number;
        }[];
    }, req: Request): Promise<{
        success: boolean;
        order_number: string;
        amount: number;
        numbers: {
            n: string;
            q: number;
        }[];
        game_type: string;
        lottery_type: string;
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
        lottery_type: any;
        status: string;
        draw_id: number;
        drawId: number;
        verification_code: string;
        shop_id: number;
        shopId: number;
        shopNumber: string;
        win_amount: number;
        win_breakdown: any;
        redeemed_at: any;
        note: any;
        draw_date: Date;
        created_at: Date;
        paid_at: Date;
    }>;
    confirmOrder(orderNumber: string, body: {
        shopId: number;
        note?: string;
    }, req: any): Promise<{
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
    }, req: any): Promise<{
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
    private requireShopOwner;
    listShopOrdersByQuery(shopId: string, limit?: string, status?: string, suffix?: string, drawId?: string, lotteryKind?: string, req?: any): Promise<{
        shop_id: number;
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
            lottery_type: any;
            status: string;
            draw_id: number;
            win_amount: number;
            win_breakdown: any;
            redeemed_at: any;
            note: any;
            verification_code: string;
            created_at: Date;
            paid_at: Date;
        }[];
    }>;
    syncShopOrders(shopId: string, since?: string, drawId?: string, lotteryKind?: string, winnerOnly?: string, req?: any): Promise<{
        shop_id: number;
        shopId: number;
        shopNumber: string;
        shopName: string;
        serverTime: string;
        since: string;
        count: number;
        shop: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            status: string;
            commission_rate: number;
            limit_chance: any;
            limit_billete: any;
            tica_limit_chance: any;
            tica_limit_palet: any;
            nica_limit_chance: any;
            nica_limit_palet: any;
            tica_custom_period: any;
            nica_custom_period: any;
            national_custom_draw_date: any;
            national_custom_draw_id: any;
            loteria_enabled: any;
            tica_enabled: any;
            nica_enabled: any;
            accepting_tica_orders: any;
            accepting_nica_orders: any;
            rate_billete_1: any;
            rate_billete_2: any;
            rate_billete_3: any;
            rate_chance_1: any;
            rate_chance_2: any;
            rate_chance_3: any;
            chain_1_2: any;
            chain_1_3: any;
            chain_2_1: any;
            chain_2_3: any;
            chain_3_1: any;
            chain_3_2: any;
            tica_chance_1: any;
            tica_chance_2: any;
            tica_chance_3: any;
            nica_chain_1_2: any;
            nica_chain_1_3: any;
            nica_chain_2_1: any;
            nica_chain_2_3: any;
            nica_chain_3_1: any;
            nica_chain_3_2: any;
            nica_chance_1: any;
            nica_chance_2: any;
            nica_chance_3: any;
            subscription_expires_at: any;
            updated_at: any;
        };
        currentLocalDraws: {
            TICA: {
                draw_id: any;
                period_no: any;
                status: any;
                winning_numbers: {
                    n1: string;
                    n2: string;
                    n3: string;
                };
            };
            NICA: {
                draw_id: any;
                period_no: any;
                status: any;
                winning_numbers: {
                    n1: string;
                    n2: string;
                    n3: string;
                };
            };
        };
        previousLocalDraws: {
            TICA: {
                draw_id: any;
                period_no: any;
                status: any;
                winning_numbers: {
                    n1: string;
                    n2: string;
                    n3: string;
                };
            };
            NICA: {
                draw_id: any;
                period_no: any;
                status: any;
                winning_numbers: {
                    n1: string;
                    n2: string;
                    n3: string;
                };
            };
        };
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
            lottery_type: any;
            status: string;
            draw_id: number;
            win_amount: number;
            win_breakdown: any;
            redeemed_at: any;
            canceled_at: any;
            note: any;
            verification_code: string;
            created_at: Date;
            updated_at: any;
            paid_at: Date;
        }[];
    }>;
    private buildShopOrdersList;
    updateShopLimits(shopId: string, body: {
        limitChance?: number | null;
        limitBillete?: number | null;
        ticaLimitChance?: number | null;
        ticaLimitPalet?: number | null;
        nicaLimitChance?: number | null;
        nicaLimitPalet?: number | null;
        ticaCustomPeriod?: string | null;
        nicaCustomPeriod?: string | null;
        ticaEnabled?: boolean;
        nicaEnabled?: boolean;
        loteriaEnabled?: boolean;
    }, req: Request): Promise<{
        success: boolean;
        limit_chance: any;
        limit_billete: any;
        tica_limit_chance: any;
        tica_limit_palet: any;
        nica_limit_chance: any;
        nica_limit_palet: any;
        tica_custom_period: any;
        nica_custom_period: any;
        loteria_enabled: any;
        tica_enabled: boolean;
        nica_enabled: boolean;
    }>;
    updateShopRates(shopId: string, body: {
        rateBillete1?: number | null;
        rateBillete2?: number | null;
        rateBillete3?: number | null;
        rateChance1?: number | null;
        rateChance2?: number | null;
        rateChance3?: number | null;
        ticaChance1?: number | null;
        ticaChance2?: number | null;
        ticaChance3?: number | null;
        chain12?: number | null;
        chain13?: number | null;
        chain21?: number | null;
        chain23?: number | null;
        chain31?: number | null;
        chain32?: number | null;
        nicaChain12?: number | null;
        nicaChain13?: number | null;
        nicaChain21?: number | null;
        nicaChain23?: number | null;
        nicaChain31?: number | null;
        nicaChain32?: number | null;
        nicaChance1?: number | null;
        nicaChance2?: number | null;
        nicaChance3?: number | null;
    }, req: Request): Promise<{
        success: boolean;
        rate_billete_1: any;
        rate_billete_2: any;
        rate_billete_3: any;
        rate_chance_1: any;
        rate_chance_2: any;
        rate_chance_3: any;
        tica_chance_1: any;
        tica_chance_2: any;
        tica_chance_3: any;
        chain_1_2: any;
        chain_1_3: any;
        chain_2_1: any;
        chain_2_3: any;
        chain_3_1: any;
        chain_3_2: any;
        nica_chain_1_2: any;
        nica_chain_1_3: any;
        nica_chain_2_1: any;
        nica_chain_2_3: any;
        nica_chain_3_1: any;
        nica_chain_3_2: any;
        nica_chance_1: any;
        nica_chance_2: any;
        nica_chance_3: any;
    }>;
    getShopOrders(shopId: string, limit?: string, status?: string, suffix?: string, drawId?: string, lotteryKind?: string, req?: any): Promise<{
        shop_id: number;
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
            lottery_type: any;
            status: string;
            draw_id: number;
            win_amount: number;
            win_breakdown: any;
            redeemed_at: any;
            note: any;
            verification_code: string;
            created_at: Date;
            paid_at: Date;
        }[];
    }>;
    updateShopNationalDrawDate(shopId: string, body: {
        drawDate?: string | null;
    }, req: Request): Promise<{
        success: boolean;
        national_custom_draw_date: string;
        national_custom_draw_id: number;
    }>;
    getShopByNumber(shopNumber: string): Promise<{
        shop: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            status: string;
            commission_rate: number;
            limit_chance: any;
            limit_billete: any;
            tica_limit_chance: any;
            tica_limit_palet: any;
            nica_limit_chance: any;
            nica_limit_palet: any;
            tica_custom_period: any;
            nica_custom_period: any;
            national_custom_draw_date: any;
            national_custom_draw_id: any;
            loteria_enabled: boolean;
            tica_enabled: boolean;
            nica_enabled: boolean;
            accepting_tica_orders: boolean;
            accepting_nica_orders: boolean;
        };
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
        stopSellAt: number;
        currentPeriodDate: string;
        isDrawWindow: boolean;
        confirmedDrawDay: string;
        confirmedDrawTime: string;
    } | {
        shop_id: number;
        shopId: number;
        loteriaEnabled: boolean;
        ticaEnabled: boolean;
        nicaEnabled: boolean;
        acceptingTicaOrders: boolean;
        acceptingNicaOrders: boolean;
        status: "ok";
        canBet: boolean;
        minutesUntilDraw: number;
        stopSellAt: number;
        currentPeriodDate: string;
        isDrawWindow: boolean;
        confirmedDrawDay: string;
        confirmedDrawTime: string;
    }>;
}
export {};

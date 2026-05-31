import { Request } from 'express';
import { Repository, DataSource } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Shop } from '../../entities/shop.entity';
import { User } from '../../entities/user.entity';
import { Draw } from '../../entities/draw.entity';
import { CardCode } from '../../entities/card-code.entity';
import { ShopBinding } from '../../entities/shop-binding.entity';
export declare class AdminController {
    private readonly orderRepo;
    private readonly shopRepo;
    private readonly userRepo;
    private readonly drawRepo;
    private readonly cardCodeRepo;
    private readonly shopBindingRepo;
    private readonly dataSource;
    private readonly logger;
    constructor(orderRepo: Repository<Order>, shopRepo: Repository<Shop>, userRepo: Repository<User>, drawRepo: Repository<Draw>, cardCodeRepo: Repository<CardCode>, shopBindingRepo: Repository<ShopBinding>, dataSource: DataSource);
    shopCompare(from: string, to: string, top?: string): Promise<{
        items: {
            shopNumber: string;
            shopName: string;
            totalSales: number;
            netProfit: number;
        }[];
    }>;
    getAllShops(): Promise<{
        shops: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            shop_aliases: string[];
            status: string;
            commission_rate: number;
            owner_id: number;
            account_number: string;
            registered_at: Date;
            inactive_periods: number;
            subscription_expires_at: any;
            sub_shop_count: number;
        }[];
    }>;
    getCurrentPeriodStats(): Promise<{
        success: boolean;
        drawId: number;
        drawSource: string;
        shopCountDrawId: number;
        shopCountDrawSource: string;
        shop_count: number;
        total_orders: number;
        paid_orders: number;
        total_sales: number;
    }>;
    deleteAccount(accountNumber: string, req?: any): Promise<{
        success: boolean;
        message: string;
    }>;
    setShopStatus(shopId: string, status: string): Promise<{
        success: boolean;
        shop_id: number;
        status: string;
    }>;
    setShopSubscription(shopId: string, expiresAt: string | null, req: any): Promise<{
        success: boolean;
        shop_id: number;
        subscription_expires_at: string;
    }>;
    resetPassword(shopNumber: string, newPassword: string, req?: any): Promise<{
        success: boolean;
        message: string;
    }>;
    generateCards(type: string, count: number, req: Request): Promise<{
        success: boolean;
        codes: string[];
        type: string;
        generated_at: string;
    }>;
    listCards(type?: string): Promise<{
        cards: {
            id: number;
            code: string;
            type: string;
            used: boolean;
            used_by_shop_id: number;
            used_at: Date;
            created_at: Date;
        }[];
    }>;
    getSubShops(shopId: string): Promise<{
        sub_shops: {
            shop_id: number;
            shop_number: string;
            shop_name: string;
            subscription_expires_at: any;
            binding_id: number;
        }[];
    }>;
    revokeCard(id: string, req: Request): Promise<{
        success: boolean;
        message: string;
    }>;
    assignShop(shopNumber: string, accountNumber: string): Promise<{
        success: boolean;
        message: string;
        shop_id: number;
        shop_number: string;
        shop_aliases: string[];
        owner_id: number;
    }>;
    health(): Promise<{
        db: string;
        queue: string;
    }>;
    drawHistory(limit: string): Promise<{
        history: {
            draw_id: number;
            draw_date: any;
            order_count: number;
            total_sales: number;
            total_payout: number;
            net_profit: number;
        }[];
    }>;
    getLogs(lines?: string): Promise<{
        success: boolean;
        error: string;
        logs?: undefined;
        date?: undefined;
    } | {
        success: boolean;
        logs: string;
        date: string;
        error?: undefined;
    }>;
}

import { User } from './user.entity';
export declare class Shop {
    shop_id: number;
    shop_number: string;
    owner_id: number;
    owner: User;
    shop_name: string;
    commission_rate: number;
    shop_aliases: string[] | null;
    shop_alias_timestamps: Record<string, string> | null;
    status: string;
    single_bet_limit: number;
    daily_bet_limit: number;
    limit_chance: number | null;
    limit_billete: number | null;
    tica_enabled: boolean;
    nica_enabled: boolean;
    accepting_tica_orders: boolean;
    accepting_nica_orders: boolean;
    subscription_expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

import { DataSource } from 'typeorm';
import { Order } from '../../entities';
interface CreateOrderDto {
    storeCode: string;
    numbers: string[];
    betAmount: number;
    multiplier?: number;
    customerName?: string;
    customerPhone?: string;
}
export declare class OrderService {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    createOrder(dto: CreateOrderDto): Promise<Order>;
    private getTodaySales;
    private generateVerificationCode;
    verifyOrder(verificationCode: string): Promise<Order>;
    getMasterDashboard(masterId: number, period: 'today' | 'week' | 'month'): Promise<any>;
}
export {};

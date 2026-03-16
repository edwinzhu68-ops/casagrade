import { DataSource } from 'typeorm';
export declare class OrderCancelController {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    cancel(body: {
        orderNumber?: string;
    }): Promise<{
        success: boolean;
        order_number: string;
        message: string;
    }>;
}

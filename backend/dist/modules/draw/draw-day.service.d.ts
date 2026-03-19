import { OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class DrawDayService implements OnModuleInit {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    onModuleInit(): void;
    setConfirmedDrawDay(_date: string | null, _drawMins?: number): void;
    clearAutoArchiveFlag(): void;
    private tick;
    private cancelUnpaidOrders;
}

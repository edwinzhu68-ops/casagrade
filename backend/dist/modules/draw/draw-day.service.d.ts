import { OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
export declare class DrawDayService implements OnModuleInit {
    private readonly dataSource;
    private readonly logger;
    private filePath;
    private confirmedDrawDay;
    private confirmedDrawMins;
    private autoArchivedForDate;
    private nextPeriodCreatedForDate;
    constructor(dataSource: DataSource);
    onModuleInit(): void;
    private load;
    private save;
    getConfirmedDrawDay(): string | null;
    getConfirmedDrawMins(): number;
    setConfirmedDrawDay(date: string | null, drawMins?: number): void;
    clearAutoArchiveFlag(): void;
    private tick;
    private cancelUnpaidOrders;
    private autoArchiveLastCompleted;
}

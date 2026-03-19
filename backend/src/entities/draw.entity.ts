import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('draws')
@Index(['status'])              // WHERE status='pending' / 'completed'
@Index(['status', 'draw_id'])   // ORDER BY draw_id DESC WHERE status=?
export class Draw {
  @PrimaryGeneratedColumn()
  draw_id: number;

  @Column({ type: 'date', nullable: true })
  draw_date: Date;

  @Column({ type: 'time', nullable: true })
  draw_time: string;

  @Column({ type: 'text', nullable: true })
  winning_numbers: string; // JSON: {"primer":"1234","segundo":"5678","tercero":"9012"}

  @Column({ length: 20, default: 'pending' })
  status: string; // pending / completed

  /** 归档时间：非空表示该期已从「当前期」转入历史，结算页不再展示为当前期 */
  @Column({ type: 'datetime', nullable: true })
  archived_at: Date | null;

  /** 大庄管理中心归档标志：true 表示已手动/自动归档，sub-shop-data 切换到下一期 */
  @Column({ type: 'boolean', default: false, nullable: true })
  main_shop_archived: boolean;

  /** 是否手动覆盖开奖时间（节假日等情况）：true=人工指定，false=系统自动按周三/周日规则 */
  @Column({ type: 'boolean', default: false, nullable: true })
  is_manual_override: boolean;

  @CreateDateColumn()
  created_at: Date;
}

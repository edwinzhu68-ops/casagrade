import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Shop } from './shop.entity';
import { Draw } from './draw.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  order_id: number;

  @Column({ unique: true, length: 30 })
  order_number: string;

  @Column({ length: 64 })
  order_hash: string;

  @Column()
  shop_id: number;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'simple-json', nullable: true })
  customer_info: { name?: string; phone?: string; clientId?: string };

  @Column({ type: 'simple-json' })
  numbers: { n: string; q: number }[]; // 前端格式: [{"n":"1234","q":2},{"n":"56","q":3}]

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ length: 20 })
  game_type: string; // BILLETE / CHANCE

  @Column({ default: 0 })
  status: number; // 0:未付款 1:已付款 2:已开奖 3:已中奖

  @Column({ nullable: true })
  draw_id: number;

  @ManyToOne(() => Draw, { nullable: true })
  @JoinColumn({ name: 'draw_id' })
  draw: Draw;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  win_amount: number;

  /** 每注中奖金额，与 numbers 一一对应：[{ n, q, win }]，未中奖的 win 为 0 */
  @Column({ type: 'simple-json', nullable: true })
  win_breakdown: { n: string; q: number; win: number }[] | null;

  @Column({ length: 45, nullable: true })
  ip_address: string;

  @Column({ length: 100, nullable: true })
  device_fingerprint: string;

  // 核销码 - 用于老板确认收款
  @Column({ length: 10, nullable: true })
  verification_code: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'datetime', nullable: true })
  paid_at: Date;

  @Column({ type: 'datetime', nullable: true })
  canceled_at: Date;

  @Column({ type: 'datetime', nullable: true })
  settled_at: Date;

  /** 兑奖时间：老板扫码确认兑奖后写入，防重复兑奖 */
  @Column({ type: 'datetime', nullable: true })
  redeemed_at: Date;
}

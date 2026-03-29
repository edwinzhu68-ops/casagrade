import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('shops')
@Index(['owner_id'])   // WHERE owner_id=? 查用户名下的店铺
@Index(['status'])     // WHERE status='active'
export class Shop {
  @PrimaryGeneratedColumn()
  shop_id: number;

  @Column({ unique: true, length: 10 })
  shop_number: string;

  @Column({ nullable: true })
  owner_id: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ length: 100, nullable: true })
  shop_name: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.10 })
  commission_rate: number;

  /** 额外店号别名，登录/下单时也可用这些号码找到本店 */
  @Column({ type: 'simple-json', nullable: true })
  shop_aliases: string[] | null;

  /** 别名添加时间戳，key=别名店号，value=ISO时间字符串 */
  @Column({ type: 'simple-json', nullable: true })
  shop_alias_timestamps: Record<string, string> | null;

  @Column({ length: 20, default: 'active' })
  status: string; // active / disabled

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  single_bet_limit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  daily_bet_limit: number;

  /** 每期每号 Chance 最多卖出张数（null = 不限） */
  @Column({ type: 'int', nullable: true })
  limit_chance: number | null;

  /** 每期每号 Billete 最多卖出张数（null = 不限） */
  @Column({ type: 'int', nullable: true })
  limit_billete: number | null;

  /** TICA 每期每号 Chance 最多卖出张数（null = fallback 到 limit_chance） */
  @Column({ type: 'int', nullable: true })
  tica_limit_chance: number | null;

  /** TICA 每期每号 Palet 最多卖出张数（null = fallback 到 limit_billete） */
  @Column({ type: 'int', nullable: true })
  tica_limit_palet: number | null;

  /** NICA 每期每号 Chance 最多卖出张数（null = fallback 到 limit_chance） */
  @Column({ type: 'int', nullable: true })
  nica_limit_chance: number | null;

  /** NICA 每期每号 Palet 最多卖出张数（null = fallback 到 limit_billete） */
  @Column({ type: 'int', nullable: true })
  nica_limit_palet: number | null;

  /** 是否在顾客端展示 Lotería（官方彩；默认开启，店主可关闭） */
  @Column({ type: 'boolean', default: true })
  loteria_enabled: boolean;

  /**
   * 是否在顾客端展示 TICA（他国彩票品种之一；需店主开通）
   */
  @Column({ type: 'boolean', default: false })
  tica_enabled: boolean;

  /**
   * 是否在顾客端展示 NICA（他国彩票品种之一；需店主开通）
   */
  @Column({ type: 'boolean', default: false })
  nica_enabled: boolean;

  /** 是否接受 TICA 下单（不影响全国停售；未开通时无效） */
  @Column({ type: 'boolean', default: true })
  accepting_tica_orders: boolean;

  /** 是否接受 NICA 下单（不影响全国停售；未开通时无效） */
  @Column({ type: 'boolean', default: true })
  accepting_nica_orders: boolean;

  /** Billete 头奖四位全中赔率（null → 默认 2000） */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  rate_billete_1: number | null;

  /** Billete 二奖四位全中赔率（null → 默认 600） */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  rate_billete_2: number | null;

  /** Billete 三奖四位全中赔率（null → 默认 300） */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  rate_billete_3: number | null;

  /** Chance 头奖赔率（null → 默认 14） */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  rate_chance_1: number | null;

  /** Chance 二奖赔率（null → 默认 3） */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  rate_chance_2: number | null;

  /** Chance 三奖赔率（null → 默认 2） */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  rate_chance_3: number | null;

  /** TICA/NICA 1串2 赔率（≥1中奖，0=不中，默认1000） */
  @Column({ name: 'chain_1_2', type: 'decimal', precision: 10, scale: 2, default: 1000 })
  chain_1_2: number;

  /** TICA/NICA 1串3 赔率（≥1中奖，0=不中，默认1000） */
  @Column({ name: 'chain_1_3', type: 'decimal', precision: 10, scale: 2, default: 1000 })
  chain_1_3: number;

  /** TICA/NICA 2串1 赔率（≥1中奖，0=不中，默认0） */
  @Column({ name: 'chain_2_1', type: 'decimal', precision: 10, scale: 2, default: 0 })
  chain_2_1: number;

  /** TICA/NICA 2串3 赔率（≥1中奖，0=不中，默认200） */
  @Column({ name: 'chain_2_3', type: 'decimal', precision: 10, scale: 2, default: 200 })
  chain_2_3: number;

  /** TICA/NICA 3串1 赔率（≥1中奖，0=不中，默认0） */
  @Column({ name: 'chain_3_1', type: 'decimal', precision: 10, scale: 2, default: 0 })
  chain_3_1: number;

  /** TICA/NICA 3串2 赔率（≥1中奖，0=不中，默认0） */
  @Column({ name: 'chain_3_2', type: 'decimal', precision: 10, scale: 2, default: 0 })
  chain_3_2: number;

  // ── NICA 独立赔率（TICA 用上面的 chain_* 和 rate_chance_*；NICA 用下面的字段，null 时 fallback 到 TICA 的值） ──

  @Column({ name: 'nica_chain_1_2', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chain_1_2: number | null;

  @Column({ name: 'nica_chain_1_3', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chain_1_3: number | null;

  @Column({ name: 'nica_chain_2_1', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chain_2_1: number | null;

  @Column({ name: 'nica_chain_2_3', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chain_2_3: number | null;

  @Column({ name: 'nica_chain_3_1', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chain_3_1: number | null;

  @Column({ name: 'nica_chain_3_2', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chain_3_2: number | null;

  @Column({ name: 'nica_chance_1', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chance_1: number | null;

  @Column({ name: 'nica_chance_2', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chance_2: number | null;

  @Column({ name: 'nica_chance_3', type: 'decimal', precision: 10, scale: 2, nullable: true })
  nica_chance_3: number | null;

  /** 订阅到期时间（null = 未激活或永久） */
  @Column({ type: 'datetime', nullable: true })
  subscription_expires_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

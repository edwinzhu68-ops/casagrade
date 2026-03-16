import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Shop } from './shop.entity';

@Entity('shop_bindings')
export class ShopBinding {
  @PrimaryGeneratedColumn()
  binding_id: number;

  /** 主店铺 */
  @Column()
  main_shop_id: number;

  @ManyToOne(() => Shop, { nullable: false })
  @JoinColumn({ name: 'main_shop_id' })
  mainShop: Shop;

  /** 分店铺（每个店铺最多只能绑定一个主店） */
  @Column({ unique: true })
  sub_shop_id: number;

  @ManyToOne(() => Shop, { nullable: false })
  @JoinColumn({ name: 'sub_shop_id' })
  subShop: Shop;

  /**
   * 分店铺分走的利润比例（0.20 = 20%）
   * 每期：分店净得 = 利润 × commission_rate，主店净得 = 利润 × (1 - commission_rate)
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.20 })
  commission_rate: number;

  /** pending / active / rejected */
  @Column({ length: 20, default: 'pending' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

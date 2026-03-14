import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('shops')
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

  @Column({ length: 20, default: 'active' })
  status: string; // active / disabled

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  single_bet_limit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  daily_bet_limit: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('card_codes')
export class CardCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 20 })
  code: string; // 格式 XXXX-XXXX-XXXX

  @Column({ length: 10 })
  type: string; // 'monthly' | 'yearly'

  @Column({ nullable: true })
  used_by_shop_id: number | null;

  @Column({ type: 'datetime', nullable: true })
  used_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  user_id: number;

  @Column({ unique: true, length: 10 })
  account_number: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 255 })
  password_hash: string;

  @Column({ length: 20, default: 'merchant' })
  role: string; // merchant / admin

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

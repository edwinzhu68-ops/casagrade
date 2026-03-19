import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('users')
@Index(['email'])   // 找回密码用
export class User {
  @PrimaryGeneratedColumn()
  user_id: number;

  @Column({ unique: true, length: 10 })
  account_number: string;

  @Column({ length: 20, nullable: true })
  phone: string;

  @Column({ length: 255, nullable: true })
  email: string | null;

  @Column({ length: 255 })
  password_hash: string;

  @Column({ length: 20, default: 'merchant' })
  role: string; // merchant / admin

  @Column({ length: 64, nullable: true, default: null })
  session_token: string | null;

  @Column({ length: 64, nullable: true, default: null })
  device_id: string | null;

  @Column({ nullable: true, default: null })
  last_login_at: Date | null;

  @Column({ length: 512, nullable: true, default: null })
  last_login_ua: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

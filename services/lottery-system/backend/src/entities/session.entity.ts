import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('sessions')
@Index(['user_id'])
@Index(['token'], { unique: true })
export class Session {
  @PrimaryGeneratedColumn()
  session_id: number;

  @Column()
  user_id: number;

  /** 会话令牌 */
  @Column({ length: 64 })
  token: string;

  /** 设备类型: web / app */
  @Column({ length: 10 })
  device_type: string;

  /** 设备名称(UA简化) */
  @Column({ length: 200, nullable: true })
  device_name: string;

  /** 最后活跃时间 */
  @Column({ type: 'datetime', nullable: true })
  last_active: Date;

  @CreateDateColumn()
  created_at: Date;
}

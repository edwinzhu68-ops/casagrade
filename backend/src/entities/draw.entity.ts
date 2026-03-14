import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('draws')
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

  @CreateDateColumn()
  created_at: Date;
}

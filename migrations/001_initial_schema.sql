-- ============================================
-- 巴拿马华人超市彩票系统 - 数据库 Schema
-- ============================================

-- 1. 超市表 (多租户)
CREATE TABLE shops (
    store_code VARCHAR(5) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 彩票期次表
CREATE TABLE draws (
    draw_id SERIAL PRIMARY KEY,
    draw_date DATE NOT NULL UNIQUE,
    lottery_type VARCHAR(20) NOT NULL,
    winning_numbers VARCHAR(50) NOT NULL,
    bonus_number VARCHAR(5),
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 订单表
CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    store_code VARCHAR(5) NOT NULL REFERENCES shops(store_code),
    customer_name VARCHAR(50),
    customer_phone VARCHAR(20),
    selection JSONB NOT NULL,
    bet_amount DECIMAL(10,2) NOT NULL,
    multiplier INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'Pending',
    verification_code VARCHAR(5) NOT NULL,
    draw_id INTEGER REFERENCES draws(draw_id),
    paid_at TIMESTAMP,
    settled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. 中奖记录
CREATE TABLE winnings (
    win_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id),
    draw_id INTEGER REFERENCES draws(draw_id),
    win_type VARCHAR(20),
    payout_amount DECIMAL(10,2) NOT NULL,
    verified_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_orders_store ON orders(store_code);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_draw ON orders(draw_id);
CREATE INDEX idx_orders_verification ON orders(verification_code);
CREATE INDEX idx_draws_date ON draws(draw_date);

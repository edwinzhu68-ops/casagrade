-- ============================================
// 更新：超市固定抽成模式
-- ============================================

-- 超市表 - 重新定义分润字段
ALTER TABLE shops DROP COLUMN IF EXISTS commission_rate;
ALTER TABLE shops DROP COLUMN IF EXISTS payout_rate;

-- 新增：超市抽成比例（水钱）- 超市所得
ALTER TABLE shops ADD COLUMN shop_rate DECIMAL(5,2) DEFAULT 20.00;  
-- 例如 20% = 超市每单获得销售额的20%

-- 订单表 - 分润金额重新计算
ALTER TABLE orders DROP COLUMN IF EXISTS shop_commission;
ALTER TABLE orders DROP COLUMN IF EXISTS master_revenue;
ALTER TABLE orders DROP COLUMN IF EXISTS win_amount;
ALTER TABLE orders DROP COLUMN IF EXISTS net_payout;

-- 新增：
ALTER TABLE orders ADD COLUMN shop_payout DECIMAL(10,2) DEFAULT 0;   -- 超市固定所得
ALTER TABLE orders ADD COLUMN master_profit DECIMAL(10,2) DEFAULT 0; -- 庄家利润

-- ============================================
// 新的结算逻辑
-- ============================================

/*
新分润计算公式：

顾客投注 $100，超市抽成率 20%：

【场景1：未中奖】
- 超市固定所得 = $100 × 20% = $20
- 庄家利润 = $100 - $20 = $80 ✅ 绿色

【场景2：中奖$500】
- 超市固定所得 = $100 × 20% = $20（不变）
- 庄家利润 = $100 - $20 - $500 = -$400 ❌ 红色（庄家亏损）

庄家看板显示：
| 超市 | 营业额 | 水钱 | 庄家利润 |
|------|--------|------|----------|
| 00001 | $1000 | $200 | $800 🟢 |
| 00002 | $800 | $160 | -$200 🔴 |
*/

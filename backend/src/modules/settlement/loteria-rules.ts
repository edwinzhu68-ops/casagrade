// ============================================
// 巴拿马彩票完整规则 - Billete + Chance
// ============================================

/*
游戏类型：
| 游戏 | 号码范围 | 价格 | 
|------|---------|------|
| Billete | 0000-9999 | $1 |
| Chance | 00-99 | $0.25 |

开奖结果（来自Lotería Nacional）：
- Primer Premio (头奖): 4位数
- Segundo Premio (二奖): 4位数  
- Tercer Premio (三奖): 4位数
*/

// ============================================
// Billete 赔率表
// ============================================

export const BILLETE_RULES = {
  // 四位数
  PRIMER_4: { match: 'primer', digits: 4, prize: 2000, name: '头奖四位' },
  SEGUNDO_4: { match: 'segundo', digits: 4, prize: 600, name: '二奖四位' },
  TERCERO_4: { match: 'tercero', digits: 4, prize: 300, name: '三奖四位' },

  // 三位数 (只算头奖前后三、二三奖后三)
  PRIMER_3_FRONT: { match: 'primer', digits: 3, position: 'front', prize: 50, name: '头奖前三位' },
  PRIMER_3_BACK: { match: 'primer', digits: 3, position: 'back', prize: 50, name: '头奖后三位' },
  SEGUNDO_3_BACK: { match: 'segundo', digits: 3, position: 'back', prize: 20, name: '二奖后三位' },
  TERCERO_3_BACK: { match: 'tercero', digits: 3, position: 'back', prize: 10, name: '三奖后三位' },

  // 两位数
  PRIMER_2_FRONT: { match: 'primer', digits: 2, position: 'front', prize: 3, name: '头奖前两位' },
  PRIMER_2_BACK: { match: 'primer', digits: 2, position: 'back', prize: 3, name: '头奖后两位' },
  SEGUNDO_2_BACK: { match: 'segundo', digits: 2, position: 'back', prize: 2, name: '二奖后两位' },
  TERCERO_2_BACK: { match: 'tercero', digits: 2, position: 'back', prize: 1, name: '三奖后两位' },
};

// ============================================
// Chance 赔率表
// ============================================

export const CHANCE_RULES = {
  PRIMER: { match: 'primer', digits: 2, prize: 14, name: '头奖后两位' },
  SEGUNDO: { match: 'segundo', digits: 2, prize: 3, name: '二奖后两位' },
  TERCERO: { match: 'tercero', digits: 2, prize: 2, name: '三奖后两位' },
};

// ============================================
// 类型定义
// ============================================

export interface DrawResult {
  primer: string;    // 4位头奖
  segundo: string;   // 4位二奖
  tercero: string;  // 4位三奖
}

export interface Bet {
  gameType: 'BILLETE' | 'CHANCE';
  numbers: string;  // Billete: 4位, Chance: 2位
  amount: number;   // 投注金额
}

export interface PayoutResult {
  totalPayout: number;
  wins: BilleteWin[];
}

export interface BilleteWin {
  rule: string;
  prize: number;
  match: string;
}

// ============================================
// 核心计算函数
// ============================================

/**
 * 计算 Billete 中奖金额
 * 
 * @param betNumber 投注的4位号码 (如 "1234")
 * @param draw 开奖结果 {primer, segundo, tercero}
 * @param betAmount 投注金额 ($1的倍数)
 * @returns 总赔付金额
 */
export function calculateBilletePayout(
  betNumber: string, 
  draw: DrawResult, 
  betAmount: number = 1
): PayoutResult {
  const wins: BilleteWin[] = [];
  let totalPayout = 0;

  // 补齐4位
  const num = betNumber.padStart(4, '0').slice(-4);
  const primer = draw.primer.padStart(4, '0').slice(-4);
  const segundo = draw.segundo.padStart(4, '0').slice(-4);
  const tercero = draw.tercero.padStart(4, '0').slice(-4);

  // 1. 四位数判断
  const primerHit = num === primer;
  const segundoHit = num === segundo;
  const terceroHit = num === tercero;

  if (primerHit) {
    // 头奖四位命中：给 2000，不再叠加头奖的三位/两位奖
    wins.push({ rule: '头奖四位', prize: 2000 * betAmount, match: num });
    totalPayout += 2000 * betAmount;
  }
  if (segundoHit) {
    wins.push({ rule: '二奖四位', prize: 600 * betAmount, match: num });
    totalPayout += 600 * betAmount;
  }
  if (terceroHit) {
    wins.push({ rule: '三奖四位', prize: 300 * betAmount, match: num });
    totalPayout += 300 * betAmount;
  }

  // 2. 三位数判断
  // 头奖前三位（仅当没中头奖四位时才给）
  if (!primerHit && num.slice(0, 3) === primer.slice(0, 3)) {
    wins.push({ rule: '头奖前三位', prize: 50 * betAmount, match: num.slice(0, 3) });
    totalPayout += 50 * betAmount;
  }
  // 头奖后三位（仅当没中头奖四位时才给）
  if (!primerHit && num.slice(1, 4) === primer.slice(1, 4)) {
    wins.push({ rule: '头奖后三位', prize: 50 * betAmount, match: num.slice(1, 4) });
    totalPayout += 50 * betAmount;
  }
  // 二奖后三位（仅当没中二奖四位时才给）
  if (!segundoHit && num.slice(1, 4) === segundo.slice(1, 4)) {
    wins.push({ rule: '二奖后三位', prize: 20 * betAmount, match: num.slice(1, 4) });
    totalPayout += 20 * betAmount;
  }
  // 三奖后三位（仅当没中三奖四位时才给）
  if (!terceroHit && num.slice(1, 4) === tercero.slice(1, 4)) {
    wins.push({ rule: '三奖后三位', prize: 10 * betAmount, match: num.slice(1, 4) });
    totalPayout += 10 * betAmount;
  }

  // 3. 两位数判断
  // 头奖前两位（仅当没中头奖四位时才给）
  if (!primerHit && num.slice(0, 2) === primer.slice(0, 2)) {
    wins.push({ rule: '头奖前两位', prize: 3 * betAmount, match: num.slice(0, 2) });
    totalPayout += 3 * betAmount;
  }
  // 头奖后两位（仅当没中头奖四位时才给）
  if (!primerHit && num.slice(2, 4) === primer.slice(2, 4)) {
    wins.push({ rule: '头奖后两位', prize: 3 * betAmount, match: num.slice(2, 4) });
    totalPayout += 3 * betAmount;
  }
  // 二奖后两位（仅当没中二奖四位时才给）
  if (!segundoHit && num.slice(2, 4) === segundo.slice(2, 4)) {
    wins.push({ rule: '二奖后两位', prize: 2 * betAmount, match: num.slice(2, 4) });
    totalPayout += 2 * betAmount;
  }
  // 三奖后两位（仅当没中三奖四位时才给）
  if (!terceroHit && num.slice(2, 4) === tercero.slice(2, 4)) {
    wins.push({ rule: '三奖后两位', prize: 1 * betAmount, match: num.slice(2, 4) });
    totalPayout += 1 * betAmount;
  }

  return { totalPayout, wins };
}

/**
 * 计算 Chance 中奖金额
 * 
 * @param betNumber 投注的2位号码 (如 "12")
 * @param draw 开奖结果
 * @param betAmount 投注金额 ($0.25的倍数)
 * @returns 总赔付金额
 */
export function calculateChancePayout(
  betNumber: string, 
  draw: DrawResult, 
  betAmount: number = 0.25
): number {
  // 只看后两位
  const num = betNumber.slice(-2);
  const primerLast2 = draw.primer.slice(-2);
  const segundoLast2 = draw.segundo.slice(-2);
  const terceroLast2 = draw.tercero.slice(-2);

  if (num === primerLast2) {
    return 14 * (betAmount / 0.25);  // $14 for $0.25 base
  }
  if (num === segundoLast2) {
    return 3 * (betAmount / 0.25);
  }
  if (num === terceroLast2) {
    return 2 * (betAmount / 0.25);
  }
  return 0;
}

/**
 * 验证投注号码
 */
export function validateBet(gameType: 'BILLETE' | 'CHANCE', numbers: string): { valid: boolean; error?: string } {
  if (gameType === 'BILLETE') {
    if (!/^\d{4}$/.test(numbers)) {
      return { valid: false, error: 'Billete需4位数字 (0000-9999)' };
    }
    return { valid: true };
  } else {
    if (!/^\d{2}$/.test(numbers)) {
      return { valid: false, error: 'Chance需2位数字 (00-99)' };
    }
    return { valid: true };
  }
}

/**
 * 示例用法
 */
export function example() {
  // 开奖结果
  const draw: DrawResult = {
    primer: '1234',
    segundo: '5634', 
    tercero: '9934'
  };

  // 买 Billete 1234, $1
  const billeteResult = calculateBilletePayout('1234', draw, 1);
  // 买 Chance 34, $0.25
  const chancePayout = calculateChancePayout('34', draw, 0.25);
}

// ============================================
// Loteria 1-36 简化版工具（用于 SettlementService）
// ============================================

// 合法号码范围（1-36）
export const LOTERIA_NUMBER_RANGE = { min: 1, max: 36 };

export function validateNumbers(numbers: string[]): { valid: boolean; error?: string } {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return { valid: false, error: '至少需要一个号码' };
  }
  for (const raw of numbers) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < LOTERIA_NUMBER_RANGE.min || n > LOTERIA_NUMBER_RANGE.max) {
      return { valid: false, error: `号码必须在 ${LOTERIA_NUMBER_RANGE.min}-${LOTERIA_NUMBER_RANGE.max} 之间` };
    }
  }
  return { valid: true };
}

export interface LoteriaPayout {
  winAmount: number;
  matchedNumbers: string[];
}

/**
 * 简化版 Loteria 赔率计算：
 * - 每个命中的号码，返回 betAmount 的 2 倍（纯占位逻辑，可按实际业务调整）
 */
export function calculatePayout(
  betAmount: number,
  betNumbers: string[],
  winningNumbers: string[]
): LoteriaPayout {
  const matched = betNumbers.filter(n => winningNumbers.includes(n));
  const winAmount = matched.length > 0 ? betAmount * 2 * matched.length : 0;
  return { winAmount, matchedNumbers: matched };
}

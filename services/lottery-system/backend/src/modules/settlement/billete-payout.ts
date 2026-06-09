/**
 * 全国 Lotería 中奖赔付 —— 唯一真源（Single Source of Truth）。
 *
 * 背景：历史上同一套 Billete/Chance 赔付逻辑曾存在 3 份实现：
 *   1) draw.controller.ts 的内联 calcBilletePrizeForOneDraw（手动开奖路径）
 *   2) settlement.service.ts 的私有 calculateBilletePayout（结算按钮路径）
 *   3) loteria-rules.ts 导出的 calculateBilletePayout（未被调用的死代码，规则还不一样）
 * 三份并存极易"改一份漏改另一份"导致两条结算路径对不上账。现合并为本文件的纯函数，
 * 两条路径都调它，并由 billete-payout.test 用十万组随机票校验"新函数 == 旧#1 == 旧#2"。
 *
 * 规则（与历史 #1/#2 数值完全一致）：
 *   Billete（≥4 位号码）：头/二/三奖各取该奖内最高一档，三奖之间叠加；
 *     头奖的"前两位"与"后两位/末位"可叠加。
 *     档位赔率：四位 = exactRates（默认 [2000,600,300]，可被店铺自定义覆盖）；
 *     前三/后三 = [50,20,10]；后两 = [3,2,1]；前两 = [3,0,0]；末位 = [1,0,0]。
 *     奖号自适应位数：≥4 位走完整档位；<4 位仅比后两位。
 *     GORDITO（二三奖 ≤2 位）：仅头奖参与，二三奖跳过。
 *   Chance（2 位号码）：只比一二三奖后两位，三档可叠加，默认赔率 [14,3,2]。
 */

export interface LineWinResult {
  payout: number;
  matches: string[];
}

const onlyDigits = (s: string): string => String(s ?? '').replace(/\D/g, '');

/** Billete 单注赔付。betNum/primer/segundo/tercero 容忍带非数字字符（内部归一化）。 */
export function calcBilleteLineWin(
  betNum: string,
  primer: string,
  segundo: string,
  tercero: string,
  qty: number,
  exactRates: [number, number, number] = [2000, 600, 300],
): LineWinResult {
  const matches: string[] = [];
  let payout = 0;
  const q = Number(qty) || 0;
  if (q <= 0) return { payout: 0, matches };

  const paddedNum = onlyDigits(betNum).slice(-4).padStart(4, '0');
  const p = onlyDigits(primer);
  const s = onlyDigits(segundo);
  const t = onlyDigits(tercero);
  const primerNorm = p.length >= 4 ? p.slice(-4).padStart(4, '0') : null;
  const segundoNorm = s.length >= 4 ? s.slice(-4).padStart(4, '0') : null;
  const terceroNorm = t.length >= 4 ? t.slice(-4).padStart(4, '0') : null;
  // GORDITO：头奖 4 位 + 二三奖 ≤2 位 → 仅头奖参与
  const isGordito = s.length <= 2 && t.length <= 2;

  // 头奖：四位/前三/后三互斥取最高；前两位与后两位/末位可叠加
  if (primerNorm) {
    if (paddedNum === primerNorm) {
      matches.push(`头奖四位 ${paddedNum} x${exactRates[0]}`);
      payout += exactRates[0] * q;
    } else if (paddedNum.slice(0, 3) === primerNorm.slice(0, 3)) {
      matches.push('头奖前三位 x50');
      payout += 50 * q;
    } else if (paddedNum.slice(1, 4) === primerNorm.slice(1, 4)) {
      matches.push('头奖后三位 x50');
      payout += 50 * q;
    } else {
      if (paddedNum.slice(0, 2) === primerNorm.slice(0, 2)) {
        matches.push('头奖前两位 x3');
        payout += 3 * q;
      }
      if (paddedNum.slice(2, 4) === primerNorm.slice(2, 4)) {
        matches.push('头奖后两位 x3');
        payout += 3 * q;
      } else if (paddedNum.slice(-1) === primerNorm.slice(-1)) {
        matches.push('头奖最后一位 x1');
        payout += 1 * q;
      }
    }
  } else if (p.length >= 2) {
    // 头奖号不足 4 位（异常/历史数据）：只比后两位
    if (paddedNum.slice(-2) === p.slice(-2).padStart(2, '0')) {
      matches.push(`头奖后两位 ${p} x3`);
      payout += 3 * q;
    }
  }

  // 二奖：只取最高一档（GORDITO 期不参与）
  if (segundoNorm) {
    if (paddedNum === segundoNorm) {
      matches.push(`二奖四位 ${paddedNum} x${exactRates[1]}`);
      payout += exactRates[1] * q;
    } else if (paddedNum.slice(0, 3) === segundoNorm.slice(0, 3)) {
      matches.push('二奖前三位 x20');
      payout += 20 * q;
    } else if (paddedNum.slice(1, 4) === segundoNorm.slice(1, 4)) {
      matches.push('二奖后三位 x20');
      payout += 20 * q;
    } else if (paddedNum.slice(2, 4) === segundoNorm.slice(2, 4)) {
      matches.push('二奖后两位 x2');
      payout += 2 * q;
    }
  } else if (!isGordito && s.length >= 2) {
    if (paddedNum.slice(-2) === s.slice(-2).padStart(2, '0')) {
      matches.push(`二奖后两位 ${s} x2`);
      payout += 2 * q;
    }
  }

  // 三奖：只取最高一档（GORDITO 期不参与）
  if (terceroNorm) {
    if (paddedNum === terceroNorm) {
      matches.push(`三奖四位 ${paddedNum} x${exactRates[2]}`);
      payout += exactRates[2] * q;
    } else if (paddedNum.slice(0, 3) === terceroNorm.slice(0, 3)) {
      matches.push('三奖前三位 x10');
      payout += 10 * q;
    } else if (paddedNum.slice(1, 4) === terceroNorm.slice(1, 4)) {
      matches.push('三奖后三位 x10');
      payout += 10 * q;
    } else if (paddedNum.slice(2, 4) === terceroNorm.slice(2, 4)) {
      matches.push('三奖后两位 x1');
      payout += 1 * q;
    }
  } else if (!isGordito && t.length >= 2) {
    if (paddedNum.slice(-2) === t.slice(-2).padStart(2, '0')) {
      matches.push(`三奖后两位 ${t} x1`);
      payout += 1 * q;
    }
  }

  return { payout, matches };
}

/** Chance 单注赔付（只比后两位，三档可叠加）。 */
export function calcChanceLineWin(
  betNum: string,
  primer: string,
  segundo: string,
  tercero: string,
  qty: number,
  rates: [number, number, number] = [14, 3, 2],
): LineWinResult {
  const matches: string[] = [];
  let payout = 0;
  const q = Number(qty) || 0;
  if (q <= 0) return { payout: 0, matches };

  const paddedNum = onlyDigits(betNum).slice(-2).padStart(2, '0');
  const p2 = onlyDigits(primer).slice(-2).padStart(2, '0');
  const s2 = onlyDigits(segundo).slice(-2).padStart(2, '0');
  const t2 = onlyDigits(tercero).slice(-2).padStart(2, '0');

  if (paddedNum === p2) { matches.push(`头奖后两位 ${paddedNum} x${rates[0]}`); payout += rates[0] * q; }
  if (paddedNum === s2) { matches.push(`二奖后两位 ${paddedNum} x${rates[1]}`); payout += rates[1] * q; }
  if (paddedNum === t2) { matches.push(`三奖后两位 ${paddedNum} x${rates[2]}`); payout += rates[2] * q; }

  return { payout, matches };
}

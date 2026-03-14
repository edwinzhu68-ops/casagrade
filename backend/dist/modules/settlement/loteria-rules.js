"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOTERIA_NUMBER_RANGE = exports.CHANCE_RULES = exports.BILLETE_RULES = void 0;
exports.calculateBilletePayout = calculateBilletePayout;
exports.calculateChancePayout = calculateChancePayout;
exports.validateBet = validateBet;
exports.example = example;
exports.validateNumbers = validateNumbers;
exports.calculatePayout = calculatePayout;
exports.BILLETE_RULES = {
    PRIMER_4: { match: 'primer', digits: 4, prize: 2000, name: '头奖四位' },
    SEGUNDO_4: { match: 'segundo', digits: 4, prize: 600, name: '二奖四位' },
    TERCERO_4: { match: 'tercero', digits: 4, prize: 300, name: '三奖四位' },
    PRIMER_3_FRONT: { match: 'primer', digits: 3, position: 'front', prize: 50, name: '头奖前三位' },
    PRIMER_3_BACK: { match: 'primer', digits: 3, position: 'back', prize: 50, name: '头奖后三位' },
    SEGUNDO_3_BACK: { match: 'segundo', digits: 3, position: 'back', prize: 20, name: '二奖后三位' },
    TERCERO_3_BACK: { match: 'tercero', digits: 3, position: 'back', prize: 10, name: '三奖后三位' },
    PRIMER_2_FRONT: { match: 'primer', digits: 2, position: 'front', prize: 3, name: '头奖前两位' },
    PRIMER_2_BACK: { match: 'primer', digits: 2, position: 'back', prize: 3, name: '头奖后两位' },
    SEGUNDO_2_BACK: { match: 'segundo', digits: 2, position: 'back', prize: 2, name: '二奖后两位' },
    TERCERO_2_BACK: { match: 'tercero', digits: 2, position: 'back', prize: 1, name: '三奖后两位' },
};
exports.CHANCE_RULES = {
    PRIMER: { match: 'primer', digits: 2, prize: 14, name: '头奖后两位' },
    SEGUNDO: { match: 'segundo', digits: 2, prize: 3, name: '二奖后两位' },
    TERCERO: { match: 'tercero', digits: 2, prize: 2, name: '三奖后两位' },
};
function calculateBilletePayout(betNumber, draw, betAmount = 1) {
    const wins = [];
    let totalPayout = 0;
    const num = betNumber.padStart(4, '0').slice(-4);
    const primer = draw.primer.padStart(4, '0').slice(-4);
    const segundo = draw.segundo.padStart(4, '0').slice(-4);
    const tercero = draw.tercero.padStart(4, '0').slice(-4);
    const primerHit = num === primer;
    const segundoHit = num === segundo;
    const terceroHit = num === tercero;
    if (primerHit) {
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
    if (!primerHit && num.slice(0, 3) === primer.slice(0, 3)) {
        wins.push({ rule: '头奖前三位', prize: 50 * betAmount, match: num.slice(0, 3) });
        totalPayout += 50 * betAmount;
    }
    if (!primerHit && num.slice(1, 4) === primer.slice(1, 4)) {
        wins.push({ rule: '头奖后三位', prize: 50 * betAmount, match: num.slice(1, 4) });
        totalPayout += 50 * betAmount;
    }
    if (!segundoHit && num.slice(1, 4) === segundo.slice(1, 4)) {
        wins.push({ rule: '二奖后三位', prize: 20 * betAmount, match: num.slice(1, 4) });
        totalPayout += 20 * betAmount;
    }
    if (!terceroHit && num.slice(1, 4) === tercero.slice(1, 4)) {
        wins.push({ rule: '三奖后三位', prize: 10 * betAmount, match: num.slice(1, 4) });
        totalPayout += 10 * betAmount;
    }
    if (!primerHit && num.slice(0, 2) === primer.slice(0, 2)) {
        wins.push({ rule: '头奖前两位', prize: 3 * betAmount, match: num.slice(0, 2) });
        totalPayout += 3 * betAmount;
    }
    if (!primerHit && num.slice(2, 4) === primer.slice(2, 4)) {
        wins.push({ rule: '头奖后两位', prize: 3 * betAmount, match: num.slice(2, 4) });
        totalPayout += 3 * betAmount;
    }
    if (!segundoHit && num.slice(2, 4) === segundo.slice(2, 4)) {
        wins.push({ rule: '二奖后两位', prize: 2 * betAmount, match: num.slice(2, 4) });
        totalPayout += 2 * betAmount;
    }
    if (!terceroHit && num.slice(2, 4) === tercero.slice(2, 4)) {
        wins.push({ rule: '三奖后两位', prize: 1 * betAmount, match: num.slice(2, 4) });
        totalPayout += 1 * betAmount;
    }
    return { totalPayout, wins };
}
function calculateChancePayout(betNumber, draw, betAmount = 0.25) {
    const num = betNumber.slice(-2);
    const primerLast2 = draw.primer.slice(-2);
    const segundoLast2 = draw.segundo.slice(-2);
    const terceroLast2 = draw.tercero.slice(-2);
    if (num === primerLast2) {
        return 14 * (betAmount / 0.25);
    }
    if (num === segundoLast2) {
        return 3 * (betAmount / 0.25);
    }
    if (num === terceroLast2) {
        return 2 * (betAmount / 0.25);
    }
    return 0;
}
function validateBet(gameType, numbers) {
    if (gameType === 'BILLETE') {
        if (!/^\d{4}$/.test(numbers)) {
            return { valid: false, error: 'Billete需4位数字 (0000-9999)' };
        }
        return { valid: true };
    }
    else {
        if (!/^\d{2}$/.test(numbers)) {
            return { valid: false, error: 'Chance需2位数字 (00-99)' };
        }
        return { valid: true };
    }
}
function example() {
    const draw = {
        primer: '1234',
        segundo: '5634',
        tercero: '9934'
    };
    const billeteResult = calculateBilletePayout('1234', draw, 1);
    console.log('Billete 1234 中奖:', billeteResult);
    const chancePayout = calculateChancePayout('34', draw, 0.25);
    console.log('Chance 34 中奖:', chancePayout);
}
exports.LOTERIA_NUMBER_RANGE = { min: 1, max: 36 };
function validateNumbers(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) {
        return { valid: false, error: '至少需要一个号码' };
    }
    for (const raw of numbers) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < exports.LOTERIA_NUMBER_RANGE.min || n > exports.LOTERIA_NUMBER_RANGE.max) {
            return { valid: false, error: `号码必须在 ${exports.LOTERIA_NUMBER_RANGE.min}-${exports.LOTERIA_NUMBER_RANGE.max} 之间` };
        }
    }
    return { valid: true };
}
function calculatePayout(betAmount, betNumbers, winningNumbers) {
    const matched = betNumbers.filter(n => winningNumbers.includes(n));
    const winAmount = matched.length > 0 ? betAmount * 2 * matched.length : 0;
    return { winAmount, matchedNumbers: matched };
}
//# sourceMappingURL=loteria-rules.js.map
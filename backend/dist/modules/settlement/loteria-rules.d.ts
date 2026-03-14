export declare const BILLETE_RULES: {
    PRIMER_4: {
        match: string;
        digits: number;
        prize: number;
        name: string;
    };
    SEGUNDO_4: {
        match: string;
        digits: number;
        prize: number;
        name: string;
    };
    TERCERO_4: {
        match: string;
        digits: number;
        prize: number;
        name: string;
    };
    PRIMER_3_FRONT: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
    PRIMER_3_BACK: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
    SEGUNDO_3_BACK: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
    TERCERO_3_BACK: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
    PRIMER_2_FRONT: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
    PRIMER_2_BACK: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
    SEGUNDO_2_BACK: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
    TERCERO_2_BACK: {
        match: string;
        digits: number;
        position: string;
        prize: number;
        name: string;
    };
};
export declare const CHANCE_RULES: {
    PRIMER: {
        match: string;
        digits: number;
        prize: number;
        name: string;
    };
    SEGUNDO: {
        match: string;
        digits: number;
        prize: number;
        name: string;
    };
    TERCERO: {
        match: string;
        digits: number;
        prize: number;
        name: string;
    };
};
export interface DrawResult {
    primer: string;
    segundo: string;
    tercero: string;
}
export interface Bet {
    gameType: 'BILLETE' | 'CHANCE';
    numbers: string;
    amount: number;
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
export declare function calculateBilletePayout(betNumber: string, draw: DrawResult, betAmount?: number): PayoutResult;
export declare function calculateChancePayout(betNumber: string, draw: DrawResult, betAmount?: number): number;
export declare function validateBet(gameType: 'BILLETE' | 'CHANCE', numbers: string): {
    valid: boolean;
    error?: string;
};
export declare function example(): void;
export declare const LOTERIA_NUMBER_RANGE: {
    min: number;
    max: number;
};
export declare function validateNumbers(numbers: string[]): {
    valid: boolean;
    error?: string;
};
export interface LoteriaPayout {
    winAmount: number;
    matchedNumbers: string[];
}
export declare function calculatePayout(betAmount: number, betNumbers: string[], winningNumbers: string[]): LoteriaPayout;

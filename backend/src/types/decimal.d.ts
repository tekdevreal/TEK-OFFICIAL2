declare module 'decimal.js' {
  export default class Decimal {
    constructor(value: number | string | Decimal);
    static isDecimal(obj: any): obj is Decimal;
    toString(): string;
    toFixed(dp?: number, rm?: number): string;
    isZero(): boolean;
  }
}


export class InvalidMoneyAmountError extends Error {
	constructor(reason: string, rawAmount: string) {
		super(`Invalid money amount "${rawAmount}": ${reason}`);
		this.name = "InvalidMoneyAmountError";
	}
}

export class CurrencyMismatchError extends Error {
	constructor(expected: string, received: string) {
		super(`Currency mismatch: expected "${expected}", received "${received}"`);
		this.name = "CurrencyMismatchError";
	}
}

export class NegativeMoneyInputError extends Error {
	constructor(rawAmount: string) {
		super(`Negative amounts are not allowed in this context: "${rawAmount}"`);
		this.name = "NegativeMoneyInputError";
	}
}
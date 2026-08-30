export class InsufficientBalanceError extends Error {
	constructor(walletId: string, attempted: string, available: string) {
		super(
			`Wallet ${walletId} has insufficient balance: attempted to debit ${attempted}, available ${available}`,
		);
		this.name = "InsufficientBalanceError";
	}
}

export class WalletCurrencyMismatchError extends Error {
	constructor(walletId: string, walletCurrency: string, operationCurrency: string) {
		super(
			`Wallet ${walletId} operates in ${walletCurrency}, but received an operation in ${operationCurrency}`,
		);
		this.name = "WalletCurrencyMismatchError";
	}
}

export class InvalidWalletOpeningError extends Error {
	constructor(reason: string) {
		super(`Cannot open wallet: ${reason}`);
		this.name = "InvalidWalletOpeningError";
	}
}
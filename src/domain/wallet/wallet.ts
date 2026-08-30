import { Money, type MoneyProps } from "./money";
import { InsufficientBalanceError, WalletCurrencyMismatchError } from "./wallet.erros";
import { LedgerDirection, WalletLedgerEntry } from "./wallet-ledger-entry";

export interface OpenWalletProps {
	id: string;
	playerId: string;
	initialBalance: Money;
	opening?: {
		transactionId: string;
		ledgerEntryId: string;
	};
	now: Date;
}

export interface OpenWalletResult {
	wallet: Wallet;
	openingEntry: WalletLedgerEntry | null;
}

export interface WalletState {
	id: string;
	playerId: string;
	currency: string;
	balance: MoneyProps;
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface DebitProps {
	money: Money;
	transactionId: string;
	ledgerEntryId: string;
	now: Date;
}

export interface CreditProps {
	money: Money;
	transactionId: string;
	ledgerEntryId: string;
	now: Date;
}

export class Wallet {
	private constructor(
		public readonly id: string,
		public readonly playerId: string,
		public readonly currency: string,
		private _balance: Money,
		private _version: number,
		public readonly createdAt: Date,
		private _updatedAt: Date,
	) { }

	static open(props: OpenWalletProps): OpenWalletResult {
		const currency = props.initialBalance.currency;

		const wallet = new Wallet(
			props.id,
			props.playerId,
			currency,
			props.initialBalance,
			1,
			props.now,
			props.now,
		);

		if (props.initialBalance.isZero()) {
			return { wallet, openingEntry: null };
		}

		if (!props.opening) {
			throw new Error(
				"opening.transactionId and opening.ledgerEntryId are required when initialBalance is greater than zero",
			);
		}

		const openingEntry = WalletLedgerEntry.create({
			id: props.opening.ledgerEntryId,
			walletId: wallet.id,
			transactionId: props.opening.transactionId,
			direction: LedgerDirection.Credit,
			money: props.initialBalance,
			balanceBefore: Money.zero(currency),
			balanceAfter: props.initialBalance,
			createdAt: props.now,
		});

		return { wallet, openingEntry };
	}

	static rehydrate(state: WalletState): Wallet {
		return new Wallet(
			state.id,
			state.playerId,
			state.currency,
			Money.from(state.balance),
			state.version,
			state.createdAt,
			state.updatedAt,
		);
	}

	get balance(): Money {
		return this._balance;
	}

	get version(): number {
		return this._version;
	}

	get updatedAt(): Date {
		return this._updatedAt;
	}

	debit(props: DebitProps): WalletLedgerEntry {
		this.assertSameCurrency(props.money);

		if (this._balance.isLessThan(props.money)) {
			throw new InsufficientBalanceError(
				this.id,
				props.money.toString(),
				this._balance.toString(),
			);
		}

		const balanceBefore = this._balance;
		const balanceAfter = balanceBefore.subtract(props.money);

		const entry = WalletLedgerEntry.create({
			id: props.ledgerEntryId,
			walletId: this.id,
			transactionId: props.transactionId,
			direction: LedgerDirection.Debit,
			money: props.money,
			balanceBefore,
			balanceAfter,
			createdAt: props.now,
		});

		this._balance = balanceAfter;
		this._version += 1;
		this._updatedAt = props.now;

		return entry;
	}

	credit(props: CreditProps): WalletLedgerEntry {
		this.assertSameCurrency(props.money);

		const balanceBefore = this._balance;
		const balanceAfter = balanceBefore.add(props.money);

		const entry = WalletLedgerEntry.create({
			id: props.ledgerEntryId,
			walletId: this.id,
			transactionId: props.transactionId,
			direction: LedgerDirection.Credit,
			money: props.money,
			balanceBefore,
			balanceAfter,
			createdAt: props.now,
		});

		this._balance = balanceAfter;
		this._version += 1;
		this._updatedAt = props.now;

		return entry;
	}

	private assertSameCurrency(money: Money): void {
		if (this.currency !== money.currency) {
			throw new WalletCurrencyMismatchError(this.id, this.currency, money.currency);
		}
	}
}
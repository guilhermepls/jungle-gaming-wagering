import { Money, type MoneyProps } from "./money";

export enum LedgerDirection {
	Debit = "DEBIT",
	Credit = "CREDIT",
}

export interface CreateLedgerEntryProps {
	id: string;
	walletId: string;
	transactionId: string;
	direction: LedgerDirection;
	money: Money;
	balanceBefore: Money;
	balanceAfter: Money;
	createdAt: Date;
}

export interface LedgerEntryState {
	id: string;
	walletId: string;
	transactionId: string;
	direction: LedgerDirection;
	money: MoneyProps;
	balanceBefore: MoneyProps;
	balanceAfter: MoneyProps;
	createdAt: Date;
}

export class UnbalancedLedgerEntryError extends Error {
	constructor(direction: LedgerDirection, before: string, money: string, after: string) {
		super(
			`Ledger entry does not balance: ${direction} of ${money} from ${before} should result in ${after}`,
		);
		this.name = "UnbalancedLedgerEntryError";
	}
}

export class WalletLedgerEntry {
	private constructor(
		public readonly id: string,
		public readonly walletId: string,
		public readonly transactionId: string,
		public readonly direction: LedgerDirection,
		public readonly money: Money,
		public readonly balanceBefore: Money,
		public readonly balanceAfter: Money,
		public readonly createdAt: Date,
	) { }

	static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
		const entry = new WalletLedgerEntry(
			props.id,
			props.walletId,
			props.transactionId,
			props.direction,
			props.money,
			props.balanceBefore,
			props.balanceAfter,
			props.createdAt,
		);

		if (!entry.isBalanced()) {
			throw new UnbalancedLedgerEntryError(
				props.direction,
				props.balanceBefore.toString(),
				props.money.toString(),
				props.balanceAfter.toString(),
			);
		}

		return entry;
	}

	static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
		return new WalletLedgerEntry(
			state.id,
			state.walletId,
			state.transactionId,
			state.direction,
			Money.from(state.money),
			Money.from(state.balanceBefore),
			Money.from(state.balanceAfter),
			state.createdAt,
		);
	}

	isBalanced(): boolean {
		const expected =
			this.direction === LedgerDirection.Credit
				? this.balanceBefore.add(this.money)
				: this.balanceBefore.subtract(this.money);

		return expected.equals(this.balanceAfter);
	}
}
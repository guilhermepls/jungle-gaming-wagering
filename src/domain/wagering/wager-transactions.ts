import { Money, type MoneyProps } from "../wallet/money";
import { FailureCode } from "./failure-code";
import { InvalidTransactionStateError, MissingReferenceError } from "./wager-transaction.errors";

export enum WagerTransactionKind {
	Opening = "OPENING",
	Bet = "BET",
	Win = "WIN",
	Loss = "LOSS",
	Refund = "REFUND",
	Rollback = "ROLLBACK",
}

export enum WagerTransactionStatus {
	Pending = "PENDING",
	PendingReference = "PENDING_REFERENCE",
	Processed = "PROCESSED",
	Rejected = "REJECTED",
	Failed = "FAILED",
}

export enum LedgerDirection {
	Debit = "DEBIT",
	Credit = "CREDIT",
}

const KINDS_REQUIRING_REFERENCE = new Set<WagerTransactionKind>([
	WagerTransactionKind.Refund,
	WagerTransactionKind.Rollback,
]);

const KINDS_NOT_AFFECTING_BALANCE = new Set<WagerTransactionKind>([WagerTransactionKind.Loss]);

const EXTERNALLY_SUBMITTABLE_KINDS = new Set<WagerTransactionKind>([
	WagerTransactionKind.Bet,
	WagerTransactionKind.Win,
	WagerTransactionKind.Loss,
	WagerTransactionKind.Refund,
	WagerTransactionKind.Rollback,
]);

export interface CreateWagerTransactionProps {
	id: string;
	providerId: string;
	externalTransactionId: string;
	idempotencyKey: string;
	payloadHash: string;
	walletId: string;
	playerId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: Money;
	referenceExternalTransactionId?: string;
	createdAt: Date;
}

export interface WagerTransactionState {
	id: string;
	providerId: string;
	externalTransactionId: string;
	idempotencyKey: string;
	payloadHash: string;
	walletId: string;
	playerId: string;
	roundId: string;
	gameId: string;
	kind: WagerTransactionKind;
	money: MoneyProps;
	referenceExternalTransactionId?: string;
	createdAt: Date;
	status: WagerTransactionStatus;
	referenceTransactionId?: string;
	failureCode?: FailureCode;
	processedAt?: Date;
}

export class WagerTransaction {
	private constructor(
		public readonly id: string,
		public readonly providerId: string,
		public readonly externalTransactionId: string,
		public readonly idempotencyKey: string,
		public readonly payloadHash: string,
		public readonly walletId: string,
		public readonly playerId: string,
		public readonly roundId: string,
		public readonly gameId: string,
		public readonly kind: WagerTransactionKind,
		public readonly money: Money,
		public readonly referenceExternalTransactionId: string | undefined,
		public readonly createdAt: Date,
		private _status: WagerTransactionStatus,
		private _referenceTransactionId?: string,
		private _failureCode?: FailureCode,
		private _processedAt?: Date,
	) { }

	static create(props: CreateWagerTransactionProps): WagerTransaction {
		if (props.kind === WagerTransactionKind.Opening) {
			throw new Error(
				"OPENING transactions cannot be submitted externally - they are created internally by Wallet.open()",
			);
		}

		if (!EXTERNALLY_SUBMITTABLE_KINDS.has(props.kind)) {
			throw new Error(`Unknown or non-submittable transaction kind: ${props.kind}`);
		}

		const needsReference = KINDS_REQUIRING_REFERENCE.has(props.kind);

		if (needsReference && !props.referenceExternalTransactionId) {
			throw new MissingReferenceError(props.kind);
		}

		if (!needsReference && props.referenceExternalTransactionId) {
			throw new Error(
				`Transaction kind "${props.kind}" does not accept a referenceExternalTransactionId`,
			);
		}

		return new WagerTransaction(
			props.id,
			props.providerId,
			props.externalTransactionId,
			props.idempotencyKey,
			props.payloadHash,
			props.walletId,
			props.playerId,
			props.roundId,
			props.gameId,
			props.kind,
			props.money,
			props.referenceExternalTransactionId,
			props.createdAt,
			WagerTransactionStatus.Pending,
		);
	}

	static rehydrate(state: WagerTransactionState): WagerTransaction {
		return new WagerTransaction(
			state.id,
			state.providerId,
			state.externalTransactionId,
			state.idempotencyKey,
			state.payloadHash,
			state.walletId,
			state.playerId,
			state.roundId,
			state.gameId,
			state.kind,
			Money.from(state.money),
			state.referenceExternalTransactionId,
			state.createdAt,
			state.status,
			state.referenceTransactionId,
			state.failureCode,
			state.processedAt,
		);
	}

	get status(): WagerTransactionStatus {
		return this._status;
	}

	get referenceTransactionId(): string | undefined {
		return this._referenceTransactionId;
	}

	get failureCode(): FailureCode | undefined {
		return this._failureCode;
	}

	get processedAt(): Date | undefined {
		return this._processedAt;
	}

	markProcessed(referenceTransactionId: string | undefined, at: Date): void {
		this.assertNotTerminal("markProcessed");
		this._status = WagerTransactionStatus.Processed;
		this._referenceTransactionId = referenceTransactionId;
		this._processedAt = at;
	}

	markPendingReference(): void {
		this.assertNotTerminal("markPendingReference");
		this._status = WagerTransactionStatus.PendingReference;
	}

	reject(code: FailureCode): void {
		this.assertNotTerminal("reject");
		this._status = WagerTransactionStatus.Rejected;
		this._failureCode = code;
	}

	fail(code: FailureCode): void {
		this.assertNotTerminal("fail");
		this._status = WagerTransactionStatus.Failed;
		this._failureCode = code;
	}

	isTerminal(): boolean {
		return (
			this._status === WagerTransactionStatus.Processed ||
			this._status === WagerTransactionStatus.Rejected ||
			this._status === WagerTransactionStatus.Failed
		);
	}

	affectsBalance(): boolean {
		return !KINDS_NOT_AFFECTING_BALANCE.has(this.kind);
	}

	requiresReference(): boolean {
		return KINDS_REQUIRING_REFERENCE.has(this.kind);
	}

	matchesPayload(payloadHash: string): boolean {
		return this.payloadHash === payloadHash;
	}

	ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
		switch (this.kind) {
			case WagerTransactionKind.Bet:
				return LedgerDirection.Debit;
			case WagerTransactionKind.Win:
			case WagerTransactionKind.Refund:
				return LedgerDirection.Credit;
			case WagerTransactionKind.Rollback: {
				if (!reference) {
					throw new Error("ROLLBACK requires the referenced transaction to determine direction");
				}
				const originalDirection = reference.ledgerDirectionFor();
				return originalDirection === LedgerDirection.Debit
					? LedgerDirection.Credit
					: LedgerDirection.Debit;
			}
			default:
				throw new Error(`Transaction kind "${this.kind}" has no ledger direction (does not affect balance)`);
		}
	}

	private assertNotTerminal(attemptedTransition: string): void {
		if (this.isTerminal()) {
			throw new InvalidTransactionStateError(this._status, attemptedTransition);
		}
	}
}
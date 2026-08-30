import { WagerTransactionStatus } from "./wager-transactions";

export class MissingReferenceError extends Error {
	constructor(kind: string) {
		super(`Transaction kind "${kind}" requires a referenceExternalTransactionId`);
		this.name = "MissingReferenceError";
	}
}

export class InvalidTransactionStateError extends Error {
	constructor(currentStatus: WagerTransactionStatus, attemptedTransition: string) {
		super(
			`Cannot transition transaction from terminal status "${currentStatus}" via "${attemptedTransition}"`,
		);
		this.name = "InvalidTransactionStateError";
	}
}

export class PayloadConflictError extends Error {
	constructor(idempotencyKey: string) {
		super(`Idempotency key "${idempotencyKey}" was already used with a different payload`);
		this.name = "PayloadConflictError";
	}
}
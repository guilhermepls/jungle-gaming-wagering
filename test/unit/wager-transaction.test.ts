import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/wallet/money";
import { FailureCode } from "../../src/domain/wagering/failure-code";
import {
	InvalidTransactionStateError,
	MissingReferenceError,
} from "../../src/domain/wagering/wager-transaction.errors";
import {
	LedgerDirection,
	WagerTransaction,
	WagerTransactionKind,
	WagerTransactionStatus,
} from "../../src/domain/wagering/wager-transactions";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function buildProps(overrides: Partial<Parameters<typeof WagerTransaction.create>[0]> = {}) {
	return {
		id: "tx-1",
		providerId: "provider-a",
		externalTransactionId: "ext-1",
		idempotencyKey: "provider-a:ext-1",
		payloadHash: "hash-1",
		walletId: "wallet-1",
		playerId: "player-1",
		roundId: "round-1",
		gameId: "fortune-chimp",
		kind: WagerTransactionKind.Bet,
		money: Money.from({ amount: "25.00", currency: "BRL" }),
		createdAt: NOW,
		...overrides,
	};
}

describe("WagerTransaction", () => {
	describe("create()", () => {
		test("creates a BET transaction starting as PENDING, no reference required", () => {
			const tx = WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Bet }));
			expect(tx.status).toBe(WagerTransactionStatus.Pending);
			expect(tx.requiresReference()).toBe(false);
		});

		test("rejects REFUND without a referenceExternalTransactionId", () => {
			expect(() =>
				WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Refund })),
			).toThrow(MissingReferenceError);
		});

		test("rejects ROLLBACK without a referenceExternalTransactionId", () => {
			expect(() =>
				WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Rollback })),
			).toThrow(MissingReferenceError);
		});

		test("accepts REFUND with a referenceExternalTransactionId", () => {
			const tx = WagerTransaction.create(
				buildProps({
					kind: WagerTransactionKind.Refund,
					referenceExternalTransactionId: "ext-bet-1",
				}),
			);
			expect(tx.requiresReference()).toBe(true);
		});

		test("rejects a BET that carries a referenceExternalTransactionId", () => {
			expect(() =>
				WagerTransaction.create(
					buildProps({
						kind: WagerTransactionKind.Bet,
						referenceExternalTransactionId: "should-not-be-here",
					}),
				),
			).toThrow();
		});

		test("rejects submitting OPENING externally", () => {
			expect(() =>
				WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Opening })),
			).toThrow();
		});
	});

	describe("affectsBalance()", () => {
		test("LOSS does not affect balance", () => {
			const tx = WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Loss }));
			expect(tx.affectsBalance()).toBe(false);
		});

		test.each([
			WagerTransactionKind.Bet,
			WagerTransactionKind.Win,
		])("%s affects balance", (kind) => {
			const tx = WagerTransaction.create(buildProps({ kind }));
			expect(tx.affectsBalance()).toBe(true);
		});
	});

	describe("state transitions", () => {
		test("markProcessed() transitions from PENDING to PROCESSED", () => {
			const tx = WagerTransaction.create(buildProps());
			tx.markProcessed(undefined, NOW);
			expect(tx.status).toBe(WagerTransactionStatus.Processed);
			expect(tx.processedAt).toEqual(NOW);
			expect(tx.isTerminal()).toBe(true);
		});

		test("markPendingReference() transitions from PENDING to PENDING_REFERENCE", () => {
			const tx = WagerTransaction.create(
				buildProps({
					kind: WagerTransactionKind.Refund,
					referenceExternalTransactionId: "ext-bet-1",
				}),
			);
			tx.markPendingReference();
			expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
			expect(tx.isTerminal()).toBe(false);
		});

		test("reject() transitions to REJECTED with a failureCode", () => {
			const tx = WagerTransaction.create(buildProps());
			tx.reject(FailureCode.InsufficientBalance);
			expect(tx.status).toBe(WagerTransactionStatus.Rejected);
			expect(tx.failureCode).toBe(FailureCode.InsufficientBalance);
			expect(tx.isTerminal()).toBe(true);
		});

		test("fail() transitions to FAILED with a failureCode", () => {
			const tx = WagerTransaction.create(buildProps());
			tx.fail(FailureCode.InfrastructureError);
			expect(tx.status).toBe(WagerTransactionStatus.Failed);
			expect(tx.failureCode).toBe(FailureCode.InfrastructureError);
			expect(tx.isTerminal()).toBe(true);
		});

		test("PENDING_REFERENCE can still transition to PROCESSED", () => {
			const tx = WagerTransaction.create(
				buildProps({
					kind: WagerTransactionKind.Refund,
					referenceExternalTransactionId: "ext-bet-1",
				}),
			);
			tx.markPendingReference();
			tx.markProcessed("tx-bet-1", NOW);
			expect(tx.status).toBe(WagerTransactionStatus.Processed);
		});

		test("transitioning a terminal transaction throws InvalidTransactionStateError", () => {
			const tx = WagerTransaction.create(buildProps());
			tx.markProcessed(undefined, NOW);

			expect(() => tx.reject(FailureCode.InsufficientBalance)).toThrow(
				InvalidTransactionStateError,
			);
			expect(() => tx.fail(FailureCode.InfrastructureError)).toThrow(
				InvalidTransactionStateError,
			);
			expect(() => tx.markPendingReference()).toThrow(InvalidTransactionStateError);
			expect(() => tx.markProcessed(undefined, NOW)).toThrow(InvalidTransactionStateError);
		});
	});

	describe("matchesPayload()", () => {
		test("returns true for the same payloadHash", () => {
			const tx = WagerTransaction.create(buildProps({ payloadHash: "abc" }));
			expect(tx.matchesPayload("abc")).toBe(true);
		});

		test("returns false for a different payloadHash (conflict, not replay)", () => {
			const tx = WagerTransaction.create(buildProps({ payloadHash: "abc" }));
			expect(tx.matchesPayload("xyz")).toBe(false);
		});
	});

	describe("ledgerDirectionFor()", () => {
		test("BET is a debit", () => {
			const tx = WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Bet }));
			expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
		});

		test("WIN is a credit", () => {
			const tx = WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Win }));
			expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
		});

		test("REFUND is a credit", () => {
			const tx = WagerTransaction.create(
				buildProps({
					kind: WagerTransactionKind.Refund,
					referenceExternalTransactionId: "ext-bet-1",
				}),
			);
			expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
		});

		test("ROLLBACK inverts the referenced transaction's direction (BET -> credit)", () => {
			const bet = WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Bet }));
			const rollback = WagerTransaction.create(
				buildProps({
					kind: WagerTransactionKind.Rollback,
					referenceExternalTransactionId: "ext-1",
				}),
			);
			expect(rollback.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
		});

		test("ROLLBACK inverts the referenced transaction's direction (WIN -> debit)", () => {
			const win = WagerTransaction.create(buildProps({ kind: WagerTransactionKind.Win }));
			const rollback = WagerTransaction.create(
				buildProps({
					kind: WagerTransactionKind.Rollback,
					referenceExternalTransactionId: "ext-1",
				}),
			);
			expect(rollback.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
		});
	});
});
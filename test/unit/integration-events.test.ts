import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/wallet/money";
import { Wallet } from "../../src/domain/wallet/wallet";
import { FailureCode } from "../../src/domain/wagering/failure-code";
import { WagerTransaction, WagerTransactionKind } from "../../src/domain/wagering/wager-transactions";
import { WalletBalanceChanged } from "../../src/domain/messaging/events/wallet-balance-changed.event";
import { WagerTransactionProcessed } from "../../src/domain/messaging/events/wager-transaction-processed.event";
import { WagerTransactionRejected } from "../../src/domain/messaging/events/wager-transaction-rejected.event";
import { WagerTransactionPendingReference } from "../../src/domain/messaging/events/wager-transaction-pending-reference.event";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const CTX = { eventId: "event-1", correlationId: "corr-1", occurredAt: NOW };

function openWallet() {
	return Wallet.open({
		id: "wallet-1",
		playerId: "player-1",
		initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
		opening: { transactionId: "tx-opening", ledgerEntryId: "ledger-opening" },
		now: NOW,
	}).wallet;
}

function buildTx(overrides: Partial<Parameters<typeof WagerTransaction.create>[0]> = {}) {
	return WagerTransaction.create({
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
	});
}

describe("WalletBalanceChanged", () => {
	test("from() maps wallet and ledger entry into a stable envelope", () => {
		const wallet = openWallet();
		const entry = wallet.debit({
			money: Money.from({ amount: "25.00", currency: "BRL" }),
			transactionId: "tx-1",
			ledgerEntryId: "ledger-1",
			now: NOW,
		});

		const event = WalletBalanceChanged.from(wallet, entry, CTX);
		const json = event.toJSON();

		expect(json.eventType).toBe("WalletBalanceChanged");
		expect(json.aggregateId).toBe("wallet-1");
		expect(json.data.balanceAfter).toEqual({ amount: "75.00", currency: "BRL" });
		expect(json.data.walletVersion).toBe(wallet.version);
	});
});

describe("WagerTransactionProcessed", () => {
	test("from() throws if the transaction was never processed", () => {
		const tx = buildTx();
		expect(() => WagerTransactionProcessed.from(tx, CTX)).toThrow();
	});

	test("from() maps a processed transaction into a stable envelope", () => {
		const tx = buildTx();
		tx.markProcessed(undefined, NOW);

		const event = WagerTransactionProcessed.from(tx, CTX);
		const json = event.toJSON();

		expect(json.eventType).toBe("WagerTransactionProcessed");
		expect(json.data.kind).toBe(WagerTransactionKind.Bet);
		expect(json.data.processedAt).toBe(NOW.toISOString());
	});
});

describe("WagerTransactionRejected", () => {
	test("from() throws if the transaction has no failureCode", () => {
		const tx = buildTx();
		expect(() => WagerTransactionRejected.from(tx, CTX)).toThrow();
	});

	test("from() maps a rejected transaction into a stable envelope", () => {
		const tx = buildTx();
		tx.reject(FailureCode.InsufficientBalance);

		const event = WagerTransactionRejected.from(tx, CTX);
		const json = event.toJSON();

		expect(json.eventType).toBe("WagerTransactionRejected");
		expect(json.data.failureCode).toBe(FailureCode.InsufficientBalance);
	});
});

describe("WagerTransactionPendingReference", () => {
	test("from() maps a pending-reference transaction into a stable envelope", () => {
		const tx = buildTx({
			kind: WagerTransactionKind.Refund,
			referenceExternalTransactionId: "ext-bet-1",
		});
		tx.markPendingReference();

		const event = WagerTransactionPendingReference.from(tx, CTX);
		const json = event.toJSON();

		expect(json.eventType).toBe("WagerTransactionPendingReference");
		expect(json.data.referenceExternalTransactionId).toBe("ext-bet-1");
	});
});
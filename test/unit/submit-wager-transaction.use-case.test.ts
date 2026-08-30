import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/wallet/money";
import { Wallet } from "../../src/domain/wallet/wallet";
import type { WalletLedgerEntry } from "../../src/domain/wallet/wallet-ledger-entry";
import {
	WagerTransaction,
	WagerTransactionKind,
	WagerTransactionStatus,
} from "../../src/domain/wagering/wager-transactions";
import { FailureCode } from "../../src/domain/wagering/failure-code";
import {
	WalletVersionConflictError,
	type WalletRepository,
} from "../../src/domain/ports/wallet.repository";
import type { WagerTransactionRepository } from "../../src/domain/ports/wager-transaction.repository";
import type { InboxRepository } from "../../src/domain/ports/inbox.repository";
import type { OutboxRepository } from "../../src/domain/ports/outbox.repository";
import type { TransactionContext, UnitOfWork } from "../../src/domain/ports/unit-of-work";
import type { InboxMessage } from "../../src/domain/messaging/inbox-message";
import type { OutboxMessage } from "../../src/domain/messaging/outbox-message";
import {
	IdempotencyPayloadConflictError,
	SubmitWagerTransactionUseCase,
} from "../../src/application/wagering/submit-wager-transaction.use-case";

const NOW = new Date("2026-08-30T12:00:00.000Z");

class FixedClock {
	now(): Date {
		return NOW;
	}
}

class SequentialIdGenerator {
	private counter = 0;
	generate(): string {
		this.counter += 1;
		return `id-${this.counter}`;
	}
}

class InMemoryWalletRepository implements WalletRepository {
	private byId = new Map<string, Wallet>();
	public forceConflictOnce: Set<string> = new Set();

	seed(wallet: Wallet) {
		this.byId.set(wallet.id, wallet);
	}

	async findById(id: string): Promise<Wallet | null> {
		const w = this.byId.get(id);
		if (!w) return null;
		return Wallet.rehydrate({
			id: w.id,
			playerId: w.playerId,
			currency: w.currency,
			balance: w.balance.toJSON(),
			version: w.version,
			createdAt: w.createdAt,
			updatedAt: w.updatedAt,
		});
	}

	async findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
		for (const w of this.byId.values()) {
			if (w.playerId === playerId && w.currency === currency) return w;
		}
		return null;
	}

	async insert(wallet: Wallet): Promise<void> {
		this.byId.set(wallet.id, wallet);
	}

	async update(wallet: Wallet, _entry: WalletLedgerEntry, expectedVersion: number): Promise<void> {
		if (this.forceConflictOnce.has(wallet.id)) {
			this.forceConflictOnce.delete(wallet.id);
			throw new WalletVersionConflictError(wallet.id);
		}
		const current = this.byId.get(wallet.id);
		if (!current || current.version !== expectedVersion) {
			throw new WalletVersionConflictError(wallet.id);
		}
		this.byId.set(wallet.id, wallet);
	}
}

class InMemoryWagerTransactionRepository implements WagerTransactionRepository {
	public byId = new Map<string, WagerTransaction>();

	async findById(id: string) {
		return this.byId.get(id) ?? null;
	}

	async findByIdempotencyKey(key: string) {
		for (const tx of this.byId.values()) {
			if (tx.idempotencyKey === key) return tx;
		}
		return null;
	}

	async findByProviderAndExternalId(providerId: string, externalTransactionId: string) {
		for (const tx of this.byId.values()) {
			if (tx.providerId === providerId && tx.externalTransactionId === externalTransactionId) {
				return tx;
			}
		}
		return null;
	}

	async findProcessedReversal(
		providerId: string,
		referenceExternalTransactionId: string,
		kind: WagerTransactionKind,
	) {
		for (const tx of this.byId.values()) {
			if (
				tx.providerId === providerId &&
				tx.referenceExternalTransactionId === referenceExternalTransactionId &&
				tx.kind === kind &&
				tx.status === WagerTransactionStatus.Processed
			) {
				return tx;
			}
		}
		return null;
	}

	async insert(tx: WagerTransaction) {
		this.byId.set(tx.id, tx);
	}

	async update(tx: WagerTransaction) {
		this.byId.set(tx.id, tx);
	}

	async findDuePendingReference(): Promise<WagerTransaction[]> {
		return [];
	}
}

class InMemoryInboxRepository implements InboxRepository {
	async findByConsumerAndMessageId(): Promise<InboxMessage | null> {
		return null;
	}
	async insert(): Promise<void> { }
}

class InMemoryOutboxRepository implements OutboxRepository {
	public messages: OutboxMessage[] = [];
	async enqueue(message: OutboxMessage) {
		this.messages.push(message);
	}
	async findDue(): Promise<OutboxMessage[]> {
		return [];
	}
	async markPublished(): Promise<void> { }
	async scheduleRetry(): Promise<void> { }
}

class InMemoryUnitOfWork implements UnitOfWork {
	constructor(private readonly ctx: TransactionContext) { }

	async withTransaction<T>(work: (ctx: TransactionContext) => Promise<T>): Promise<T> {
		const txRepo = this.ctx.wagerTransactions as InMemoryWagerTransactionRepository;
		const snapshot = new Map(txRepo.byId);
		try {
			return await work(this.ctx);
		} catch (err) {
			txRepo.byId = snapshot;
			throw err;
		}
	}
}

function buildHarness() {
	const wallets = new InMemoryWalletRepository();
	const wagerTransactions = new InMemoryWagerTransactionRepository();
	const inbox = new InMemoryInboxRepository();
	const outbox = new InMemoryOutboxRepository();
	const uow = new InMemoryUnitOfWork({ wallets, wagerTransactions, inbox, outbox });
	const useCase = new SubmitWagerTransactionUseCase(uow, new FixedClock(), new SequentialIdGenerator());

	const wallet = Wallet.open({
		id: "wallet-1",
		playerId: "player-1",
		initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
		opening: { transactionId: "tx-opening", ledgerEntryId: "ledger-opening" },
		now: NOW,
	}).wallet;
	wallets.seed(wallet);

	return { wallets, wagerTransactions, outbox, useCase };
}

describe("SubmitWagerTransactionUseCase", () => {
	test("processes a BET within balance and enqueues events", async () => {
		const { useCase, outbox } = buildHarness();

		const result = await useCase.execute({
			providerId: "provider-a",
			externalTransactionId: "ext-1",
			idempotencyKey: "provider-a:ext-1",
			payloadHash: "hash-1",
			playerId: "player-1",
			walletId: "wallet-1",
			roundId: "round-1",
			gameId: "fortune-chimp",
			kind: WagerTransactionKind.Bet,
			money: { amount: "25.00", currency: "BRL" },
			correlationId: "corr-1",
		});

		expect(result.status).toBe(WagerTransactionStatus.Processed);
		expect(result.balance).toEqual({ amount: "75.00", currency: "BRL" });
		expect(result.idempotentReplay).toBe(false);
		expect(outbox.messages.some((m) => m.eventType === "WalletBalanceChanged")).toBe(true);
		expect(outbox.messages.some((m) => m.eventType === "WagerTransactionProcessed")).toBe(true);
	});

	test("rejects a BET larger than available balance", async () => {
		const { useCase } = buildHarness();

		const result = await useCase.execute({
			providerId: "provider-a",
			externalTransactionId: "ext-1",
			idempotencyKey: "provider-a:ext-1",
			payloadHash: "hash-1",
			playerId: "player-1",
			walletId: "wallet-1",
			roundId: "round-1",
			gameId: "fortune-chimp",
			kind: WagerTransactionKind.Bet,
			money: { amount: "200.00", currency: "BRL" },
			correlationId: "corr-1",
		});

		expect(result.status).toBe(WagerTransactionStatus.Rejected);
		expect(result.failureCode).toBe(FailureCode.InsufficientBalance);
	});

	test("replays an identical request idempotently", async () => {
		const { useCase } = buildHarness();
		const cmd = {
			providerId: "provider-a",
			externalTransactionId: "ext-1",
			idempotencyKey: "provider-a:ext-1",
			payloadHash: "hash-1",
			playerId: "player-1",
			walletId: "wallet-1",
			roundId: "round-1",
			gameId: "fortune-chimp",
			kind: WagerTransactionKind.Bet,
			money: { amount: "25.00", currency: "BRL" },
			correlationId: "corr-1",
		};

		const first = await useCase.execute(cmd);
		const second = await useCase.execute(cmd);

		expect(second.idempotentReplay).toBe(true);
		expect(second.transactionId).toBe(first.transactionId);
		expect(second.balance).toEqual(first.balance);
	});

	test("rejects the same idempotency key with a different payload", async () => {
		const { useCase } = buildHarness();
		const base = {
			providerId: "provider-a",
			externalTransactionId: "ext-1",
			idempotencyKey: "provider-a:ext-1",
			playerId: "player-1",
			walletId: "wallet-1",
			roundId: "round-1",
			gameId: "fortune-chimp",
			kind: WagerTransactionKind.Bet as const,
			correlationId: "corr-1",
		};

		await useCase.execute({ ...base, payloadHash: "hash-1", money: { amount: "25.00", currency: "BRL" } });

		await expect(
			useCase.execute({ ...base, payloadHash: "hash-2", money: { amount: "30.00", currency: "BRL" } }),
		).rejects.toThrow(IdempotencyPayloadConflictError);
	});

	test("parks a REFUND with no matching reference as PENDING_REFERENCE", async () => {
		const { useCase } = buildHarness();

		const result = await useCase.execute({
			providerId: "provider-a",
			externalTransactionId: "ext-refund-1",
			idempotencyKey: "provider-a:ext-refund-1",
			payloadHash: "hash-1",
			playerId: "player-1",
			walletId: "wallet-1",
			roundId: "round-1",
			gameId: "fortune-chimp",
			kind: WagerTransactionKind.Refund,
			money: { amount: "25.00", currency: "BRL" },
			referenceExternalTransactionId: "ext-bet-not-found",
			correlationId: "corr-1",
		});

		expect(result.status).toBe(WagerTransactionStatus.PendingReference);
	});

	test("retries once on a version conflict and succeeds on the second attempt", async () => {
		const { useCase, wallets } = buildHarness();
		wallets.forceConflictOnce.add("wallet-1");

		const result = await useCase.execute({
			providerId: "provider-a",
			externalTransactionId: "ext-1",
			idempotencyKey: "provider-a:ext-1",
			payloadHash: "hash-1",
			playerId: "player-1",
			walletId: "wallet-1",
			roundId: "round-1",
			gameId: "fortune-chimp",
			kind: WagerTransactionKind.Bet,
			money: { amount: "25.00", currency: "BRL" },
			correlationId: "corr-1",
		});

		expect(result.status).toBe(WagerTransactionStatus.Processed);
		expect(result.balance).toEqual({ amount: "75.00", currency: "BRL" });
	});
});
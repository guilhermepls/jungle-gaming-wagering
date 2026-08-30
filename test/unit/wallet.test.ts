import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/wallet/money";
import { Wallet } from "../../src/domain/wallet/wallet";
import {
	InsufficientBalanceError,
	WalletCurrencyMismatchError,
} from "../../src/domain/wallet/wallet.errors";
import { LedgerDirection } from "../../src/domain/wallet/wallet-ledger-entry";

const NOW = new Date("2026-08-30T12:00:00.000Z");

describe("Wallet", () => {
	describe("open()", () => {
		test("opens with zero initial balance and no opening entry", () => {
			const { wallet, openingEntry } = Wallet.open({
				id: "wallet-1",
				playerId: "player-1",
				initialBalance: Money.zero("BRL"),
				now: NOW,
			});

			expect(wallet.balance.toJSON()).toEqual({ amount: "0.00", currency: "BRL" });
			expect(wallet.version).toBe(1);
			expect(openingEntry).toBeNull();
		});

		test("opens with positive initial balance and produces a CREDIT opening entry", () => {
			const { wallet, openingEntry } = Wallet.open({
				id: "wallet-1",
				playerId: "player-1",
				initialBalance: Money.from({ amount: "1000.00", currency: "BRL" }),
				opening: { transactionId: "tx-opening-1", ledgerEntryId: "ledger-1" },
				now: NOW,
			});

			expect(wallet.balance.toJSON()).toEqual({ amount: "1000.00", currency: "BRL" });
			expect(wallet.version).toBe(1);
			expect(openingEntry).not.toBeNull();
			expect(openingEntry?.direction).toBe(LedgerDirection.Credit);
			expect(openingEntry?.balanceBefore.toJSON()).toEqual({ amount: "0.00", currency: "BRL" });
			expect(openingEntry?.balanceAfter.toJSON()).toEqual({ amount: "1000.00", currency: "BRL" });
		});

		test("throws if positive initial balance but no opening reference provided", () => {
			expect(() =>
				Wallet.open({
					id: "wallet-1",
					playerId: "player-1",
					initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
					now: NOW,
				}),
			).toThrow();
		});
	});

	describe("rehydrate()", () => {
		test("reconstructs a wallet from persisted state without revalidating", () => {
			const wallet = Wallet.rehydrate({
				id: "wallet-1",
				playerId: "player-1",
				currency: "BRL",
				balance: { amount: "500.00", currency: "BRL" },
				version: 7,
				createdAt: NOW,
				updatedAt: NOW,
			});

			expect(wallet.balance.toJSON()).toEqual({ amount: "500.00", currency: "BRL" });
			expect(wallet.version).toBe(7);
		});
	});

	describe("debit()", () => {
		function openWallet(initial = "100.00") {
			return Wallet.open({
				id: "wallet-1",
				playerId: "player-1",
				initialBalance: Money.from({ amount: initial, currency: "BRL" }),
				opening: { transactionId: "tx-opening-1", ledgerEntryId: "ledger-opening-1" },
				now: NOW,
			}).wallet;
		}

		test("debits an amount within balance and returns a balanced ledger entry", () => {
			const wallet = openWallet("100.00");

			const entry = wallet.debit({
				money: Money.from({ amount: "25.00", currency: "BRL" }),
				transactionId: "tx-bet-1",
				ledgerEntryId: "ledger-1",
				now: NOW,
			});

			expect(wallet.balance.toJSON()).toEqual({ amount: "75.00", currency: "BRL" });
			expect(wallet.version).toBe(2);
			expect(entry.direction).toBe(LedgerDirection.Debit);
			expect(entry.balanceBefore.toJSON()).toEqual({ amount: "100.00", currency: "BRL" });
			expect(entry.balanceAfter.toJSON()).toEqual({ amount: "75.00", currency: "BRL" });
			expect(entry.isBalanced()).toBe(true);
		});

		test("rejects a debit larger than the available balance", () => {
			const wallet = openWallet("50.00");

			expect(() =>
				wallet.debit({
					money: Money.from({ amount: "80.00", currency: "BRL" }),
					transactionId: "tx-bet-1",
					ledgerEntryId: "ledger-1",
					now: NOW,
				}),
			).toThrow(InsufficientBalanceError);

			expect(wallet.balance.toJSON()).toEqual({ amount: "50.00", currency: "BRL" });
			expect(wallet.version).toBe(1);
		});

		test("rejects a debit in a different currency", () => {
			const wallet = openWallet("100.00");

			expect(() =>
				wallet.debit({
					money: Money.from({ amount: "10.00", currency: "USD" }),
					transactionId: "tx-bet-1",
					ledgerEntryId: "ledger-1",
					now: NOW,
				}),
			).toThrow(WalletCurrencyMismatchError);
		});

		test("allows debiting the exact available balance down to zero", () => {
			const wallet = openWallet("50.00");

			const entry = wallet.debit({
				money: Money.from({ amount: "50.00", currency: "BRL" }),
				transactionId: "tx-bet-1",
				ledgerEntryId: "ledger-1",
				now: NOW,
			});

			expect(wallet.balance.isZero()).toBe(true);
			expect(entry.balanceAfter.isZero()).toBe(true);
		});
	});

	describe("credit()", () => {
		function openWallet(initial = "100.00") {
			return Wallet.open({
				id: "wallet-1",
				playerId: "player-1",
				initialBalance: Money.from({ amount: initial, currency: "BRL" }),
				opening: { transactionId: "tx-opening-1", ledgerEntryId: "ledger-opening-1" },
				now: NOW,
			}).wallet;
		}

		test("credits an amount and returns a balanced ledger entry", () => {
			const wallet = openWallet("100.00");

			const entry = wallet.credit({
				money: Money.from({ amount: "30.00", currency: "BRL" }),
				transactionId: "tx-win-1",
				ledgerEntryId: "ledger-2",
				now: NOW,
			});

			expect(wallet.balance.toJSON()).toEqual({ amount: "130.00", currency: "BRL" });
			expect(wallet.version).toBe(2);
			expect(entry.direction).toBe(LedgerDirection.Credit);
			expect(entry.isBalanced()).toBe(true);
		});

		test("rejects a credit in a different currency", () => {
			const wallet = openWallet("100.00");

			expect(() =>
				wallet.credit({
					money: Money.from({ amount: "10.00", currency: "USD" }),
					transactionId: "tx-win-1",
					ledgerEntryId: "ledger-2",
					now: NOW,
				}),
			).toThrow(WalletCurrencyMismatchError);
		});
	});

	describe("version increments only when balance changes", () => {
		test("consecutive debits and credits increment version each time", () => {
			const wallet = Wallet.open({
				id: "wallet-1",
				playerId: "player-1",
				initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
				opening: { transactionId: "tx-opening-1", ledgerEntryId: "ledger-opening-1" },
				now: NOW,
			}).wallet;

			expect(wallet.version).toBe(1);

			wallet.debit({
				money: Money.from({ amount: "10.00", currency: "BRL" }),
				transactionId: "tx-1",
				ledgerEntryId: "ledger-1",
				now: NOW,
			});
			expect(wallet.version).toBe(2);

			wallet.credit({
				money: Money.from({ amount: "5.00", currency: "BRL" }),
				transactionId: "tx-2",
				ledgerEntryId: "ledger-2",
				now: NOW,
			});
			expect(wallet.version).toBe(3);
		});
	});
});
import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/wallet/money";
import {
	CurrencyMismatchError,
	InvalidMoneyAmountError,
	NegativeMoneyInputError,
} from "../../src/domain/wallet/money.errors";

describe("Money", () => {
	test("creates a valid Money from a decimal string", () => {
		const money = Money.from({ amount: "25.00", currency: "brl" });

		expect(money.toJSON()).toEqual({ amount: "25.00", currency: "BRL" });
	});

	test("normalizes currency to uppercase", () => {
		const money = Money.from({ amount: "10.00", currency: "brl" });
		expect(money.currency).toBe("BRL");
	});

	test("zero() creates a zero-value Money", () => {
		const zero = Money.zero("BRL");
		expect(zero.isZero()).toBe(true);
	});

	describe("invalid inputs are rejected", () => {
		test.each([
			["NaN", "NaN"],
			["Infinity", "Infinity"],
			["scientific notation", "1e10"],
			["empty string", ""],
			["more than 2 decimal places", "25.005"],
			["letters", "abc"],
			["negative amount", "-25.00"],
		])("rejects %s", (_label: string, rawAmount: string) => {
			expect(() => Money.from({ amount: rawAmount, currency: "BRL" })).toThrow();
		});

		test("rejects negative amount specifically with NegativeMoneyInputError", () => {
			expect(() => Money.from({ amount: "-25.00", currency: "BRL" })).toThrow(
				NegativeMoneyInputError,
			);
		});

		test("rejects malformed amount with InvalidMoneyAmountError", () => {
			expect(() => Money.from({ amount: "abc", currency: "BRL" })).toThrow(
				InvalidMoneyAmountError,
			);
		});

		test("rejects invalid currency code", () => {
			expect(() => Money.from({ amount: "10.00", currency: "X" })).toThrow(
				InvalidMoneyAmountError,
			);
		});
	});

	describe("arithmetic", () => {
		test("add() sums two Money of the same currency", () => {
			const a = Money.from({ amount: "10.00", currency: "BRL" });
			const b = Money.from({ amount: "5.50", currency: "BRL" });

			expect(a.add(b).toJSON()).toEqual({ amount: "15.50", currency: "BRL" });
		});

		test("subtract() subtracts two Money of the same currency", () => {
			const a = Money.from({ amount: "10.00", currency: "BRL" });
			const b = Money.from({ amount: "3.00", currency: "BRL" });

			expect(a.subtract(b).toJSON()).toEqual({ amount: "7.00", currency: "BRL" });
		});

		test("subtract() can produce a negative internal result (used by domain, e.g. rollback math)", () => {
			const a = Money.from({ amount: "5.00", currency: "BRL" });
			const b = Money.from({ amount: "10.00", currency: "BRL" });

			const result = a.subtract(b);
			expect(result.isNegative()).toBe(true);
			expect(result.toJSON()).toEqual({ amount: "-5.00", currency: "BRL" });
		});

		test("negate() flips the sign", () => {
			const a = Money.from({ amount: "10.00", currency: "BRL" });
			expect(a.negate().toJSON()).toEqual({ amount: "-10.00", currency: "BRL" });
		});

		test("is immutable: operations never mutate the original instance", () => {
			const a = Money.from({ amount: "10.00", currency: "BRL" });
			const b = Money.from({ amount: "5.00", currency: "BRL" });

			a.add(b);

			expect(a.toJSON()).toEqual({ amount: "10.00", currency: "BRL" });
		});
	});

	describe("currency mismatch", () => {
		test("add() throws CurrencyMismatchError for different currencies", () => {
			const brl = Money.from({ amount: "10.00", currency: "BRL" });
			const usd = Money.from({ amount: "10.00", currency: "USD" });

			expect(() => brl.add(usd)).toThrow(CurrencyMismatchError);
		});

		test("subtract() throws CurrencyMismatchError for different currencies", () => {
			const brl = Money.from({ amount: "10.00", currency: "BRL" });
			const usd = Money.from({ amount: "10.00", currency: "USD" });

			expect(() => brl.subtract(usd)).toThrow(CurrencyMismatchError);
		});

		test("isLessThan() throws CurrencyMismatchError for different currencies", () => {
			const brl = Money.from({ amount: "10.00", currency: "BRL" });
			const usd = Money.from({ amount: "10.00", currency: "USD" });

			expect(() => brl.isLessThan(usd)).toThrow(CurrencyMismatchError);
		});
	});

	describe("comparisons", () => {
		test("equals() returns true for same amount and currency", () => {
			const a = Money.from({ amount: "10.00", currency: "BRL" });
			const b = Money.from({ amount: "10.00", currency: "BRL" });
			expect(a.equals(b)).toBe(true);
		});

		test("isLessThan() compares correctly", () => {
			const a = Money.from({ amount: "5.00", currency: "BRL" });
			const b = Money.from({ amount: "10.00", currency: "BRL" });
			expect(a.isLessThan(b)).toBe(true);
			expect(b.isLessThan(a)).toBe(false);
		});
	});
});
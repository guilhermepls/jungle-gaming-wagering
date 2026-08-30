import Decimal from "decimal.js";
import {
	CurrencyMismatchError,
	InvalidMoneyAmountError,
	NegativeMoneyInputError,
} from "./money.errors";

export interface MoneyProps {
	amount: string;
	currency: string;
}

const DECIMAL_PLACES = 2;
const AMOUNT_FORMAT = /^-?\d+(\.\d{1,2})?$/;

export class Money {
	private constructor(
		private readonly value: Decimal,
		public readonly currency: string,
	) { }

	static from(props: MoneyProps): Money {
		const rawAmount = props.amount;

		if (typeof rawAmount !== "string" || rawAmount.trim() === "") {
			throw new InvalidMoneyAmountError("amount must be a non-empty string", String(rawAmount));
		}

		if (!AMOUNT_FORMAT.test(rawAmount)) {
			throw new InvalidMoneyAmountError(
				"amount must be a plain decimal string with at most 2 decimal places (no scientific notation)",
				rawAmount,
			);
		}

		if (!props.currency || props.currency.trim().length !== 3) {
			throw new InvalidMoneyAmountError(
				"currency must be a 3-letter ISO-4217 code",
				rawAmount,
			);
		}

		const decimal = new Decimal(rawAmount).toDecimalPlaces(DECIMAL_PLACES);

		if (decimal.isNegative()) {
			throw new NegativeMoneyInputError(rawAmount);
		}

		return new Money(decimal, props.currency.toUpperCase());
	}

	static zero(currency: string): Money {
		return Money.from({ amount: "0.00", currency });
	}

	private static fromDecimal(value: Decimal, currency: string): Money {
		return new Money(value.toDecimalPlaces(DECIMAL_PLACES), currency);
	}

	add(other: Money): Money {
		this.assertSameCurrency(other);
		return Money.fromDecimal(this.value.plus(other.value), this.currency);
	}

	subtract(other: Money): Money {
		this.assertSameCurrency(other);
		return Money.fromDecimal(this.value.minus(other.value), this.currency);
	}

	negate(): Money {
		return Money.fromDecimal(this.value.negated(), this.currency);
	}

	isZero(): boolean {
		return this.value.isZero();
	}

	isPositive(): boolean {
		return this.value.isPositive() && !this.value.isZero();
	}

	isNegative(): boolean {
		return this.value.isNegative();
	}

	isLessThan(other: Money): boolean {
		this.assertSameCurrency(other);
		return this.value.lessThan(other.value);
	}

	equals(other: Money): boolean {
		return this.currency === other.currency && this.value.equals(other.value);
	}

	toJSON(): MoneyProps {
		return {
			amount: this.value.toFixed(DECIMAL_PLACES),
			currency: this.currency,
		};
	}

	toString(): string {
		return `${this.value.toFixed(DECIMAL_PLACES)} ${this.currency}`;
	}

	private assertSameCurrency(other: Money): void {
		if (this.currency !== other.currency) {
			throw new CurrencyMismatchError(this.currency, other.currency);
		}
	}
}
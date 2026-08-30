import type { MoneyProps } from "../../wallet/money";
import type { FailureCode } from "../../wagering/failure-code";
import type { WagerTransaction, WagerTransactionKind } from "../../wagering/wager-transactions";
import { IntegrationEvent } from "../integration-event";
import type { EventContext } from "./wallet-balance-changed.event";

export interface WagerTransactionRejectedData {
	transactionId: string;
	providerId: string;
	externalTransactionId: string;
	walletId: string;
	playerId: string;
	roundId: string;
	kind: WagerTransactionKind;
	money: MoneyProps;
	failureCode: FailureCode;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
	readonly eventType = "WagerTransactionRejected";
	readonly version = 1;

	private constructor(props: {
		eventId: string;
		aggregateId: string;
		correlationId: string;
		causationId?: string;
		occurredAt: Date;
		data: WagerTransactionRejectedData;
	}) {
		super(props);
	}

	static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
		if (!tx.failureCode) {
			throw new Error("Cannot build WagerTransactionRejected from a transaction with no failureCode");
		}

		return new WagerTransactionRejected({
			eventId: ctx.eventId,
			aggregateId: tx.id,
			correlationId: ctx.correlationId,
			causationId: ctx.causationId,
			occurredAt: ctx.occurredAt,
			data: {
				transactionId: tx.id,
				providerId: tx.providerId,
				externalTransactionId: tx.externalTransactionId,
				walletId: tx.walletId,
				playerId: tx.playerId,
				roundId: tx.roundId,
				kind: tx.kind,
				money: tx.money.toJSON(),
				failureCode: tx.failureCode,
			},
		});
	}
}
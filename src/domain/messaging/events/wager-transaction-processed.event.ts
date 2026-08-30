import type { MoneyProps } from "../../wallet/money";
import type { WagerTransaction, WagerTransactionKind } from "../../wagering/wager-transactions";
import { IntegrationEvent } from "../integration-event";
import type { EventContext } from "./wallet-balance-changed.event";

export interface WagerTransactionProcessedData {
	transactionId: string;
	providerId: string;
	externalTransactionId: string;
	walletId: string;
	playerId: string;
	roundId: string;
	kind: WagerTransactionKind;
	money: MoneyProps;
	referenceTransactionId?: string;
	processedAt: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
	readonly eventType = "WagerTransactionProcessed";
	readonly version = 1;

	private constructor(props: {
		eventId: string;
		aggregateId: string;
		correlationId: string;
		causationId?: string;
		occurredAt: Date;
		data: WagerTransactionProcessedData;
	}) {
		super(props);
	}

	static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
		if (!tx.processedAt) {
			throw new Error("Cannot build WagerTransactionProcessed from a transaction with no processedAt");
		}

		return new WagerTransactionProcessed({
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
				referenceTransactionId: tx.referenceTransactionId,
				processedAt: tx.processedAt.toISOString(),
			},
		});
	}
}
import type { MoneyProps } from "../../wallet/money";
import type { WagerTransaction, WagerTransactionKind } from "../../wagering/wager-transactions";
import { IntegrationEvent } from "../integration-event";
import type { EventContext } from "./wallet-balance-changed.event";

export interface WagerTransactionPendingReferenceData {
	transactionId: string;
	providerId: string;
	externalTransactionId: string;
	walletId: string;
	kind: WagerTransactionKind;
	money: MoneyProps;
	referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
	readonly eventType = "WagerTransactionPendingReference";
	readonly version = 1;

	private constructor(props: {
		eventId: string;
		aggregateId: string;
		correlationId: string;
		causationId?: string;
		occurredAt: Date;
		data: WagerTransactionPendingReferenceData;
	}) {
		super(props);
	}

	static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionPendingReference {
		if (!tx.referenceExternalTransactionId) {
			throw new Error(
				"Cannot build WagerTransactionPendingReference from a transaction with no referenceExternalTransactionId",
			);
		}

		return new WagerTransactionPendingReference({
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
				kind: tx.kind,
				money: tx.money.toJSON(),
				referenceExternalTransactionId: tx.referenceExternalTransactionId,
			},
		});
	}
}
import type { UnitOfWork, TransactionContext } from "../../domain/ports/unit-of-work";
import type { Clock } from "../../shared/clock";
import type { IdGenerator } from "../../shared/id-generator";
import type { SubmitWagerTransactionUseCase } from "./submit-wager-transaction.use-case";

export class ReprocessPendingReferenceUseCase {
	constructor(
		private readonly uow: UnitOfWork,
		private readonly clock: Clock,
		private readonly idGenerator: IdGenerator,
		private readonly submitWagerUseCase: SubmitWagerTransactionUseCase,
	) { }

	async execute(limit = 50): Promise<number> {
		const now = this.clock.now();

		const pendingList = await this.uow.withTransaction(async (ctx: TransactionContext) => {
			return ctx.wagerTransactions.findDuePendingReference(now, limit);
		});

		let reprocessedCount = 0;

		for (const pendingTx of pendingList) {
			if (!pendingTx.referenceExternalTransactionId) continue;

			const hasReference = await this.uow.withTransaction(async (ctx: TransactionContext) => {
				const ref = await ctx.wagerTransactions.findByProviderAndExternalId(
					pendingTx.providerId,
					pendingTx.referenceExternalTransactionId!,
				);
				return ref !== null;
			});

			if (!hasReference) continue;

			await this.submitWagerUseCase.execute({
				providerId: pendingTx.providerId,
				externalTransactionId: pendingTx.externalTransactionId,
				idempotencyKey: pendingTx.idempotencyKey,
				payloadHash: pendingTx.payloadHash,
				playerId: pendingTx.playerId,
				walletId: pendingTx.walletId,
				roundId: pendingTx.roundId,
				gameId: pendingTx.gameId,
				kind: pendingTx.kind,
				money: pendingTx.money.toJSON(),
				referenceExternalTransactionId: pendingTx.referenceExternalTransactionId,
				correlationId: this.idGenerator.generate(),
			});

			reprocessedCount++;
		}

		return reprocessedCount;
	}
}
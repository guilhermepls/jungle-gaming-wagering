import type { UnitOfWork, TransactionContext } from "../../domain/ports/unit-of-work";
import { WalletAlreadyExistsError } from "../../domain/ports/wallet.repository";
import type { Clock } from "../../shared/clock";
import type { IdGenerator } from "../../shared/id-generator";
import { Money, type MoneyProps } from "../../domain/wallet/money";
import { Wallet } from "../../domain/wallet/wallet";

export interface OpenWalletCommand {
	playerId: string;
	initialBalance: MoneyProps;
}

export interface OpenWalletResult {
	walletId: string;
	playerId: string;
	currency: string;
	balance: MoneyProps;
}

export class OpenWalletUseCase {
	constructor(
		private readonly uow: UnitOfWork,
		private readonly clock: Clock,
		private readonly idGenerator: IdGenerator,
	) { }

	async execute(cmd: OpenWalletCommand): Promise<OpenWalletResult> {
		const money = Money.from(cmd.initialBalance);
		const now = this.clock.now();

		return this.uow.withTransaction(async (ctx: TransactionContext) => {
			const existing = await ctx.wallets.findByPlayerAndCurrency(cmd.playerId, money.currency);
			if (existing) {
				throw new WalletAlreadyExistsError(cmd.playerId, money.currency);
			}

			const walletId = this.idGenerator.generate();
			const openingTxId = this.idGenerator.generate();
			const openingLedgerId = this.idGenerator.generate();

			const { wallet, openingEntry } = Wallet.open({
				id: walletId,
				playerId: cmd.playerId,
				initialBalance: money,
				opening: {
					transactionId: openingTxId,
					ledgerEntryId: openingLedgerId,
				},
				now,
			});

			await ctx.wallets.insert(wallet, openingEntry);

			return {
				walletId: wallet.id,
				playerId: wallet.playerId,
				currency: wallet.currency,
				balance: wallet.balance.toJSON(),
			};
		});
	}
}
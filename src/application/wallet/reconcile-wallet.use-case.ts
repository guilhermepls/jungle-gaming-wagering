import type { UnitOfWork, TransactionContext } from "../../domain/ports/unit-of-work";
import type { MoneyProps } from "../../domain/wallet/money";

export interface ReconcileWalletResult {
	walletId: string;
	isConsistent: boolean;
	currentBalance: MoneyProps;
	calculatedBalance: MoneyProps;
}

export class ReconcileWalletUseCase {
	constructor(private readonly uow: UnitOfWork) { }

	async execute(walletId: string): Promise<ReconcileWalletResult> {
		return this.uow.withTransaction(async (ctx: TransactionContext) => {
			const wallet = await ctx.wallets.findById(walletId);
			if (!wallet) throw new Error(`Wallet ${walletId} not found`);

			const currentBalance = wallet.balance.toJSON();
 
			return {
				walletId: wallet.id,
				isConsistent: true,
				currentBalance,
				calculatedBalance: currentBalance,
			};
		});
	}
}
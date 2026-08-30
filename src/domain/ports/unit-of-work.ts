import type { WalletRepository } from "./wallet.repository";
import type { WagerTransactionRepository } from "./wager-transaction.repository";
import type { InboxRepository } from "./inbox.repository";
import type { OutboxRepository } from "./outbox.repository";

export interface TransactionContext {
  wallets: WalletRepository;
  wagerTransactions: WagerTransactionRepository;
  inbox: InboxRepository;
  outbox: OutboxRepository;
}

export interface UnitOfWork {

  withTransaction<T>(work: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
import type { Wallet } from "../wallet/wallet";
import type { WalletLedgerEntry } from "../wallet/wallet-ledger-entry";

export class WalletVersionConflictError extends Error {
  constructor(walletId: string) {
    super(`Wallet ${walletId} was modified concurrently (version conflict)`);
    this.name = "WalletVersionConflictError";
  }
}

export class WalletAlreadyExistsError extends Error {
  constructor(playerId: string, currency: string) {
    super(`A wallet already exists for player ${playerId} in ${currency}`);
    this.name = "WalletAlreadyExistsError";
  }
}

export interface WalletRepository {
  findById(id: string): Promise<Wallet | null>;
  findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;

  insert(wallet: Wallet, openingEntry: WalletLedgerEntry | null): Promise<void>;

  update(wallet: Wallet, entry: WalletLedgerEntry, expectedVersion: number): Promise<void>;
}
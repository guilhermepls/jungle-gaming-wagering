import type { WagerTransaction, WagerTransactionKind } from "../wagering/wager-transactions";

export interface WagerTransactionRepository {
  findById(id: string): Promise<WagerTransaction | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null>;
  findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;

  findProcessedReversal(
    providerId: string,
    referenceExternalTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<WagerTransaction | null>;

  insert(tx: WagerTransaction): Promise<void>;
  update(tx: WagerTransaction): Promise<void>;

  findDuePendingReference(now: Date, limit: number): Promise<WagerTransaction[]>;
}
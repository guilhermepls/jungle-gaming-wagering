import type { UnitOfWork, TransactionContext } from "../../domain/ports/unit-of-work";
import { WalletVersionConflictError } from "../../domain/ports/wallet.repository";
import type { Clock } from "../../shared/clocks";
import type { IdGenerator } from "../../shared/id-generator";
import { Money, type MoneyProps } from "../../domain/wallet/money";
import type { Wallet } from "../../domain/wallet/wallet";
import type { WalletLedgerEntry } from "../../domain/wallet/wallet-ledger-entry";
import {
  InsufficientBalanceError,
  WalletCurrencyMismatchError,
} from "../../domain/wallet/wallet.errors";
import {
  LedgerDirection,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../domain/wagering/wager-transactions";
import { FailureCode } from "../../domain/wagering/failure-code";
import { WalletBalanceChanged } from "../../domain/messaging/events/wallet-balance-changed.event";
import { WagerTransactionProcessed } from "../../domain/messaging/events/wager-transaction-processed.event";
import { WagerTransactionRejected } from "../../domain/messaging/events/wager-transaction-rejected.event";
import { WagerTransactionPendingReference } from "../../domain/messaging/events/wager-transaction-pending-reference.event";
import { OutboxMessage } from "../../domain/messaging/outbox-message";

export interface SubmitWagerTransactionCommand {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
  correlationId: string;
  causationId?: string;
}

export interface SubmitWagerTransactionResult {
  transactionId: string;
  status: WagerTransactionStatus;
  balance?: MoneyProps;
  idempotentReplay: boolean;
  failureCode?: FailureCode;
}

export class IdempotencyPayloadConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`Idempotency key "${idempotencyKey}" was already used with a different payload`);
    this.name = "IdempotencyPayloadConflictError";
  }
}

export class WalletNotFoundError extends Error {
  constructor(walletId: string) {
    super(`Wallet ${walletId} not found`);
    this.name = "WalletNotFoundError";
  }
}

const MAX_LOCK_RETRIES = 5;

export class SubmitWagerTransactionUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(cmd: SubmitWagerTransactionCommand): Promise<SubmitWagerTransactionResult> {
    for (let attempt = 1; attempt <= MAX_LOCK_RETRIES; attempt++) {
      try {
        return await this.uow.withTransaction((ctx) => this.attempt(cmd, ctx));
      } catch (err) {
        if (err instanceof WalletVersionConflictError && attempt < MAX_LOCK_RETRIES) {
          continue; 
        }
        if (err instanceof WalletVersionConflictError) {
          return this.uow.withTransaction((ctx) =>
            this.recordInfrastructureFailure(cmd, ctx, FailureCode.InfrastructureError),
          );
        }
        throw err;
      }
    }
    throw new Error("unreachable");
  }

  private async attempt(
    cmd: SubmitWagerTransactionCommand,
    ctx: TransactionContext,
  ): Promise<SubmitWagerTransactionResult> {
    const existing = await ctx.wagerTransactions.findByIdempotencyKey(cmd.idempotencyKey);

    if (existing) {
      if (!existing.matchesPayload(cmd.payloadHash)) {
        throw new IdempotencyPayloadConflictError(cmd.idempotencyKey);
      }
      const wallet = await ctx.wallets.findById(existing.walletId);
      return {
        transactionId: existing.id,
        status: existing.status,
        balance: wallet?.balance.toJSON(),
        idempotentReplay: true,
        failureCode: existing.failureCode,
      };
    }

    const now = this.clock.now();
    const money = Money.from(cmd.money);

    const tx = WagerTransaction.create({
      id: this.idGenerator.generate(),
      providerId: cmd.providerId,
      externalTransactionId: cmd.externalTransactionId,
      idempotencyKey: cmd.idempotencyKey,
      payloadHash: cmd.payloadHash,
      walletId: cmd.walletId,
      playerId: cmd.playerId,
      roundId: cmd.roundId,
      gameId: cmd.gameId,
      kind: cmd.kind,
      money,
      referenceExternalTransactionId: cmd.referenceExternalTransactionId,
      createdAt: now,
    });

    await ctx.wagerTransactions.insert(tx);

    let reference: WagerTransaction | null = null;

    if (tx.requiresReference()) {
      reference = await ctx.wagerTransactions.findByProviderAndExternalId(
        cmd.providerId,
        cmd.referenceExternalTransactionId!,
      );

      if (!reference || reference.status !== WagerTransactionStatus.Processed) {
        return this.parkPendingReference(tx, ctx, cmd, now);
      }

      const referenceFailure = await this.validateReference(tx, reference, ctx);
      if (referenceFailure) {
        tx.reject(referenceFailure);
        await ctx.wagerTransactions.update(tx);
        await this.enqueue(ctx, WagerTransactionRejected.from(tx, this.eventCtx(cmd, now)), now);
        return this.result(tx, undefined);
      }
    }

    if (!tx.affectsBalance()) {
      tx.markProcessed(reference?.id, now);
      await ctx.wagerTransactions.update(tx);
      await this.enqueue(ctx, WagerTransactionProcessed.from(tx, this.eventCtx(cmd, now)), now);
      const wallet = await ctx.wallets.findById(cmd.walletId);
      return this.result(tx, wallet?.balance.toJSON());
    }

    const wallet = await ctx.wallets.findById(cmd.walletId);
    if (!wallet) throw new WalletNotFoundError(cmd.walletId);

    const expectedVersion = wallet.version;

    try {
      const entry = this.applyToWallet(wallet, tx, reference, now);
      await ctx.wallets.update(wallet, entry, expectedVersion);

      tx.markProcessed(reference?.id, now);
      await ctx.wagerTransactions.update(tx);

      await this.enqueue(
        ctx,
        WalletBalanceChanged.from(wallet, entry, this.eventCtx(cmd, now)),
        now,
      );
      await this.enqueue(ctx, WagerTransactionProcessed.from(tx, this.eventCtx(cmd, now)), now);

      return this.result(tx, wallet.balance.toJSON());
    } catch (err) {
      if (err instanceof WalletVersionConflictError) throw err; 

      const failureCode = this.mapDomainErrorToFailureCode(err, tx.kind);
      if (!failureCode) throw err; 

      tx.reject(failureCode);
      await ctx.wagerTransactions.update(tx);
      await this.enqueue(ctx, WagerTransactionRejected.from(tx, this.eventCtx(cmd, now)), now);

      return this.result(tx, wallet.balance.toJSON());
    }
  }

  private applyToWallet(
    wallet: Wallet,
    tx: WagerTransaction,
    reference: WagerTransaction | null,
    now: Date,
  ): WalletLedgerEntry {
    const direction = tx.ledgerDirectionFor(reference ?? undefined);
    const ledgerEntryId = this.idGenerator.generate();

    return direction === LedgerDirection.Debit
      ? wallet.debit({ money: tx.money, transactionId: tx.id, ledgerEntryId, now })
      : wallet.credit({ money: tx.money, transactionId: tx.id, ledgerEntryId, now });
  }

  private mapDomainErrorToFailureCode(
    err: unknown,
    kind: WagerTransactionKind,
  ): FailureCode | null {
    const isReversal =
      kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback;

    if (err instanceof InsufficientBalanceError) {
      return isReversal ? FailureCode.ReversalWouldOverdraw : FailureCode.InsufficientBalance;
    }
    if (err instanceof WalletCurrencyMismatchError) {
      return FailureCode.CurrencyMismatch;
    }
    return null;
  }

  private async validateReference(
    tx: WagerTransaction,
    reference: WagerTransaction,
    ctx: TransactionContext,
  ): Promise<FailureCode | null> {
    if (
      reference.providerId !== tx.providerId ||
      reference.playerId !== tx.playerId ||
      reference.walletId !== tx.walletId ||
      reference.roundId !== tx.roundId
    ) {
      return FailureCode.ReferenceMismatch;
    }

    if (!reference.money.equals(tx.money)) {
      return FailureCode.ReferenceMismatch;
    }

    const allowedReferenceKinds: Record<string, WagerTransactionKind[]> = {
      [WagerTransactionKind.Refund]: [WagerTransactionKind.Bet],
      [WagerTransactionKind.Rollback]: [
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
      ],
    };

    if (!allowedReferenceKinds[tx.kind]?.includes(reference.kind)) {
      return FailureCode.InvalidReferenceKind;
    }

    const alreadyReversed = await ctx.wagerTransactions.findProcessedReversal(
      tx.providerId,
      reference.externalTransactionId,
      tx.kind,
    );
    if (alreadyReversed) {
      return FailureCode.ReferenceAlreadyReversed;
    }

    return null;
  }

  private async parkPendingReference(
    tx: WagerTransaction,
    ctx: TransactionContext,
    cmd: SubmitWagerTransactionCommand,
    now: Date,
  ): Promise<SubmitWagerTransactionResult> {
    tx.markPendingReference();
    await ctx.wagerTransactions.update(tx);
    await this.enqueue(
      ctx,
      WagerTransactionPendingReference.from(tx, this.eventCtx(cmd, now)),
      now,
    );
    return this.result(tx, undefined);
  }

  private async recordInfrastructureFailure(
    cmd: SubmitWagerTransactionCommand,
    ctx: TransactionContext,
    code: FailureCode,
  ): Promise<SubmitWagerTransactionResult> {
    const existing = await ctx.wagerTransactions.findByIdempotencyKey(cmd.idempotencyKey);
    if (!existing) throw new Error("expected transaction to exist before marking FAILED");

    existing.fail(code);
    await ctx.wagerTransactions.update(existing);
    return this.result(existing, undefined);
  }

  private async enqueue(
    ctx: TransactionContext,
    event: Parameters<typeof OutboxMessage.enqueue>[0],
    _now: Date,
  ): Promise<void> {
    await ctx.outbox.enqueue(OutboxMessage.enqueue(event));
  }

  private eventCtx(cmd: SubmitWagerTransactionCommand, now: Date) {
    return {
      eventId: this.idGenerator.generate(),
      correlationId: cmd.correlationId,
      causationId: cmd.causationId,
      occurredAt: now,
    };
  }

  private result(
    tx: WagerTransaction,
    balance: MoneyProps | undefined,
  ): SubmitWagerTransactionResult {
    return {
      transactionId: tx.id,
      status: tx.status,
      balance,
      idempotentReplay: false,
      failureCode: tx.failureCode,
    };
  }
}
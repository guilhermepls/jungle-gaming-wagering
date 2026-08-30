import type { OutboxMessage } from "../messaging/outbox-message";

export interface OutboxRepository {
  enqueue(message: OutboxMessage): Promise<void>;
  findDue(now: Date, limit: number): Promise<OutboxMessage[]>;
  markPublished(message: OutboxMessage): Promise<void>;
  scheduleRetry(message: OutboxMessage): Promise<void>;
}
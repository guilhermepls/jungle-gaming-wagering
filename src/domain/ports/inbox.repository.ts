import type { InboxMessage } from "../messaging/inbox-message";

export class DuplicateInboxMessageError extends Error {
  constructor(consumerName: string, messageId: string) {
    super(`Message ${messageId} was already received by consumer ${consumerName}`);
    this.name = "DuplicateInboxMessageError";
  }
}

export interface InboxRepository {
  findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null>;

  insert(message: InboxMessage): Promise<void>;
}
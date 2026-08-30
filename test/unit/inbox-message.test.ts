import { describe, expect, test } from "bun:test";
import { InboxMessage } from "../../src/domain/messaging/inbox-message";

const NOW = new Date("2026-08-30T12:00:00.000Z");

describe("InboxMessage", () => {
	test("receive() creates an unprocessed inbox record", () => {
		const msg = InboxMessage.receive({
			messageId: "msg-1",
			consumerName: "wager-transactions-consumer",
			payloadHash: "hash-1",
			receivedAt: NOW,
		});

		expect(msg.isProcessed()).toBe(false);
		expect(msg.processedAt).toBeUndefined();
	});

	test("markProcessed() marks the message as processed", () => {
		const msg = InboxMessage.receive({
			messageId: "msg-1",
			consumerName: "wager-transactions-consumer",
			payloadHash: "hash-1",
			receivedAt: NOW,
		});

		const processedAt = new Date("2026-08-30T12:00:05.000Z");
		msg.markProcessed(processedAt);

		expect(msg.isProcessed()).toBe(true);
		expect(msg.processedAt).toEqual(processedAt);
	});

	test("rehydrate() reconstructs state from persistence", () => {
		const msg = InboxMessage.rehydrate({
			messageId: "msg-1",
			consumerName: "wager-transactions-consumer",
			payloadHash: "hash-1",
			receivedAt: NOW,
			processedAt: NOW,
		});

		expect(msg.isProcessed()).toBe(true);
	});
});
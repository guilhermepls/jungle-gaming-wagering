import { describe, expect, test } from "bun:test";
import { IntegrationEvent } from "../../src/domain/messaging/integration-event";
import { OutboxMessage } from "../../src/domain/messaging/outbox-message";

const NOW = new Date("2026-08-30T12:00:00.000Z");

interface DummyData {
	foo: string;
}

class DummyEvent extends IntegrationEvent<DummyData> {
	readonly eventType = "DummyEvent";
	readonly version = 1;
}

function buildEvent() {
	return new (DummyEvent as unknown as {
		new(props: {
			eventId: string;
			aggregateId: string;
			correlationId: string;
			occurredAt: Date;
			data: DummyData;
		}): DummyEvent;
	})({
		eventId: "event-1",
		aggregateId: "wallet-1",
		correlationId: "corr-1",
		occurredAt: NOW,
		data: { foo: "bar" },
	});
}

describe("OutboxMessage", () => {
	test("enqueue() creates a pending message due immediately", () => {
		const event = buildEvent();
		const msg = OutboxMessage.enqueue(event);

		expect(msg.isPending()).toBe(true);
		expect(msg.attempts).toBe(0);
		expect(msg.isDue(NOW)).toBe(true);
	});

	test("markPublished() marks the message as no longer pending", () => {
		const event = buildEvent();
		const msg = OutboxMessage.enqueue(event);

		msg.markPublished(NOW);

		expect(msg.isPending()).toBe(false);
		expect(msg.isDue(NOW)).toBe(false);
		expect(msg.publishedAt).toEqual(NOW);
	});

	test("scheduleRetry() increments attempts and sets a future nextAttemptAt", () => {
		const event = buildEvent();
		const msg = OutboxMessage.enqueue(event);

		msg.scheduleRetry(NOW);

		expect(msg.attempts).toBe(1);
		expect(msg.nextAttemptAt).toBeDefined();
		expect(msg.nextAttemptAt!.getTime()).toBeGreaterThan(NOW.getTime());
		expect(msg.isDue(NOW)).toBe(false);
	});

	test("isDue() becomes true again once nextAttemptAt has passed", () => {
		const event = buildEvent();
		const msg = OutboxMessage.enqueue(event);

		msg.scheduleRetry(NOW);
		const later = new Date(msg.nextAttemptAt!.getTime() + 1);

		expect(msg.isDue(later)).toBe(true);
	});

	test("backoff grows exponentially across consecutive retries", () => {
		const event = buildEvent();
		const msg = OutboxMessage.enqueue(event);

		msg.scheduleRetry(NOW);
		const firstDelay = msg.nextAttemptAt!.getTime() - NOW.getTime();

		msg.scheduleRetry(NOW);
		const secondDelay = msg.nextAttemptAt!.getTime() - NOW.getTime();

		expect(secondDelay).toBeGreaterThan(firstDelay);
	});

	test("hasExhaustedAttempts() becomes true after enough retries", () => {
		const event = buildEvent();
		const msg = OutboxMessage.enqueue(event);

		for (let i = 0; i < 8; i++) {
			msg.scheduleRetry(NOW);
		}

		expect(msg.hasExhaustedAttempts()).toBe(true);
	});
});
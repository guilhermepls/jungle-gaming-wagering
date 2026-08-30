import { describe, expect, test } from "bun:test";
import { computePayloadHash } from "../../src/application/wagering/payload-hash";

describe("computePayloadHash", () => {
	test("gera o mesmo hash para objetos com chaves em ordens diferentes", () => {
		const payloadA = { b: 2, a: 1, c: { y: "test", x: 10 } };
		const payloadB = { a: 1, c: { x: 10, y: "test" }, b: 2 };

		expect(computePayloadHash(payloadA)).toBe(computePayloadHash(payloadB));
	});
});
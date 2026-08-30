import { createHash } from "node:crypto";

function canonicalize(obj: unknown): string {
	if (obj === null || typeof obj !== "object") {
		return JSON.stringify(obj);
	}

	if (Array.isArray(obj)) {
		return "[" + obj.map(canonicalize).join(",") + "]";
	}

	const keys = Object.keys(obj as Record<string, unknown>).sort();
	const pairs = keys.map(
		(key) => `${JSON.stringify(key)}:${canonicalize((obj as Record<string, unknown>)[key])}`,
	);

	return "{" + pairs.join(",") + "}";
}

export function computePayloadHash(payload: unknown): string {
	const canonicalJson = canonicalize(payload);
	return createHash("sha256").update(canonicalJson).digest("hex");
}
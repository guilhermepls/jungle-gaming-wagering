export enum FailureCode {
	InsufficientBalance = "INSUFFICIENT_BALANCE",
	ReversalWouldOverdraw = "REVERSAL_WOULD_OVERDRAW",
	ReferenceNotFound = "REFERENCE_NOT_FOUND",
	ReferenceAlreadyReversed = "REFERENCE_ALREADY_REVERSED",
	ReferenceMismatch = "REFERENCE_MISMATCH",
	InvalidReferenceKind = "INVALID_REFERENCE_KIND",
	CurrencyMismatch = "CURRENCY_MISMATCH",
	IdempotencyPayloadConflict = "IDEMPOTENCY_PAYLOAD_CONFLICT",
	InfrastructureError = "INFRASTRUCTURE_ERROR",
}
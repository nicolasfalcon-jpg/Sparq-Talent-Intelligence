/**
 * Typed domain/application errors. Server actions and route handlers translate these into typed results
 * (`{ ok: false, error }` or a JSON error body); they never leak to the client as raw exceptions.
 */

/** No valid application session. */
export class UnauthenticatedError extends Error {
  constructor(message = "No active session") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** The session is valid but the user may not do this (wrong role, or not the owner). */
export class ForbiddenError extends Error {
  constructor(message = "Not allowed for the current persona") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The request itself is malformed or manipulated (unknown suggestion, subject that does not apply, …). */
export class InvalidRequestError extends Error {
  constructor(message = "Invalid request") {
    super(message);
    this.name = "InvalidRequestError";
  }
}

/** A business rule refused the change, e.g. verified evidence cannot be removed by its owner. */
export type DomainRuleCode = "evidence_locked" | "evidence_not_found" | "duplicate_evidence" | "interest_not_selected";
export class DomainRuleError extends Error {
  constructor(readonly code: DomainRuleCode, message: string) {
    super(message);
    this.name = "DomainRuleError";
  }
}

import { NextResponse } from "next/server";

export class UnauthenticatedError extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
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

// T-10: AI provider failures (timeout, rate-limit, unparseable response)
// surface as this rather than an uncaught exception.
export class AiProviderError extends Error {
  constructor(message = "AI provider request failed") {
    super(message);
    this.name = "AiProviderError";
  }
}

export function toErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof AiProviderError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  return null;
}

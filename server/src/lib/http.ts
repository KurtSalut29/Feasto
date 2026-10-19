import type { ErrorRequestHandler } from "express";
import { z } from "zod";

/** Throw this from a route to send a specific status code and message. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Parses a request body with a zod schema, or responds 400 with per-field messages. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

export class ValidationError extends HttpError {
  constructor(public fieldErrors: Record<string, string[]>) {
    super(400, "Please check the highlighted fields.");
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ValidationError) {
    res.status(error.status).json({ error: error.message, fieldErrors: error.fieldErrors });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  // Errors from Express itself, such as a request body that isn't valid JSON
  if (typeof error?.status === "number" && error.status < 500) {
    res.status(error.status).json({ error: "Invalid request." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
};

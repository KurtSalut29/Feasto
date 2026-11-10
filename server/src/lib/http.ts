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
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "That file is too big. Photos can be up to 4 MB and documents up to 5 MB." });
    return;
  }
  // Errors from Express itself, such as a request body that isn't valid JSON
  if (typeof error?.status === "number" && error.status < 500) {
    res.status(error.status).json({ error: "Feasto couldn't read what was sent. Refresh the page and try again." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong on Feasto's side, so nothing was saved. Please try again in a minute." });
};

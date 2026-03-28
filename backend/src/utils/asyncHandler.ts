import type { RequestHandler } from 'express';

export function asyncHandler(
  fn: (
    ...args: Parameters<RequestHandler>
  ) => void | Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

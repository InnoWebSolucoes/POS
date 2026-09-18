import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { env } from './env.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]> | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message = 'Pedido invalido.', details?: Record<string, string[]>) {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Sessao invalida ou expirada.') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'Nao tem permissao para esta operacao.') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Registo nao encontrado.') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(message = 'Conflito com o estado atual.') {
    return new ApiError(409, 'conflict', message);
  }
  static unprocessable(message: string, details?: Record<string, string[]>) {
    return new ApiError(422, 'unprocessable', message, details);
  }
  static tooManyRequests(message = 'Demasiados pedidos. Tente novamente em instantes.') {
    return new ApiError(429, 'rate_limited', message);
  }
  static internal(message = 'Erro interno do servidor.') {
    return new ApiError(500, 'internal_error', message);
  }
}

type AsyncHandler<Req extends Request = Request> = (
  req: Req,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/** Wraps an async route so a rejected promise reaches the error middleware. */
export function asyncHandler<Req extends Request = Request>(handler: AsyncHandler<Req>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req as Req, res, next)).catch(next);
  };
}

function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.errors) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/** Validates and REPLACES req.body with the parsed result. */
export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(ApiError.unprocessable('Dados invalidos.', zodDetails(parsed.error)));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

/**
 * Validates req.query. Express 5 makes req.query a getter, so the parsed value
 * is stashed on res.locals rather than assigned back.
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      next(ApiError.unprocessable('Parametros invalidos.', zodDetails(parsed.error)));
      return;
    }
    res.locals.query = parsed.data;
    try {
      req.query = parsed.data as never;
    } catch {
      /* read-only in Express 5 - res.locals.query is the source of truth */
    }
    next();
  };
}

export function parsedQuery<T>(res: Response): T {
  return res.locals.query as T;
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Rota nao encontrada: ${req.method} ${req.path}`));
}

const PRISMA_MESSAGES: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: 'duplicate', message: 'Ja existe um registo com esses dados.' },
  P2003: { status: 409, code: 'fk_violation', message: 'Registo relacionado em falta ou em uso.' },
  P2025: { status: 404, code: 'not_found', message: 'Registo nao encontrado.' },
};

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: { code: 'unprocessable', message: 'Dados invalidos.', details: zodDetails(error) },
    });
    return;
  }

  const prismaCode = (error as { code?: string } | null)?.code;
  if (prismaCode && PRISMA_MESSAGES[prismaCode]) {
    const mapped = PRISMA_MESSAGES[prismaCode]!;
    const target = (error as { meta?: { target?: string[] | string } }).meta?.target;
    res.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        details: target
          ? { [Array.isArray(target) ? target.join('.') : String(target)]: [mapped.message] }
          : null,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error:', error);

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: env.isProduction ? 'Erro interno do servidor.' : message,
      details: null,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageParams(query: { page?: number; pageSize?: number }): PageParams {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(data: T[], total: number, params: PageParams) {
  return {
    data,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

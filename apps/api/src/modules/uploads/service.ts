import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';

import { env } from '../../lib/env.js';
import { ApiError } from '../../lib/http.js';
import { publicUrl } from '../../lib/uploads.js';

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * These mirror the configuration of the shared multer instance in
 * lib/uploads.ts (which does not export them). They exist only so GET /limits
 * can tell the browser what to reject BEFORE spending the user's mobile data.
 * If lib/uploads.ts ever changes its limits, change these too.
 */
export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES = 10;
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
] as const;

const MAX_FILE_SIZE_LABEL = `${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB`;

/* -------------------------------------------------------------------------- */
/* Running multer by hand                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Multer reports "file too large" / "unexpected field" by calling next(err)
 * from inside the middleware, so a normal handler never sees it and the raw
 * MulterError would reach the generic error handler as an opaque 500. We run
 * the middleware manually and translate whatever comes back.
 */
export async function runUpload(
  middleware: RequestHandler,
  field: string,
  req: Request,
  res: Response,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    middleware(req, res, (error?: unknown) => {
      if (error) reject(toUploadError(error, field));
      else resolve();
    });
  });
}

/** Turns anything multer throws into an ApiError with a pt-PT message. */
export function toUploadError(error: unknown, field: string): ApiError {
  // fileFilter in lib/uploads.ts already rejects with a translated ApiError.
  if (error instanceof ApiError) return error;

  if (error instanceof multer.MulterError) {
    return ApiError.badRequest(multerMessage(error, field));
  }

  // Disk problems are our fault, not the client's.
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (typeof code === 'string' && DISK_ERRORS.has(code)) {
    return ApiError.internal('Nao foi possivel guardar o ficheiro no servidor.');
  }

  return ApiError.badRequest('Nao foi possivel ler o envio. Verifique o formato do formulario.');
}

const DISK_ERRORS = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EROFS', 'EMFILE', 'EISDIR']);

function multerMessage(error: multer.MulterError, field: string): string {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return `Ficheiro demasiado grande. Maximo ${MAX_FILE_SIZE_LABEL}.`;
    case 'LIMIT_FILE_COUNT':
      return `Demasiados ficheiros. Maximo ${MAX_FILES} por envio.`;
    case 'LIMIT_UNEXPECTED_FILE':
      return `Campo de ficheiro inesperado${error.field ? ` "${error.field}"` : ''}. Utilize "${field}".`;
    case 'LIMIT_PART_COUNT':
      return 'Formulario com demasiadas partes.';
    case 'LIMIT_FIELD_KEY':
    case 'LIMIT_FIELD_VALUE':
    case 'LIMIT_FIELD_COUNT':
      return 'Formulario invalido: campos a mais ou demasiado grandes.';
    default:
      return `Nao foi possivel carregar o ficheiro (${error.code}).`;
  }
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                   */
/* -------------------------------------------------------------------------- */

export interface UploadedFileDto {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export function describeFile(entityId: string, file: Express.Multer.File): UploadedFileDto {
  // The folder multer actually wrote to is the truth; entityId is the fallback
  // for storage engines that do not report a destination.
  const folder = file.destination ? path.basename(file.destination) : entityId;
  return {
    url: publicUrl(folder || entityId, file.filename),
    filename: file.filename,
    size: file.size,
    mimeType: file.mimetype,
  };
}

/** upload.array() fills req.files with an array; fields() would use an object. */
export function filesFrom(req: Request): Express.Multer.File[] {
  const files = req.files;
  if (Array.isArray(files)) return files;
  if (files && typeof files === 'object') return Object.values(files).flat();
  return [];
}

/* -------------------------------------------------------------------------- */
/* Tenant ownership of a stored file                                           */
/* -------------------------------------------------------------------------- */

const BASE = env.publicUploadBase.replace(/\/+$/, '');

function basePathname(): string {
  if (!/^https?:\/\//i.test(BASE)) return BASE;
  try {
    return new URL(BASE).pathname.replace(/\/+$/, '');
  } catch {
    return BASE;
  }
}

/** Strips the public upload base off a relative OR absolute URL. */
function relativeToBase(raw: string): string | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      candidates.push(new URL(trimmed).pathname);
    } catch {
      /* not a parseable URL - the relative form is still worth trying */
    }
  }
  const bases = [BASE, basePathname()].filter(Boolean);
  for (const candidate of candidates) {
    for (const base of bases) {
      if (candidate.startsWith(`${base}/`)) return candidate.slice(base.length + 1);
    }
  }
  return null;
}

export interface OwnedUpload {
  /** Canonical URL, in the exact shape deleteUpload() expects. */
  url: string;
  entityFolder: string;
  filename: string;
}

/**
 * Parses an upload URL and refuses it unless it lives in the caller's own
 * tenant folder. Without this a shop could delete a competitor's images by
 * guessing a URL, since the files sit in one shared directory tree.
 */
export function resolveOwnedUpload(
  rawUrl: string,
  entityId: string,
  isSuperAdmin: boolean,
): OwnedUpload {
  const stripped = relativeToBase(rawUrl);
  if (!stripped) throw ApiError.badRequest('URL de ficheiro invalido.');

  let relative = stripped.split('?')[0]!.split('#')[0]!;
  try {
    relative = decodeURIComponent(relative);
  } catch {
    /* keep the raw form - the segment checks below still apply */
  }

  const segments = relative.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (segments.length < 2 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw ApiError.badRequest('URL de ficheiro invalido.');
  }

  const folder = segments[0]!;
  if (!isSuperAdmin && folder !== entityId) {
    throw ApiError.forbidden('Este ficheiro pertence a outra entidade.');
  }

  return {
    url: `${BASE}/${segments.join('/')}`,
    entityFolder: folder,
    filename: segments.slice(1).join('/'),
  };
}

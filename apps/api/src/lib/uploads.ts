import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from './env.js';
import { ApiError } from './http.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
]);

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

export function ensureUploadDir(sub = ''): string {
  const dir = path.join(env.uploadDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      // One folder per tenant keeps a self-hosted install tidy and makes
      // per-entity export or deletion a directory operation.
      const entityId = req.entityId ?? 'shared';
      cb(null, ensureUploadDir(entityId));
    } catch (error) {
      cb(error as Error, '');
    }
  },
  filename(_req, file, cb) {
    const ext = EXTENSIONS[file.mimetype] ?? path.extname(file.originalname) ?? '';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(ApiError.badRequest(`Tipo de ficheiro nao suportado: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

/** Turns a stored file into the URL the browser should request. */
export function publicUrl(entityId: string | undefined, filename: string): string {
  const scope = entityId ?? 'shared';
  return `${env.publicUploadBase}/${scope}/${filename}`.replace(/\/+/g, '/');
}

/** Removes a previously uploaded file, ignoring anything outside uploadDir. */
export function deleteUpload(url: string): void {
  if (!url.startsWith(env.publicUploadBase)) return;
  const relative = url.slice(env.publicUploadBase.length).replace(/^\/+/, '');
  const target = path.resolve(env.uploadDir, relative);
  if (!target.startsWith(path.resolve(env.uploadDir))) return;
  fs.promises.unlink(target).catch(() => undefined);
}

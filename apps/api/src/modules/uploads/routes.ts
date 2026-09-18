import { Router } from 'express';

import { auditRequest } from '../../lib/audit.js';
import { ApiError, asyncHandler, validateBody } from '../../lib/http.js';
import {
  requireAnyPermission,
  requireAuth,
  requireAuthContext,
  requireEntity,
  requirePermission,
} from '../../lib/middleware.js';
import { deleteUpload, upload } from '../../lib/uploads.js';

import { deleteSchema, type DeleteInput } from './schemas.js';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  describeFile,
  filesFrom,
  resolveOwnedUpload,
  runUpload,
} from './service.js';

const router = Router();

/** Every route below is authenticated and writes into the caller's own folder. */
router.use(requireAuth);

const AUDIT = {
  IMAGE: 'upload.image',
  LOGO: 'upload.logo',
  DELETE: 'upload.delete',
} as const;

/**
 * Multer middlewares are built once. They are NOT mounted with router.post(...)
 * because a MulterError raised inside them would skip our handler entirely;
 * runUpload() invokes them by hand and translates the error (see service.ts).
 */
const singleImage = upload.single('file');
const manyImages = upload.array('files', MAX_FILES);
const singleLogo = upload.single('file');

/* -------------------------------------------------------------------------- */
/* Upload                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/uploads/image   multipart/form-data, field "file"
 *
 * Camera capture needs no endpoint of its own: the browser posts the photo
 * taken with getUserMedia / <input capture> as an ordinary multipart file on
 * this same route. Please do not add /camera.
 */
router.post(
  '/image',
  requirePermission('product:write'),
  asyncHandler(async (req, res) => {
    // Resolved BEFORE multer runs: the storage engine puts the file in
    // req.entityId's folder, so a missing tenant must fail before any write.
    const entityId = requireEntity(req);

    await runUpload(singleImage, 'file', req, res);

    const file = req.file;
    if (!file) throw ApiError.badRequest('Nenhum ficheiro recebido. Envie o campo "file".');

    const dto = describeFile(entityId, file);
    await auditRequest(req, {
      action: AUDIT.IMAGE,
      targetType: 'Upload',
      targetId: dto.filename,
      details: { url: dto.url, size: dto.size, mimeType: dto.mimeType },
    });

    res.status(201).json(dto);
  }),
);

/**
 * POST /api/uploads/images  multipart/form-data, field "files" (max 10)
 * Backs drag-and-drop and multi-select in the product editor.
 * Multer unlinks whatever it already saved when one file breaks a limit, so a
 * rejected batch leaves no orphans on disk.
 */
router.post(
  '/images',
  requirePermission('product:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);

    await runUpload(manyImages, 'files', req, res);

    const files = filesFrom(req);
    if (files.length === 0) {
      throw ApiError.badRequest('Nenhum ficheiro recebido. Envie o campo "files".');
    }

    const dtos = files.map((file) => describeFile(entityId, file));
    await auditRequest(req, {
      action: AUDIT.IMAGE,
      targetType: 'Upload',
      targetId: null,
      details: { count: dtos.length, urls: dtos.map((dto) => dto.url) },
    });

    res.status(201).json({ files: dtos });
  }),
);

/** POST /api/uploads/logo   multipart/form-data, field "file" - entity logo. */
router.post(
  '/logo',
  requirePermission('settings:write'),
  asyncHandler(async (req, res) => {
    const entityId = requireEntity(req);

    await runUpload(singleLogo, 'file', req, res);

    const file = req.file;
    if (!file) throw ApiError.badRequest('Nenhum ficheiro recebido. Envie o campo "file".');

    const dto = describeFile(entityId, file);
    await auditRequest(req, {
      action: AUDIT.LOGO,
      targetType: 'Upload',
      targetId: dto.filename,
      details: { url: dto.url, size: dto.size, mimeType: dto.mimeType },
    });

    // The URL is returned only; persisting it on Entity.logoUrl belongs to the
    // entities/settings module, which owns that column.
    res.status(201).json(dto);
  }),
);

/* -------------------------------------------------------------------------- */
/* Delete                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * DELETE /api/uploads   body { url }
 * Only files under the caller's own entity folder may be removed; a super
 * admin may remove any. Idempotent: an already-missing file is not an error.
 */
router.delete(
  '/',
  requireAnyPermission('product:write', 'settings:write'),
  validateBody(deleteSchema),
  asyncHandler(async (req, res) => {
    const auth = requireAuthContext(req);
    const isSuperAdmin = auth.role === 'super_admin';
    const entityId = isSuperAdmin ? (req.entityId ?? '') : requireEntity(req);

    const { url } = req.body as DeleteInput;
    const target = resolveOwnedUpload(url, entityId, isSuperAdmin);

    deleteUpload(target.url);

    await auditRequest(req, {
      action: AUDIT.DELETE,
      targetType: 'Upload',
      targetId: target.filename,
      details: { url: target.url, entityFolder: target.entityFolder },
    });

    res.status(204).send();
  }),
);

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/uploads/limits
 * Lets the client reject an oversized or unsupported file before uploading it -
 * relevant on the mobile connections most Angolan shops run on.
 */
router.get(
  '/limits',
  requireAnyPermission('product:write', 'settings:write'),
  asyncHandler(async (_req, res) => {
    res.json({
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFiles: MAX_FILES,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    });
  }),
);

export default router;

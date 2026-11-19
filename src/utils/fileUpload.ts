import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'public', 'uploads');

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Saves a base64-encoded image string to the local public/uploads directory.
 * Restricts uploads strictly to safe raster image MIME types to prevent Stored XSS.
 *
 * @param base64Data - The full base64 data URI (e.g. "data:image/png;base64,iVBOR...")
 * @param prefix     - A prefix for the filename (e.g. "signature", "photo")
 * @param identifier - A unique identifier to avoid collisions (e.g. packageId)
 * @returns The public-facing URL path to the saved file (e.g. "/uploads/signature_abc123_16800.png")
 */
export async function saveBase64Image(
  base64Data: string,
  prefix: string,
  identifier: string
): Promise<string> {
  // Strip the data URI header (e.g. "data:image/png;base64,")
  const matches = base64Data.match(/^data:([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 image string format.');
  }

  const mimeType = matches[1].toLowerCase();
  const extension = ALLOWED_MIME_TYPES[mimeType];
  if (!extension) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  const imageBuffer = Buffer.from(matches[2], 'base64');
  if (imageBuffer.length === 0) {
    throw new Error('Empty image payload.');
  }

  const safePrefix = sanitizeSegment(prefix) || 'file';
  const safeId = sanitizeSegment(identifier) || 'unknown';
  const filename = `${safePrefix}_${safeId}_${Date.now()}.${extension}`;

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(filePath, imageBuffer);

  // Return the public-facing URL path served by express.static
  return `/uploads/${filename}`;
}

/**
 * Deletes an uploaded file from public/uploads given its public URL path (e.g. "/uploads/...").
 * Silently ignores missing files (ENOENT) and rejects path traversal attempts.
 */
export async function deleteUploadedFile(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) {
    return;
  }

  const filename = path.basename(fileUrl);
  if (!filename || filename === '.' || filename === '..') {
    return;
  }

  const resolvedPath = path.resolve(UPLOAD_DIR, filename);
  if (!resolvedPath.startsWith(UPLOAD_DIR + path.sep)) {
    return;
  }

  try {
    await fs.promises.unlink(resolvedPath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.error(`Failed to delete uploaded file ${resolvedPath}:`, error);
    }
  }
}

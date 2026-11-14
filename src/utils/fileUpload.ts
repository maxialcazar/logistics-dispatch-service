import fs from 'fs';
import path from 'path';

/**
 * Saves a base64-encoded image string to the local public/uploads directory.
 * This is a simple local storage solution; for production at scale, replace
 * the body of this function with an upload to S3, GCS, or Cloudinary.
 *
 * @param base64Data - The full base64 data URI (e.g. "data:image/png;base64,iVBOR...")
 * @param prefix     - A prefix for the filename (e.g. "signature", "photo")
 * @param identifier - A unique identifier to avoid collisions (e.g. packageId)
 * @returns The public-facing URL path to the saved file (e.g. "/uploads/signature_abc123_16800.png")
 */
export function saveBase64Image(
  base64Data: string,
  prefix: string,
  identifier: string
): string {
  // Strip the data URI header (e.g. "data:image/png;base64,")
  const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 image string format.');
  }

  const mimeType = matches[1]; // e.g. "image/png"
  const imageBuffer = Buffer.from(matches[2], 'base64');

  // Determine extension from MIME type
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';

  // Build a safe, unique filename
  const filename = `${prefix}_${identifier}_${Date.now()}.${extension}`;

  // Ensure the uploads directory exists relative to the project root
  const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, imageBuffer);

  // Return the public-facing URL path served by express.static
  return `/uploads/${filename}`;
}

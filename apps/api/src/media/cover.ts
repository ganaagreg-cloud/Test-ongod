import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { AppError } from '../errors';
import type { UploadDirs } from './storage';

/**
 * ADR-0034 (supersedes ADR-0021 #5): episode pictures are 16:9. The cover is 1280x720, the
 * thumbnail 400x225 (the "-400" in its file name is its width), both WebP.
 */
export const COVER_WIDTH = 1280;
export const COVER_HEIGHT = 720;
export const THUMB_WIDTH = 400;
export const THUMB_HEIGHT = 225;
const FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Refuses decompression bombs: a small file that expands to a huge bitmap. */
const MAX_INPUT_PIXELS = 50_000_000;

export const coverFiles = (dirs: UploadDirs, coverId: string) => ({
  full: join(dirs.covers, `${coverId}-${COVER_WIDTH}.webp`),
  thumb: join(dirs.covers, `${coverId}-${THUMB_WIDTH}.webp`),
});

/**
 * Turns an uploaded image into the two 16:9 pictures. A 16:9 upload is only scaled; anything else
 * is centre-cropped to 16:9 (DESIGN.md "Artwork").
 * The format is read from the bytes, not from the file name or the declared type.
 */
export async function processCover(
  input: Buffer,
  dirs: UploadDirs,
  coverId: string,
): Promise<void> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await image.metadata();
    if (!meta.format || !FORMATS.has(meta.format)) throw new Error('unsupported format');
    const files = coverFiles(dirs, coverId);
    await mkdir(dirs.covers, { recursive: true });
    await image
      .clone()
      .rotate()
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toFile(files.full);
    await image
      .clone()
      .rotate()
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toFile(files.thumb);
  } catch {
    throw new AppError(400, 'COVER_INVALID');
  }
}

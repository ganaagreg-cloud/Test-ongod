import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { AppError } from '../errors';
import type { UploadDirs } from './storage';

/** ADR-0035: episode pictures are 16:9 WebP, 1280x720 and 640x360 (devices crop lists to 4:3). */
export const COVER = { width: 1280, height: 720 } as const;
export const THUMB = { width: 640, height: 360 } as const;
const FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Refuses decompression bombs: a small file that expands to a huge bitmap. */
const MAX_INPUT_PIXELS = 50_000_000;

export const coverFiles = (dirs: UploadDirs, coverId: string) => ({
  full: join(dirs.covers, `${coverId}-full.webp`),
  thumb: join(dirs.covers, `${coverId}-thumb.webp`),
});

/**
 * Turns an uploaded image into the two 16:9 pictures, centre-cropped whatever its shape (DESIGN.md).
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
      .resize(COVER.width, COVER.height, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toFile(files.full);
    await image
      .clone()
      .rotate()
      .resize(THUMB.width, THUMB.height, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toFile(files.thumb);
  } catch {
    throw new AppError(400, 'COVER_INVALID');
  }
}

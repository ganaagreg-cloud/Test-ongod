import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { AppError } from '../errors';
import type { UploadDirs } from './storage';

/** ADR-0021: the cover is 1400x1400, the thumbnail 400x400, both square WebP. */
export const COVER_SIZE = 1400;
export const THUMB_SIZE = 400;
const FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Refuses decompression bombs: a small file that expands to a huge bitmap. */
const MAX_INPUT_PIXELS = 50_000_000;

export const coverFiles = (dirs: UploadDirs, coverId: string) => ({
  full: join(dirs.covers, `${coverId}-${COVER_SIZE}.webp`),
  thumb: join(dirs.covers, `${coverId}-${THUMB_SIZE}.webp`),
});

/**
 * Turns an uploaded image into the two square covers, centre-cropped (DESIGN.md: covers are 1:1).
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
      .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toFile(files.full);
    await image
      .clone()
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toFile(files.thumb);
  } catch {
    throw new AppError(400, 'COVER_INVALID');
  }
}

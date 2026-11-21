/**
 * A photo from the phone, made small enough to send and stripped of what it
 * carries besides the picture.
 *
 * A phone camera hands over 3–12 MB at 12–48 megapixels. The model reads a
 * scorecard just as well at 1568 px on the long edge (it accepts up to 2576,
 * but costs more and gains nothing on a printed table), and Netlify will not
 * take a request body much over 4.5 MB. Drawing the photo onto a canvas and
 * re-encoding it as a JPEG also drops its EXIF block — the GPS position and
 * camera details — because a canvas has only pixels to give back.
 */

/** Longest side sent to the reader, in px. */
export const LONG_EDGE = 1568;
/** Refused before decoding: a file this big is not a phone photo of a card. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const QUALITY = 0.85;
const FALLBACK_QUALITY = 0.7;
/** Above this after the first encode, try once more at the lower quality. */
const SOFT_LIMIT_BYTES = 1_500_000;

export class ScanImageError extends Error {
  readonly code: 'too_large' | 'bad_request';
  constructor(code: 'too_large' | 'bad_request') {
    super(code);
    this.code = code;
    this.name = 'ScanImageError';
  }
}

/** The size to draw at: the long edge capped, the aspect kept, never enlarged. */
export function targetSize(width: number, height: number, longEdge = LONG_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

/**
 * Decoded with the photo's own orientation applied. createImageBitmap with
 * `imageOrientation: 'from-image'` does that everywhere it exists; an <img>
 * is the fallback, and modern browsers orient those by EXIF too.
 */
async function decode(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Fall through: some browsers decode a format in <img> that
      // createImageBitmap refuses.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const encode = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

export async function prepareScanImage(file: Blob): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new ScanImageError('too_large');
  let img: Drawable;
  try {
    img = await decode(file);
  } catch {
    throw new ScanImageError('bad_request');
  }
  try {
    const size = targetSize(img.width, img.height);
    if (!size.width) throw new ScanImageError('bad_request');
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ScanImageError('bad_request');
    // White under the photo: a PNG screenshot with transparency would
    // otherwise encode its clear areas as black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img.source, 0, 0, size.width, size.height);
    let blob = await encode(canvas, QUALITY);
    if (blob && blob.size > SOFT_LIMIT_BYTES) blob = await encode(canvas, FALLBACK_QUALITY);
    if (!blob || blob.type !== 'image/jpeg') throw new ScanImageError('bad_request');
    return blob;
  } finally {
    img.close?.();
  }
}

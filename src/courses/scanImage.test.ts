import { describe, it, expect } from 'vitest';
import { targetSize, LONG_EDGE, MAX_INPUT_BYTES, prepareScanImage, ScanImageError } from './scanImage';

describe('targetSize', () => {
  it('caps the long edge of a portrait photo and keeps the aspect', () => {
    expect(targetSize(3024, 4032)).toEqual({ width: 1176, height: LONG_EDGE });
  });

  it('caps a landscape photo the same way', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: LONG_EDGE, height: 1176 });
  });

  it('never enlarges a small photo', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('says zero for an image with no size', () => {
    expect(targetSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(targetSize(NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('prepareScanImage', () => {
  it('refuses a file over the cap before decoding it', async () => {
    const huge = { size: MAX_INPUT_BYTES + 1 } as Blob;
    await expect(prepareScanImage(huge)).rejects.toEqual(new ScanImageError('too_large'));
  });
});

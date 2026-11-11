import type { VoucherMatch } from './voucherNumbers';

export type PhotoInput = {
  id: string;
  source: string | Blob;
};

export type OcrPass = {
  rotation: number;
  enhanced: boolean;
  width: number;
  height: number;
  text: string;
  confidence: number;
  region?: { left: number; top: number; width: number; height: number };
};

export type PhotoCandidate = VoucherMatch & {
  confidence: number;
  pass: number;
  // Coordinates refer to the processed image described by the corresponding pass.
  box: { x0: number; y0: number; x1: number; y1: number };
};

export type PhotoScanResult = {
  photoId: string;
  status: 'found' | 'uncertain' | 'not-found' | 'error';
  candidates: PhotoCandidate[];
  passes: OcrPass[];
  elapsedMs: number;
  error?: string;
};

export const isReliableCandidate = (candidate: PhotoCandidate): boolean =>
  candidate.reading === 'exact' && candidate.confidence >= 80;

export type PhotoScanSummary = {
  photos: PhotoScanResult[];
  voucherNumbers: string[];
  complete: boolean;
};

export const summarizePhotos = (
  photos: PhotoScanResult[]
): PhotoScanSummary => ({
  photos,
  voucherNumbers: [...new Set(
    photos.flatMap((photo) => photo.candidates.map((candidate) => candidate.voucherNumber))
  )].sort(),
  complete: photos.every((photo) => photo.status !== 'error'),
});

export const scanPhotos = async (
  photos: readonly PhotoInput[],
  recognizePhoto: (photo: PhotoInput) => Promise<PhotoScanResult>,
  onPhoto?: (photo: PhotoScanResult, completed: number, total: number) => void
): Promise<PhotoScanSummary> => {
  const results: PhotoScanResult[] = [];

  for (const photo of photos) {
    const started = performance.now();
    let result: PhotoScanResult;

    try {
      result = await recognizePhoto(photo);
    } catch (error) {
      result = {
        photoId: photo.id,
        status: 'error',
        candidates: [],
        passes: [],
        elapsedMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : String(error),
      };
    }

    results.push(result);
    onPhoto?.(result, results.length, photos.length);
  }

  return summarizePhotos(results);
};

import type { ObservationData } from '../utils/requests';
import type { PhotoInput, PhotoScanResult } from './scanPhotos';
import { isReliableCandidate } from './scanPhotos';
import { extractVoucherNumbers } from './voucherNumbers';

export type ValidationStatus = 'matched' | 'different' | 'not-found' | 'review' | 'incomplete' | 'no-photos';

export const validationLabels: Record<ValidationStatus, string> = {
  matched: 'Matching number detected',
  different: 'Different number detected',
  'not-found': 'No voucher number detected',
  review: 'Uncertain reading - review needed',
  incomplete: 'Incomplete scan',
  'no-photos': 'No photos to examine',
};

export type ObservationValidation = {
  observationId: number;
  expected: string;
  detected: string[];
  status: ValidationStatus;
  photos: PhotoScanResult[];
};

export const classifyObservation = (
  observation: ObservationData,
  photos: PhotoScanResult[]
): ObservationValidation => {
  const candidates = photos.flatMap((photo) => photo.candidates);
  const detected = [...new Set(candidates.map((candidate) => candidate.voucherNumber))].sort();
  const expectedMatch = extractVoucherNumbers(observation.voucherNumber.trim())
    .find((match) => match.reading === 'exact' && match.rawText === observation.voucherNumber.trim());
  const reliable = candidates.filter(isReliableCandidate);
  let status: ValidationStatus;

  if (photos.length !== observation.photos.length || photos.some((photo) => photo.status === 'error')) {
    status = 'incomplete';
  } else if (observation.photos.length === 0) {
    status = 'no-photos';
  } else if (candidates.length === 0) {
    status = 'not-found';
  } else if (detected.length !== 1 || reliable.length === 0 || !expectedMatch) {
    status = 'review';
  } else {
    status = detected[0] === expectedMatch.voucherNumber ? 'matched' : 'different';
  }

  return {
    observationId: observation.id,
    expected: observation.voucherNumber,
    detected,
    status,
    photos,
  };
};

export type ValidationProgress = {
  results: ObservationValidation[];
  completedPhotos: number;
  totalPhotos: number;
  currentObservation: number | null;
};

export const validateObservations = async (
  observations: readonly ObservationData[],
  scanners: ((photo: PhotoInput, signal?: AbortSignal) => Promise<PhotoScanResult>) |
    readonly ((photo: PhotoInput, signal?: AbortSignal) => Promise<PhotoScanResult>)[],
  signal: AbortSignal,
  onProgress: (progress: ValidationProgress) => void
): Promise<ValidationProgress> => {
  const workers = typeof scanners === 'function' ? [scanners] : scanners;
  if (workers.length === 0) throw new Error('At least one photo scanner is required.');
  const results = new Map<number, ObservationValidation>();
  const totalPhotos = observations.reduce((total, observation) => total + observation.photos.length, 0);
  const photoResults = observations.map(() => new Map<number, PhotoScanResult>());
  const jobs = observations.flatMap((observation, observationIndex) =>
    observation.photos.map((photo, photoIndex) => ({ photo, photoIndex, observationIndex }))
  );
  let nextJob = 0;
  let completedPhotos = 0;
  const snapshot = (currentObservation: number | null): ValidationProgress => ({
    results: observations.flatMap((_, index) => {
      const result = results.get(index);
      return result ? [result] : [];
    }), completedPhotos, totalPhotos, currentObservation,
  });

  if (!signal.aborted) {
    observations.forEach((observation, index) => {
      if (observation.photos.length === 0) {
        results.set(index, classifyObservation(observation, []));
      }
    });
    onProgress(snapshot(null));
  }

  await Promise.all(workers.map(async (scanPhoto) => {
    while (!signal.aborted && nextJob < jobs.length) {
      const { photo, photoIndex, observationIndex } = jobs[nextJob++];
      const observation = observations[observationIndex];
      onProgress(snapshot(observation.id));
      const started = performance.now();
      let result: PhotoScanResult;
      try {
        result = await scanPhoto(photo, signal);
      } catch (error) {
        result = {
          photoId: photo.id, status: 'error', candidates: [], passes: [],
          elapsedMs: Math.round(performance.now() - started),
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (signal.aborted) break;
      completedPhotos++;
      const photos = photoResults[observationIndex];
      photos.set(photoIndex, result);
      if (photos.size === observation.photos.length) {
        results.set(observationIndex, classifyObservation(
          observation,
          [...photos.entries()].sort(([a], [b]) => a - b).map(([, photo]) => photo)
        ));
      }
      onProgress(snapshot(observation.id));
    }
  }));
  const final = snapshot(null);
  onProgress(final);
  return final;
};

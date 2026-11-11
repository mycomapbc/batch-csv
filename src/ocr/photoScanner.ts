import type { PhotoCandidate, PhotoInput, PhotoScanResult, OcrPass } from './scanPhotos';
import { extractVoucherLines, getOverlappingImageRegions, getVoucherLabelRegions, hasVoucherLikeText } from './voucherNumbers';
import { isReliableCandidate } from './scanPhotos';
import type { Page } from 'tesseract.js';

const FIRST_PASS_MAX_EDGE = 2400;
const RETRY_MAX_EDGE = 3200;

const loadPhoto = async (source: PhotoInput['source'], signal?: AbortSignal): Promise<ImageBitmap> => {
  let blob: Blob;
  if (typeof source === 'string') {
    const response = await fetch(source, {
      mode: 'cors',
      credentials: 'omit',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Image request failed (${response.status}): ${source}`);
    }
    blob = await response.blob();
  } else {
    blob = source;
  }
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
};

const renderPhoto = (
  image: ImageBitmap,
  rotation: number,
  enhanced: boolean
): HTMLCanvasElement => {
  const maxEdge = enhanced ? RETRY_MAX_EDGE : FIRST_PASS_MAX_EDGE;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  const sideways = rotation === 90 || rotation === 270;
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  const context = canvas.getContext('2d', { willReadFrequently: enhanced });
  if (!context) {
    throw new Error('A 2D canvas is required for photo recognition.');
  }

  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);

  if (enhanced) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const grey =
        0.299 * pixels.data[index] +
        0.587 * pixels.data[index + 1] +
        0.114 * pixels.data[index + 2];
      const adjusted = Math.max(0, Math.min(255, (grey - 128) * 1.5 + 128));
      pixels.data[index] = adjusted;
      pixels.data[index + 1] = adjusted;
      pixels.data[index + 2] = adjusted;
    }
    context.putImageData(pixels, 0, 0);
  }

  return canvas;
};

export const createPhotoScanner = async (
  onProgress?: (status: string, progress: number) => void
) => {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    logger: ({ status, progress }) => onProgress?.(status, progress),
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });
  } catch (error) {
    await worker.terminate();
    throw error;
  }

  const scanPhoto = async (photo: PhotoInput, signal?: AbortSignal): Promise<PhotoScanResult> => {
    const started = performance.now();
    const candidates: PhotoCandidate[] = [];
    const passes: OcrPass[] = [];
    let image: ImageBitmap | undefined;
    let errorMessage: string | undefined;

    try {
      signal?.throwIfAborted();
      image = await loadPhoto(photo.source, signal);
      const attempts = [
        { rotation: 0, enhanced: false },
        { rotation: 0, enhanced: true },
        { rotation: 90, enhanced: true },
        { rotation: 180, enhanced: true },
        { rotation: 270, enhanced: true },
      ];

      for (const attempt of attempts) {
        signal?.throwIfAborted();
        const canvas = renderPhoto(image, attempt.rotation, attempt.enhanced);
        try {
          const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
          const pass = passes.length;
          passes.push({
            ...attempt,
            width: canvas.width,
            height: canvas.height,
            text: data.text,
            confidence: data.confidence,
          });
          const lines = (data.blocks ?? []).flatMap((block) =>
            block.paragraphs.flatMap((paragraph) => paragraph.lines)
          );
          for (const candidate of extractVoucherLines(lines)) {
            candidates.push({ ...candidate, pass });
          }
          if (!candidates.some(isReliableCandidate)) {
            for (const region of getVoucherLabelRegions(lines, canvas.width, canvas.height)) {
              signal?.throwIfAborted();
              // A located label is a single text block, unlike the scattered text in a full photo.
              await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
              let cropped: Page;
              try {
                ({ data: cropped } = await worker.recognize(
                  canvas, { rectangle: region }, { blocks: true, text: true }
                ));
              } finally {
                await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
              }
              const cropPass = passes.length;
              passes.push({
                ...attempt,
                width: canvas.width,
                height: canvas.height,
                region,
                text: cropped.text,
                confidence: cropped.confidence,
              });
              const croppedLines = (cropped.blocks ?? []).flatMap((block) =>
                block.paragraphs.flatMap((paragraph) => paragraph.lines)
              );
              for (const candidate of extractVoucherLines(croppedLines)) {
                candidates.push({ ...candidate, pass: cropPass });
              }
            }
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }

        if (candidates.some(isReliableCandidate)) {
          break;
        }
      }

      if (!candidates.some(isReliableCandidate) &&
          passes.some((pass) => hasVoucherLikeText(pass.text))) {
        for (const rotation of [0, 90, 180, 270]) {
          signal?.throwIfAborted();
          const canvas = renderPhoto(image, rotation, false);
          try {
            // Finish the grid even after a match so competing labels in other regions remain visible.
            for (const region of getOverlappingImageRegions(canvas.width, canvas.height)) {
              signal?.throwIfAborted();
              const { data } = await worker.recognize(
                canvas, { rectangle: region }, { blocks: true, text: true }
              );
              const pass = passes.length;
              passes.push({
                rotation,
                enhanced: false,
                width: canvas.width,
                height: canvas.height,
                region,
                text: data.text,
                confidence: data.confidence,
              });
              const lines = (data.blocks ?? []).flatMap((block) =>
                block.paragraphs.flatMap((paragraph) => paragraph.lines)
              );
              for (const candidate of extractVoucherLines(lines)) {
                candidates.push({ ...candidate, pass });
              }
            }
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
          if (candidates.some(isReliableCandidate)) break;
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      image?.close();
    }

    const reliable = candidates.some(isReliableCandidate);
    const uniqueNumbers = new Set(candidates.map((candidate) => candidate.voucherNumber));
    const status = errorMessage
      ? 'error'
      : reliable && uniqueNumbers.size === 1
        ? 'found'
        : candidates.length > 0
          ? 'uncertain'
          : 'not-found';

    return {
      photoId: photo.id,
      status,
      candidates,
      passes,
      elapsedMs: Math.round(performance.now() - started),
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  };

  // One worker per batch, called sequentially by scanPhotos.
  return { scanPhoto, terminate: () => worker.terminate() };
};

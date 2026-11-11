export type VoucherMatch = {
  voucherNumber: string;
  rawText: string;
  reading: 'exact' | 'corrected';
};

const digitCorrections: Record<string, string> = {
  O: '0',
  I: '1',
  L: '1',
  '|': '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
};

const standalonePrefix = /^BC[ \t]*[0-9OILZSBG|]{2}[ \t]*[-\u2010-\u2015\u2212]$/i;

export const hasVoucherLikeText = (text: string): boolean =>
  /(?<![A-Z0-9])BC[ \t]*[0-9OILZSBG|]{2}(?![A-Z])/i.test(text);

export const extractVoucherNumbers = (text: string): VoucherMatch[] => {
  // Keep the prefix and digit counts strict; OCR substitutions only apply in numeric positions.
  const pattern =
    /(?<![A-Z0-9])BC[ \t]*([0-9OILZSBG|]{2})[ \t]*[-\u2010-\u2015\u2212][ \t]*(?:\r?\n[ \t]*)?([0-9OILZSBG|]{5})(?![A-Z0-9])/gi;
  const matches: VoucherMatch[] = [];

  for (const match of text.matchAll(pattern)) {
    const rawYear = match[1].toUpperCase();
    const rawNumber = match[2].toUpperCase();
    const correctDigits = (value: string) =>
      value.replace(/[OILZSBG|]/g, (character) => digitCorrections[character]);
    const year = correctDigits(rawYear);
    const number = correctDigits(rawNumber);

    if (Number(year) < 25) {
      continue;
    }

    matches.push({
      voucherNumber: `BC${year}-${number}`,
      rawText: match[0],
      reading:
        year === rawYear && number === rawNumber ? 'exact' : 'corrected',
    });
  }

  return matches;
};

type TextLine = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export const getOverlappingImageRegions = (imageWidth: number, imageHeight: number) => {
  const width = Math.ceil(imageWidth / 2);
  const height = Math.ceil(imageHeight / 2);
  const lefts = [...new Set([0, Math.floor((imageWidth - width) / 2), imageWidth - width])];
  const tops = [...new Set([0, Math.floor((imageHeight - height) / 2), imageHeight - height])];
  return tops.flatMap((top) => lefts.map((left) => ({ left, top, width, height })));
};

export const getVoucherLabelRegions = (
  lines: readonly TextLine[],
  imageWidth: number,
  imageHeight: number
) => lines.flatMap((line) => {
  const prefix = line.text.trim();
  if (!standalonePrefix.test(prefix) ||
      extractVoucherNumbers(`${prefix}00000`).length === 0) {
    return [];
  }
  const width = line.bbox.x1 - line.bbox.x0;
  const height = line.bbox.y1 - line.bbox.y0;
  if (width <= 0 || height <= 0) return [];
  // Leave room for the wider second row without including QR/form borders above the prefix.
  const left = Math.max(0, Math.floor(line.bbox.x0 - width * 0.35));
  const top = Math.max(0, Math.floor(line.bbox.y0 - height * 0.1));
  const right = Math.min(imageWidth, Math.ceil(line.bbox.x1 + width * 0.35));
  const bottom = Math.min(imageHeight, Math.ceil(line.bbox.y1 + height * 2));
  return right > left && bottom > top
    ? [{ left, top, width: right - left, height: bottom - top }]
    : [];
}).slice(0, 4);

export const extractVoucherLines = (lines: readonly TextLine[]) =>
  lines.flatMap((line, index) => {
    const matches = extractVoucherNumbers(line.text).map((match) => ({
      ...match, confidence: line.confidence, box: { ...line.bbox },
    }));
    const continuations = lines.filter((next, nextIndex) => {
      if (nextIndex === index + 1) return true;
      if (nextIndex === index || !standalonePrefix.test(line.text.trim()) ||
          !/^[0-9OILZSBG|]{5}$/i.test(next.text.trim())) return false;
      const width = line.bbox.x1 - line.bbox.x0;
      const height = line.bbox.y1 - line.bbox.y0;
      const nextWidth = next.bbox.x1 - next.bbox.x0;
      const nextHeight = next.bbox.y1 - next.bbox.y0;
      const gap = next.bbox.y0 - line.bbox.y1;
      const centerOffset = Math.abs(
        (next.bbox.x0 + next.bbox.x1 - line.bbox.x0 - line.bbox.x1) / 2
      );
      // Sparse OCR can interleave form columns; only join a nearby row under this prefix.
      return width > 0 && height > 0 &&
        gap >= 0 && gap <= height &&
        centerOffset <= width * 0.35 &&
        nextWidth >= width * 0.5 && nextWidth <= width * 2 &&
        nextHeight >= height * 0.5 && nextHeight <= height * 2.5;
    });
    for (const next of continuations) {
      const combined = `${line.text.trimEnd()}\n${next.text.trimStart()}`;
      for (const match of extractVoucherNumbers(combined)) {
        if (!match.rawText.includes('\n')) continue;
        matches.push({
          ...match,
          confidence: Math.min(line.confidence, next.confidence),
          box: {
            x0: Math.min(line.bbox.x0, next.bbox.x0),
            y0: Math.min(line.bbox.y0, next.bbox.y0),
            x1: Math.max(line.bbox.x1, next.bbox.x1),
            y1: Math.max(line.bbox.y1, next.bbox.y1),
          },
        });
      }
    }
    return matches;
  });

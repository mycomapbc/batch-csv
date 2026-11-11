import type { PhotoInput } from './scanPhotos';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getObservationPhotos = async (input: string): Promise<PhotoInput[]> => {
  let id = input.trim();
  if (!/^[1-9]\d*$/.test(id)) {
    const url = new URL(id);
    if (
      !['www.inaturalist.org', 'inaturalist.org'].includes(url.hostname) ||
      !/^\/observations\/[1-9]\d*\/?$/.test(url.pathname)
    ) {
      throw new Error('Enter an iNaturalist observation ID or observation URL.');
    }
    id = url.pathname.split('/')[2];
  }

  const response = await fetch(`https://api.inaturalist.org/v1/observations/${id}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`iNaturalist request failed (${response.status}).`);
  }
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.results) || data.results.length !== 1) {
    throw new Error('iNaturalist did not return the requested observation.');
  }
  const observation: unknown = data.results[0];
  if (!isRecord(observation) || !Array.isArray(observation.photos)) {
    throw new Error('The observation response has no photos array.');
  }

  return parseObservationPhotos(observation.photos);
};

export const parseObservationPhotos = (photos: unknown): PhotoInput[] => {
  if (!Array.isArray(photos)) {
    throw new Error('The observation response has no photos array.');
  }
  return photos.map((photo: unknown) => {
    if (
      !isRecord(photo) ||
      typeof photo.id !== 'number' ||
      typeof photo.url !== 'string'
    ) {
      throw new Error('The observation contains invalid photo metadata; scan was not started.');
    }
    const url = new URL(photo.url);
    url.protocol = 'https:';
    url.pathname = url.pathname.replace(/\/square\./, '/original.');
    return { id: String(photo.id), source: url.href };
  });
};

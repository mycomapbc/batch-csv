import { throttledQueue } from 'throttled-queue';
import qs from 'query-string';
import * as constants from '../constants';
import { parseObservationPhotos } from '../ocr/inaturalist';
import type { PhotoInput } from '../ocr/scanPhotos';

export type ObservationRequestResult = {
  error: string | null;
  results: ObservationData[];
};

export type ObservationData = {
  id: number;
  observedOn: string;
  user: string;
  voucherNumber: string;
  species: string;
  photos: PhotoInput[];
  inMycoMapProject: boolean;
};

export const partitionObservations = (observations: ObservationData[]) => ({
  projectObservations: observations.filter((observation) => observation.inMycoMapProject),
  outsideProjectObservations: observations.filter((observation) => !observation.inMycoMapProject),
});

export const getObservations = async (
  userId: string,
  fromDate: string,
  toDate: string
) => {
  const throttle = throttledQueue({
    maxPerInterval: 5,
    interval: 1050,
  });

  const { results, totalResults, error } = await throttle(() =>
    getDataPacket(userId, fromDate, toDate, 1)
  );

  if (error) {
    return {
      error,
      results: [],
    };
  }

  let foundError = null;
  if (totalResults >= constants.INAT_REQUEST_RESULTS_PER_PAGE) {
    const totalPages = Math.ceil(
      totalResults / constants.INAT_REQUEST_RESULTS_PER_PAGE
    );
    for (let page = 2; page <= totalPages; page++) {
      // eslint-disable-next-line no-await-in-loop
      const { results: pageResults, error: pageError } = await throttle(() =>
        getDataPacket(userId, fromDate, toDate, page)
      );

      if (pageError) {
        foundError = pageError;
        break;
      }

      results.push(...pageResults);
    }
  }

  // sort them by voucher number, which is of the form BCxx-xxxxx where X is a number, and BC will be followed by the year - 25, 26 etc.
  // so we want BC25-00001 to come before BC26-00001, and BC25-00002 to come after BC25-00001
  results.sort((a, b) => {
    const [aYear, aNum] = (a.voucherNumber || '')
      .replace('BC', '')
      .split('-')
      .map((part: string) => parseInt(part, 10));

    const [bYear, bNum] = (b.voucherNumber || '')
      .replace('BC', '')
      .split('-')
      .map((part: string) => parseInt(part, 10));

    if (aYear !== bYear) {
      return aYear - bYear;
    }
    return aNum - bNum;
  });

  return { error: foundError, results };
};

export const getDataPacket = async (
  userId: string,
  fromDate: string,
  toDate: string,
  page: number
) => {
  const apiParams = {
    user_id: userId.trim(),
    d1: fromDate,
    d2: toDate,
    taxon_id: constants.INAT_FUNGI_AND_SLIME_MOULD_TAXON_IDS.join(','),
    verifiable: constants.VERIFIABLE,
    per_page: constants.INAT_REQUEST_RESULTS_PER_PAGE,
    order: 'asc',
    order_by: 'id',
    page,
  };

  const paramsStr = qs.stringify(apiParams);
  const apiUrl = `${constants.BASE_INAT_URL}?${paramsStr}`;

  const failure = (error: string) => ({
    totalResults: 0,
    results: [] as ObservationData[],
    error,
  });

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return failure(`iNaturalist request failed (${response.status}).`);
    }
    const rawData: unknown = await response.json();
    if (!isRecord(rawData)) {
      return failure('Invalid observation response from iNaturalist.');
    }
    if (rawData.error) {
      return failure(String(rawData.error));
    }
    if (
      typeof rawData.total_results !== 'number' ||
      !Array.isArray(rawData.results)
    ) {
      return failure('Invalid observation response from iNaturalist.');
    }

    const trimmedData: ObservationData[] = rawData.results.map((obs: unknown) => {
      if (
        !isRecord(obs) ||
        typeof obs.id !== 'number' ||
        (typeof obs.observed_on !== 'string' && obs.observed_on !== null) ||
        !Array.isArray(obs.project_ids) ||
        !obs.project_ids.every((id: unknown) => typeof id === 'number') ||
        !Array.isArray(obs.ofvs)
      ) {
        throw new Error('Invalid observation or missing project membership data from iNaturalist.');
      }

      const voucherField = obs.ofvs.find(
        (field: unknown) => isRecord(field) && field.name === 'Voucher Number(s)'
      );
      return {
        id: obs.id,
        observedOn: obs.observed_on ?? '',
        user: userId.trim(),
        voucherNumber: isRecord(voucherField) && typeof voucherField.value === 'string'
          ? voucherField.value
          : '',
        inMycoMapProject: obs.project_ids.includes(constants.INAT_PROJECT_ID),
        species: isRecord(obs.taxon) && typeof obs.taxon.name === 'string'
          ? obs.taxon.name
          : 'Unidentified',
        photos: parseObservationPhotos(obs.photos),
      };
    });

    return {
      totalResults: rawData.total_results,
      results: trimmedData,
      error: null,
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

import { throttledQueue } from 'throttled-queue';
import qs from 'query-string';
import * as constants from '../constants';

export type ObservationRequestResult = {
  error: string | null;
  results: ObservationData[];
};

export type ObservationData = {
  id: number;
  observedOn: string;
  user: string;
  voucherNumber: string;
};

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
  results.sort((a: any, b: any) => {
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
    project_id: constants.INAT_PROJECT_ID,
    per_page: constants.INAT_REQUEST_RESULTS_PER_PAGE,
    order: 'asc',
    order_by: 'id',
    page,
  };

  const paramsStr = qs.stringify(apiParams);
  const apiUrl = `${constants.BASE_INAT_URL}?${paramsStr}`;

  let rawData;
  let error = null;
  try {
    const response = await fetch(apiUrl);
    rawData = await response.json();
  } catch (error) {
    if (error instanceof Error) {
      error = error.message;
    }
  }

  if (rawData.error) {
    return {
      totalResults: 0,
      results: [],
      error: rawData.error,
    };
  }

  // in order to be added to the project, we know the observatio has the voucher number field. It's also unique: you *can* add
  // a new field called "Voucher Number(s)", but iNat automatically adds a " :" suffix, so it'll be ignored here
  const trimmedData = rawData.results.map((obs: any) => ({
    id: obs.id,
    observedOn: obs.observed_on,
    user: userId,
    voucherNumber: obs.ofvs
      .filter((ofv: any) => ofv.name === 'Voucher Number(s)')
      .map((ofv: any) => ofv.value)[0],
  }));

  return {
    totalResults: rawData.total_results,
    results: trimmedData,
    error,
  };
};

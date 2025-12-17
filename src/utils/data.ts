export const downloadCSV = (data: any[]) => {
  const headers = [
    'Voucher Number',
    'iNat Number',
    'User Name',
    'Observed On',
    'Link to iNat',
  ];
  const csvRows = [headers.join(',')];

  data.forEach((row) => {
    const values = [
      row.voucherNumber,
      row.id,
      row.user,
      row.observedOn,
      `https://www.inaturalist.org/observations/${row.id}`,
    ];
    csvRows.push(values.map((v) => `"${v}"`).join(','));
  });

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'mycomap_observations.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const isValidVoucherNumber = (val: string) => {
  // crude, but checks for a basic BCxx-xxxxx pattern
  return val && /^BC2[5,6]\-\d{5}$/i.test(val);
};

export type InvalidData = {
  emptyVoucherEntries: any[];
  invalidVouchers: any[];
  obsWithDuplicateVoucherNums: any[];
  hasErrors: boolean;
};

export const findInvalidVoucherEntries = (
  data: any[],
  voucherNumFormatCheck: boolean
): InvalidData => {
  const emptyVoucherEntries = data.filter((entry) => {
    return !entry.voucherNumber || entry.voucherNumber.trim() === '';
  });

  // first check for invalid voucher number
  let invalidVouchers = [];
  if (voucherNumFormatCheck) {
    invalidVouchers = data.filter((entry) => {
      // remove any that are empty - those are caught above
      if (!entry.voucherNumber || entry.voucherNumber.trim() === '') {
        return false;
      }

      const voucherNumber = entry.voucherNumber;

      // voucher number is invalid format
      if (!isValidVoucherNumber(voucherNumber)) {
        return true;
      }

      return false;
    });
  }

  // next, check for duplicates in the current data set. Sadly, this isn't exhaustive: the only way to check
  // against all existing voucher numbers is to query iNat for each one sequentially. And with the 1 second limitation
  // of requests
  const obsWithDuplicateVoucherNums: any[] = [];
  const seenVouchers: Record<string, boolean> = {};

  data.forEach((entry) => {
    // remove any that are empty or invalid - those are caught above
    if (
      !entry.voucherNumber ||
      entry.voucherNumber.trim() === '' ||
      (voucherNumFormatCheck && !isValidVoucherNumber(entry.voucherNumber))
    ) {
      return;
    }

    const voucherNumber = entry.voucherNumber;
    if (seenVouchers[voucherNumber]) {
      obsWithDuplicateVoucherNums.push(entry);

      // also add the original entry that had this voucher number, if not already added
      const originalEntry = data.find(
        (e) => e.voucherNumber === voucherNumber && e.id !== entry.id
      );
      if (
        originalEntry &&
        !obsWithDuplicateVoucherNums.find((e) => e.id === originalEntry.id)
      ) {
        obsWithDuplicateVoucherNums.push(originalEntry);
      }
    } else {
      seenVouchers[voucherNumber] = true;
    }
  });

  return {
    emptyVoucherEntries,
    invalidVouchers,
    obsWithDuplicateVoucherNums,
    hasErrors:
      invalidVouchers.length > 0 || obsWithDuplicateVoucherNums.length > 0,
  };
};

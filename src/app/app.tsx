import React, { useEffect } from 'react';
import { UserFields } from '../fields/UserFields';
import { getObservations } from '../utils/requests';
import { DataTable } from '../dataTable/DataTable';
import { findInvalidVoucherEntries } from '../utils/data';
import type { InvalidData } from '../utils/data';
import { InvalidEntries } from '../dataTable/InvalidEntries';
import { CircularProgress } from '@mui/material';
import qs from 'query-string';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import GitHubIcon from '@mui/icons-material/GitHub';

export const App = () => {
  const [data, setData] = React.useState([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [voucherNumFormatCheck, setVoucherNumFormatCheck] =
    React.useState<boolean>(true);
  const [invalidData, setInvalidData] = React.useState<InvalidData>({
    emptyVoucherEntries: [],
    invalidVouchers: [],
    obsWithDuplicateVoucherNums: [],
    hasErrors: false,
  });
  const [hasMadeSearch, setHasMadeSearch] = React.useState<boolean>(false);
  const [searchData, setSearchData] = React.useState({
    username: '',
    fromDate: null,
    toDate: null,
  });

  useEffect(() => {
    if (!searchData.username) {
      return;
    }

    (async () => {
      setLoading(true);
      const { username, fromDate, toDate } = searchData;
      const observationData = await getObservations(
        username,
        fromDate!,
        toDate!
      );
      setInvalidData(
        findInvalidVoucherEntries(observationData, voucherNumFormatCheck)
      );
      setData(observationData);
      setLoading(false);
      setHasMadeSearch(true);
    })();
  }, [searchData]);

  // the `?voucherNumFormatCheck=false` can be used for people with custom voucher number formats to skip the format check.
  // it'll still catch duplicates, though.
  useEffect(() => {
    const parsed = qs.parse(location.search);
    const checkFormat = parsed.voucherCheck !== 'false';
    setVoucherNumFormatCheck(checkFormat);
  }, []);

  const handleRequestData = ({ username, fromDate, toDate }: any) => {
    setSearchData({ username, fromDate, toDate });
  };

  const getInvalidDataTable = () => {
    if (
      invalidData.invalidVouchers.length === 0 &&
      invalidData.obsWithDuplicateVoucherNums.length === 0
    ) {
      return null;
    }
    return (
      <InvalidEntries
        emptyVoucherEntries={invalidData.emptyVoucherEntries}
        invalidVouchers={invalidData.invalidVouchers}
        obsWithDuplicateVoucherNums={invalidData.obsWithDuplicateVoucherNums}
      />
    );
  };

  const getPageContent = () => {
    if (loading) {
      return (
        <p
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#0066cc',
            marginTop: 30,
          }}
        >
          <CircularProgress size={28} /> <span>Loading data...</span>
        </p>
      );
    }

    if (!hasMadeSearch) {
      return null;
    }

    if (data.length === 0) {
      return <p>No observations found.</p>;
    }

    return (
      <div style={{ marginTop: 30 }}>
        {getInvalidDataTable()}
        <DataTable data={data} hasErrors={invalidData.hasErrors} />
      </div>
    );
  };

  return (
    <>
      <AppBar position='static'>
        <Toolbar>
          <Typography variant='h6' component='div' sx={{ flexGrow: 1 }}>
            <a
              href='https://mycota.com/the-mycomap-bc-network/'
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              MycoMap BC
            </a>
          </Typography>

          <IconButton
            size='large'
            edge='start'
            color='inherit'
            aria-label='menu'
            sx={{ mr: 2 }}
            href='https://github.com/mycomapbc/batch-csv'
          >
            <GitHubIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <div style={{ margin: '0 auto', maxWidth: '1000px' }}>
        <h1>Batch Observations</h1>

        <p>
          This script creates a downloadable CSV of your BC MycoMap
          observations. It gathers all fungi and slime mould records you've
          tagged with the{' '}
          <a href='https://www.inaturalist.org/projects/mycomap-bc-a-dna-sequencing-project'>
            MycoMap BC project
          </a>{' '}
          on iNaturalist, limited to the date range you specify.
        </p>

        <UserFields onSubmit={handleRequestData} disabled={loading} />

        {getPageContent()}
      </div>
    </>
  );
};

import React, { useEffect } from 'react';
import { UserFields } from '../fields/UserFields';
import { getObservations, partitionObservations } from '../utils/requests';
import type { ObservationData } from '../utils/requests';
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
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

export const App = () => {
  const [data, setData] = React.useState<ObservationData[]>([]);
  const [outsideProjectData, setOutsideProjectData] = React.useState<ObservationData[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [voucherNumFormatCheck, setVoucherNumFormatCheck] =
    React.useState<boolean>(true);
  const [invalidData, setInvalidData] = React.useState<InvalidData>({
    emptyVoucherEntries: [],
    invalidVouchers: [],
    obsWithDuplicateVoucherNums: [],
    hasErrors: false,
  });
  const [hasMadeSearch, setHasMadeSearch] = React.useState<boolean>(false);
  const [resultsTab, setResultsTab] = React.useState<number>(0);
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
      setError(null);
      const { username, fromDate, toDate } = searchData;
      const { error, results } = await getObservations(
        username,
        fromDate!,
        toDate!,
      );

      if (error) {
        setError(error);
      }

      const { projectObservations, outsideProjectObservations } = partitionObservations(results);
      setInvalidData(findInvalidVoucherEntries(projectObservations, voucherNumFormatCheck));
      setData(projectObservations);
      setOutsideProjectData(outsideProjectObservations);
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
    setResultsTab(0);
    setSearchData({ username, fromDate, toDate });
  };

  const getInvalidDataTable = () => {
    if (
      invalidData.emptyVoucherEntries.length === 0 &&
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

    if (error) {
      return (
        <Alert severity='error' sx={{ marginTop: '12px' }}>
          An error occurred. Response from iNat: <b>{error}</b>
        </Alert>
      );
    }

    return (
      <div style={{ marginTop: 30 }}>
        <Tabs
          value={resultsTab}
          onChange={(_event, value: number) => setResultsTab(value)}
          aria-label='Observation results'
        >
          <Tab
            label='In MycoMap'
            id='mycomap-observations-tab'
            aria-controls='mycomap-observations-panel'
          />
          <Tab
            label='Not in MycoMap'
            id='without-mycomap-project-tab'
            aria-controls='without-mycomap-project-panel'
          />
        </Tabs>
        <div
          role='tabpanel'
          id='mycomap-observations-panel'
          aria-labelledby='mycomap-observations-tab'
          hidden={resultsTab !== 0}
        >
          {data.length === 0 ? (
            <p>No observations found.</p>
          ) : (
            <>
              {getInvalidDataTable()}
              <DataTable data={data} hasErrors={invalidData.hasErrors} showValidateImages />
            </>
          )}
        </div>
        <div
          role='tabpanel'
          id='without-mycomap-project-panel'
          aria-labelledby='without-mycomap-project-tab'
          hidden={resultsTab !== 1}
        >
          {outsideProjectData.length === 0 ? (
            <p>No observations found outside the MycoMap project.</p>
          ) : (
            <DataTable data={outsideProjectData} hasErrors={false} allowDownload={false} firstColumn='species' />
          )}
        </div>
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
        <h1>CSV Generation and Data Check</h1>
        <p>
          This script generates a downloadable CSV file of your{' '}
          <a
            href='https://www.inaturalist.org/projects/mycomap-bc-a-dna-sequencing-project'
            target='_blank'
            rel='noreferrer'
          >
            MycoMap BC
          </a>{' '}
          observations. This will locate all your fungi and slime mould
          observations on iNaturalist within your chosen observed-date range,
          grouped by whether they are in the{' '}
          <a
            href='https://www.inaturalist.org/observations?project_id=250590'
            target='_blank'
            rel='noreferrer'
          >
            MycoMap BC project
          </a>
          . Only project observations are validated and included in the CSV.
        </p>
        <UserFields onSubmit={handleRequestData} disabled={loading} />
        {getPageContent()}
      </div>
    </>
  );
};

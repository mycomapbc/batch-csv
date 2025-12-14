import React, { FC } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import TextField from '@mui/material/TextField';
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';

interface UserFieldsProps {
  onSubmit: any;
  disabled: boolean;
}

export const UserFields: FC<UserFieldsProps> = ({ onSubmit, disabled }) => {
  const [username, setUsername] = React.useState<string>('');
  const [fromDate, setFromDate] = React.useState<Dayjs | null>(null);
  const [toDate, setToDate] = React.useState<Dayjs | null>(null);

  const fromDateValid = fromDate && dayjs(fromDate).isValid();
  const toDateValid = toDate && dayjs(toDate).isValid();

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DemoContainer components={['DatePicker']}>
        <Grid
          container
          spacing={1}
          sx={{
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Grid size={5}>
            <TextField
              id='outlined-basic'
              label='iNat username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              variant='outlined'
              sx={{ width: '100%' }}
              disabled={disabled}
            />
          </Grid>
          <Grid size={3}>
            <DatePicker
              label='From Date'
              value={fromDate}
              onChange={(value) => setFromDate(value)}
              sx={{ width: '160px' }}
              disabled={disabled}
            />
          </Grid>
          <Grid size={3}>
            <DatePicker
              label='To Date'
              value={toDate}
              onChange={(value) => setToDate(value)}
              sx={{ width: '160px' }}
              disabled={disabled}
            />
          </Grid>
          <Grid size={1}>
            <Button
              variant='contained'
              onClick={() =>
                onSubmit({
                  username,
                  fromDate: fromDateValid
                    ? dayjs(fromDate).format('YYYY-MM-DD')
                    : null,
                  toDate: toDateValid
                    ? dayjs(toDate).format('YYYY-MM-DD')
                    : null,
                })
              }
              disabled={!username || !fromDate || !toDate || disabled}
            >
              Generate
            </Button>
          </Grid>
        </Grid>
      </DemoContainer>
    </LocalizationProvider>
  );
};

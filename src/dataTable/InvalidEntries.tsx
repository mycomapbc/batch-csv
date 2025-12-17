import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';

export const InvalidEntries = ({
  emptyVoucherEntries,
  invalidVouchers,
  obsWithDuplicateVoucherNums,
}: any) => {
  return (
    <Alert severity='error'>
      <div style={{ marginBottom: '10px' }}>
        The following observations have invalid voucher numbers. Click on the
        iNat number to edit the observation and correct the problem. After all
        problems have been resolved, do a fresh search to be able to download
        your CSV file.
      </div>
      <p>
        <b style={{ color: '#aa0000' }}>
          Please note that after fixing these issues on iNaturalist, it may take
          5-10 minutes for them to disappear from this list.
        </b>
      </p>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <b>Voucher Number</b>
              </TableCell>
              <TableCell>
                <b>iNat Number</b>
              </TableCell>
              <TableCell>
                <b>Error</b>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {emptyVoucherEntries.length > 0 &&
              emptyVoucherEntries.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{row.voucherNumber}</TableCell>
                  <TableCell>
                    <a
                      href={`https://www.inaturalist.org/observations/${row.id}`}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      {row.id}
                    </a>
                  </TableCell>
                  <TableCell>Missing voucher number</TableCell>
                </TableRow>
              ))}
            {invalidVouchers.length > 0 &&
              invalidVouchers.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{row.voucherNumber}</TableCell>
                  <TableCell>
                    <a
                      href={`https://www.inaturalist.org/observations/${row.id}`}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      {row.id}
                    </a>
                  </TableCell>
                  <TableCell>
                    Invalid voucher number format. Expected format: BC2x-xxxxx
                    (2025 and later)
                  </TableCell>
                </TableRow>
              ))}
            {obsWithDuplicateVoucherNums.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell>{row.voucherNumber}</TableCell>
                <TableCell>
                  <a
                    href={`https://www.inaturalist.org/observations/${row.id}`}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {row.id}
                  </a>
                </TableCell>
                <TableCell>
                  Duplicate voucher number in current data set
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Alert>
  );
};

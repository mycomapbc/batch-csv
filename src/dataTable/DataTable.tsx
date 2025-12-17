import React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { Button } from '@mui/material';
import { downloadCSV } from '../utils/data';

export type DataTableProps = {
  data: any[];
  hasErrors: boolean;
};

export const DataTable = ({ data, hasErrors }: DataTableProps) => {
  const str = data.length === 1 ? 'observation found' : 'observations found';

  const downloadBtn = hasErrors ? null : (
    <Button variant='outlined' onClick={() => downloadCSV(data)}>
      Download CSV
    </Button>
  );

  return (
    <>
      <p>
        <b>{data.length}</b> {str}. {downloadBtn}
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
                <b>User Name</b>
              </TableCell>
              <TableCell>
                <b>Observed On</b>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row: any) => (
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
                <TableCell>{row.user}</TableCell>
                <TableCell>{row.observedOn}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

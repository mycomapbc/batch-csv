import React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { Box, Button, CircularProgress, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import { ValidateImagesDialog } from './ValidateImagesDialog';
import { validationColors } from './validationColors';
import { validationLabels } from '../ocr/validateObservations';
import type { ObservationValidation, ValidationStatus } from '../ocr/validateObservations';
import { downloadCSV } from '../utils/data';
import type { ObservationData } from '../utils/requests';

export type DataTableProps = {
  data: ObservationData[];
  hasErrors: boolean;
  allowDownload?: boolean;
  firstColumn?: 'voucherNumber' | 'species';
  showValidateImages?: boolean;
};

export const DataTable = ({
  data,
  hasErrors,
  allowDownload = true,
  firstColumn = 'voucherNumber',
  showValidateImages = false,
}: DataTableProps) => {
  const [validateImagesOpen, setValidateImagesOpen] = React.useState(false);
  const [validationStarted, setValidationStarted] = React.useState(false);
  const [validationRunning, setValidationRunning] = React.useState(false);
  const [validationResults, setValidationResults] = React.useState<ObservationValidation[]>([]);
  const [validationFilter, setValidationFilter] = React.useState<ValidationStatus | 'all'>('all');
  const [filterAnchor, setFilterAnchor] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setValidationStarted(false);
    setValidationResults([]);
    setValidationFilter('all');
    setFilterAnchor(null);
  }, [data]);
  const resultsById = new Map(validationResults.map((result) => [result.observationId, result]));
  const rowStatus = (row: ObservationData): ValidationStatus =>
    resultsById.get(row.id)?.status ?? 'incomplete';
  const visibleData = showValidateImages && validationFilter !== 'all'
    ? data.filter((row) => rowStatus(row) === validationFilter)
    : data;
  const filterOptions: { status: ValidationStatus | 'all'; label: string; count: number }[] = [
    { status: 'all', label: 'All observations', count: data.length },
    ...(Object.keys(validationLabels) as ValidationStatus[]).map((status) => ({
      status,
      label: status === 'incomplete' ? 'Incomplete / not yet examined' : validationLabels[status],
      count: data.filter((row) => rowStatus(row) === status).length,
    })),
  ];
  const activeFilterLabel = filterOptions.find((option) => option.status === validationFilter)?.label;
  const str = data.length === 1 ? 'observation found' : 'observations found';

  const downloadBtn =
    hasErrors || !allowDownload ? null : (
      <Button variant='outlined' size='small' onClick={() => downloadCSV(data)}>
        Download CSV
      </Button>
    );

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          my: 2,
        }}
      >
        <span>
          <b>{data.length}</b> {str}.
          {showValidateImages && validationFilter !== 'all' && (
            <> Showing <b>{visibleData.length}</b>: {activeFilterLabel}.</>
          )}
        </span>
        {downloadBtn}
        {showValidateImages && (
          <Button
            type='button'
            variant='outlined'
            size='small'
            color='success'
            sx={{ marginLeft: 'auto' }}
            onClick={() => setValidateImagesOpen(true)}
            startIcon={validationRunning ? (
              <CircularProgress size={16} color='inherit' aria-label='Image validation in progress' />
            ) : undefined}
          >
            Validate Images
          </Button>
        )}
      </Box>

      {showValidateImages && (
        <ValidateImagesDialog
          open={validateImagesOpen}
          onClose={() => setValidateImagesOpen(false)}
          observations={data}
          onValidationStart={() => {
            setValidationStarted(true);
            setValidationRunning(true);
            setValidationResults([]);
          }}
          onValidationEnd={() => setValidationRunning(false)}
          onResultsChange={setValidationResults}
        />
      )}

      <TableContainer component={Paper}>
        <Table sx={showValidateImages ? { tableLayout: 'fixed' } : undefined}>
          {showValidateImages && (
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col style={{ width: 64 }} />
            </colgroup>
          )}
          <TableHead>
            <TableRow>
              <TableCell>
                <b>
                  {firstColumn === 'species' ? 'Species' : 'Voucher Number'}
                </b>
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
              {showValidateImages && (
                <TableCell align='center' aria-label='Image validation'>
                  {validationStarted && (
                    <>
                  <Tooltip title={`Filter image validation: ${activeFilterLabel}`}>
                    <IconButton
                      size='small'
                      aria-label={`Filter image validation: ${activeFilterLabel}`}
                      aria-haspopup='menu'
                      aria-controls={filterAnchor ? 'image-validation-filter' : undefined}
                      aria-expanded={Boolean(filterAnchor)}
                      color={validationFilter === 'all' ? 'default' : 'primary'}
                      onClick={(event) => setFilterAnchor(event.currentTarget)}
                    >
                      <FilterListIcon />
                    </IconButton>
                  </Tooltip>
                  <Menu
                    id='image-validation-filter'
                    sx={{
                      '& .MuiMenuItem-root, & .MuiListItemText-primary': {
                        fontFamily: "'Open Sans', sans-serif",
                        fontSize: '14px',
                      },
                    }}
                    anchorEl={filterAnchor}
                    open={Boolean(filterAnchor)}
                    onClose={() => setFilterAnchor(null)}
                  >
                    {filterOptions.map(({ status, label, count }) => (
                      <MenuItem
                        key={status}
                        selected={validationFilter === status}
                        onClick={() => {
                          setValidationFilter(status);
                          setFilterAnchor(null);
                        }}
                      >
                        <ListItemIcon>
                          {status === 'all' ? (
                            <FilterListIcon fontSize='small' />
                          ) : status === 'incomplete' ? (
                            <PendingOutlinedIcon fontSize='small' color='disabled' />
                          ) : status === 'matched' ? (
                            <CheckCircleOutlineIcon fontSize='small' sx={{ color: validationColors[status] }} />
                          ) : (
                            <ErrorOutlineIcon fontSize='small' sx={{ color: validationColors[status] }} />
                          )}
                        </ListItemIcon>
                        <ListItemText>{label}</ListItemText>
                        <Box component='span' sx={{ ml: 2, color: 'text.secondary' }}>{count}</Box>
                      </MenuItem>
                    ))}
                  </Menu>
                    </>
                  )}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleData.length === 0 && (
              <TableRow>
                <TableCell colSpan={showValidateImages ? 5 : 4} align='center'>
                  No observations match this filter.
                </TableCell>
              </TableRow>
            )}
            {visibleData.map((row) => {
              const result = resultsById.get(row.id);
              const incomplete = !result || result.status === 'incomplete';
              const label = result ? validationLabels[result.status] : 'Incomplete - not yet examined';
              return (
              <TableRow key={row.id}>
                <TableCell>{row[firstColumn]}</TableCell>
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
                {showValidateImages && (
                  <TableCell align='center'>
                    {validationStarted && (
                      <Tooltip
                        describeChild
                        slotProps={{
                          tooltip: { sx: { fontSize: '14px', lineHeight: 1.5 } },
                        }}
                        title={
                          <div>
                            <strong>{label}</strong>
                            <div>Project field: {row.voucherNumber || '(empty)'}</div>
                            {result ? (
                              <>
                                <div>Detected: {result.detected.join(', ') || 'none'}</div>
                                {result.status === 'matched' && (
                                  <div>All photos examined; a confident reading matches the project field.</div>
                                )}
                                {result.status === 'not-found' && (
                                  <div>No number recognized; this does not prove no label exists.</div>
                                )}
                                {result.photos.filter((photo) => photo.error).map((photo) => (
                                  <div key={photo.photoId}>Photo {photo.photoId}: {photo.error}</div>
                                ))}
                              </>
                            ) : (
                              <div>No complete result yet. This observation may be queued, scanning, or unexamined after an abort.</div>
                            )}
                          </div>
                        }
                      >
                        <Box
                          component='span'
                          tabIndex={0}
                          role='img'
                          aria-label={label}
                          sx={{ display: 'inline-flex', verticalAlign: 'middle' }}
                        >
                          {incomplete ? (
                            <PendingOutlinedIcon color='disabled' />
                          ) : result.status === 'matched' ? (
                            <CheckCircleOutlineIcon color='success' />
                          ) : (
                            <ErrorOutlineIcon sx={{ color: validationColors[result.status] }} />
                          )}
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                )}
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

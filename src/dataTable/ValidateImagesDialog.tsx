import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { validationColors } from './validationColors';
import type { ObservationData } from '../utils/requests';
import { createPhotoScanner } from '../ocr/photoScanner';
import {
  validateObservations,
  validationLabels,
} from '../ocr/validateObservations';
import type {
  ObservationValidation,
  ValidationProgress,
  ValidationStatus,
} from '../ocr/validateObservations';

type Props = {
  open: boolean;
  onClose: () => void;
  observations: ObservationData[];
  onValidationStart: () => void;
  onValidationEnd: () => void;
  onResultsChange: (results: ObservationValidation[]) => void;
};

const RECOGNITION_WORKERS = 15;

const resultExplanations: Record<ValidationStatus, string> = {
  matched:
    'The MycoMap number in the images have been confirmed to be the same number entered in the "Voucher Number(s):" metadata field on the iNat observation.',
  different:
    'There\'s a discrepancy between the number spotted in the iNat image, to what\'s entered in the "Vouncher Number(s):" field on the iNat observation - this is possibly an issue. Take a look!',
  'not-found':
    'No voucher number found in the images - this is possibly an issue - take a look!',
  'no-photos':
    'The observation has no photos available to examine. Its voucher number could not be checked against an image.',
  review:
    'Readings were uncertain, multiple different numbers were detected, or the entered voucher number could not be compared. Review the observation manually.',
  incomplete:
    'One or more photos could not be fully examined, for example because an image failed to load. No complete comparison is available.',
};

const duration = (milliseconds: number) => {
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export const ValidateImagesDialog = ({
  open,
  onClose,
  observations,
  onValidationStart,
  onValidationEnd,
  onResultsChange,
}: Props) => {
  const [phase, setPhase] = useState<
    'intro' | 'running' | 'done' | 'cancelled' | 'error'
  >('intro');
  const [progress, setProgress] = useState<ValidationProgress | null>(null);
  const [error, setError] = useState('');
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const scanStarted = useRef<number | null>(null);
  const [estimatedRemaining, setEstimatedRemaining] = useState<number | null>(
    null,
  );
  const running = phase === 'running';
  const totalPhotos = observations.reduce(
    (total, observation) => total + observation.photos.length,
    0,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const stop = () => {
    controller.current?.abort();
    setStopping(true);
  };

  const run = async () => {
    if (controller.current) return;
    const abortController = new AbortController();
    controller.current = abortController;
    onValidationStart();
    setPhase('running');
    setStopping(false);
    setError('');
    setEstimatedRemaining(null);
    scanStarted.current = null;
    setProgress({
      results: [],
      completedPhotos: 0,
      totalPhotos,
      currentObservation: null,
    });
    const scanners: Awaited<ReturnType<typeof createPhotoScanner>>[] = [];
    let outcome: 'done' | 'cancelled' | 'error' = 'done';

    try {
      if (totalPhotos > 0) {
        const initialized = await Promise.allSettled(
          Array.from(
            { length: Math.min(RECOGNITION_WORKERS, totalPhotos) },
            () => createPhotoScanner(),
          ),
        );
        for (const result of initialized) {
          if (result.status === 'fulfilled') scanners.push(result.value);
        }
        const failure = initialized.find(
          (result) => result.status === 'rejected',
        );
        if (failure?.status === 'rejected') throw failure.reason;
      }
      if (!abortController.signal.aborted) {
        scanStarted.current = performance.now();
        await validateObservations(
          observations,
          scanners.length > 0
            ? scanners.map((scanner) => scanner.scanPhoto)
            : async () => {
                throw new Error('Image recognition worker is not available.');
              },
          abortController.signal,
          (next) => {
            if (!mounted.current) return;
            setProgress(next);
            onResultsChange(next.results);
            if (next.completedPhotos > 0 && scanStarted.current !== null) {
              const average =
                (performance.now() - scanStarted.current) /
                next.completedPhotos;
              setEstimatedRemaining(
                average * (next.totalPhotos - next.completedPhotos),
              );
            }
          },
        );
      }
      if (abortController.signal.aborted) outcome = 'cancelled';
    } catch (error) {
      outcome = abortController.signal.aborted ? 'cancelled' : 'error';
      if (mounted.current && outcome === 'error') {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      const cleanup = await Promise.allSettled(
        scanners.map((scanner) => scanner.terminate()),
      );
      const cleanupErrors = cleanup.filter(
        (result) => result.status === 'rejected',
      );
      if (cleanupErrors.length > 0) {
        outcome = 'error';
        if (mounted.current) {
          setError(
            `OCR cleanup failed: ${cleanupErrors
              .map((result) =>
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
              )
              .join('; ')}`,
          );
        }
      }
      controller.current = null;
      if (mounted.current) {
        setPhase(outcome);
        setStopping(false);
        onValidationEnd();
      }
    }
  };

  const results = progress?.results ?? [];
  const counts = (Object.keys(validationLabels) as ValidationStatus[]).map(
    (status) => ({
      status,
      count: results.filter((result) => result.status === status).length,
    }),
  );
  const completedPhotos = progress?.completedPhotos ?? 0;
  const percent = totalPhotos > 0 ? (completedPhotos / totalPhotos) * 100 : 0;

  return (
    <Dialog
      open={open}
      onClose={running ? undefined : onClose}
      aria-labelledby='validate-images-title'
      aria-describedby='validate-images-description'
      fullWidth
      maxWidth={false}
      sx={{
        '& .MuiDialog-paper': { width: '700px', maxWidth: 'calc(100% - 64px)' },
        '& .MuiDialogTitle-root, & .MuiDialogContent-root, & .MuiButton-root': {
          fontFamily: "'Open Sans', sans-serif",
        },
        '& .MuiDialogContent-root, & .MuiDialogContentText-root': {
          fontFamily: "'Open Sans', sans-serif",
          fontSize: '14px',
          lineHeight: '25px',
        },
      }}
    >
      <DialogTitle id='validate-images-title' sx={{ paddingRight: 7 }}>
        Validate Images
      </DialogTitle>
      <IconButton
        aria-label={running ? 'Abort validation' : 'Close Validate Images'}
        onClick={running ? stop : onClose}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <CloseIcon />
      </IconButton>
      <DialogContent sx={{ paddingTop: '6px' }}>
        {phase === 'done' && (
          <Alert severity='success' sx={{ mb: 2, fontFamily: 'inherit' }}>
            <strong>Generation complete</strong>
            <div>Close this modal to view the results on the main page.</div>
          </Alert>
        )}
        {phase === 'intro' ? (
          <DialogContentText component='div' id='validate-images-description'>
            <div>
              This performs an additional validation check on your iNat
              observation images. It examines each one to extract the MycoMap
              voucher number, and compares it against the voucher number
              recorded in the observation project fields to check for
              discrepancies. Results will be displayed here.
            </div>
            <div>
              <ul>
                <li>This isn't 100% accurate and may not catch all issues.</li>
                <li>
                  <Box
                    component='strong'
                    sx={{ fontWeight: 600, color: '#000' }}
                  >
                    This takes time!
                  </Box>{' '}
                  It has to load and examine each image individually.
                </li>
              </ul>
            </div>
            <Alert
              severity='info'
              sx={{
                mt: 2,
                fontFamily: 'inherit',
                '& b': { fontWeight: 600, color: '#000' },
              }}
            >
              <b>{observations.length}</b> observations / <b>{totalPhotos}</b>{' '}
              photos to examine.
            </Alert>
          </DialogContentText>
        ) : (
          <Box id='validate-images-description'>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <h3>
                {running
                  ? 'Processing'
                  : phase === 'done'
                    ? 'Examination complete'
                    : phase === 'cancelled'
                      ? 'Examination stopped'
                      : 'Examination failed'}
              </h3>
              {running && !stopping && (
                <Box
                  component='span'
                  sx={{
                    marginLeft: 'auto',
                    fontSize: '12px',
                    textAlign: 'right',
                    color: 'text.secondary',
                  }}
                >
                  Remaining:{' '}
                  {estimatedRemaining === null
                    ? 'estimating...'
                    : `about ${duration(estimatedRemaining)}`}
                </Box>
              )}
            </Box>
            <LinearProgress
              variant={
                completedPhotos === 0 && running
                  ? 'indeterminate'
                  : 'determinate'
              }
              value={phase === 'done' ? 100 : percent}
              aria-label='Photo examination progress'
            />
            <Box
              component='p'
              role='status'
              sx={{ '& b': { fontWeight: 600, color: '#000' } }}
            >
              <b>{completedPhotos}</b> of <b>{totalPhotos}</b> photos examined;{' '}
              <b>{results.length}</b> of <b>{observations.length}</b>{' '}
              observations completed.
            </Box>
            {error && <Alert severity='error'>{error}</Alert>}
            {phase === 'cancelled' && (
              <Alert severity='warning' sx={{ fontFamily: 'inherit' }}>
                Partial results only. Unfinished observations have not been
                classified.
              </Alert>
            )}
            <h3>Results so far</h3>
            <ul>
              {counts
                .filter(
                  ({ status, count }) =>
                    count > 0 ||
                    (status !== 'incomplete' && status !== 'review'),
                )
                .map(({ status, count }) => (
                  <li key={status} style={{ marginBottom: 8 }}>
                    <Chip
                      label={count}
                      size='small'
                      sx={{
                        ...(count > 0 && {
                          backgroundColor: validationColors[status],
                          color: '#fff',
                        }),
                        minWidth: 32,
                        marginRight: 1,
                        fontWeight: 'bold',
                        fontFamily: 'inherit',
                      }}
                    />
                    {status === 'matched'
                      ? `matching ${count === 1 ? 'number' : 'numbers'} detected`
                      : status === 'different'
                        ? `different ${count === 1 ? 'number' : 'numbers'} detected`
                        : validationLabels[status].toLowerCase()}
                    <Tooltip
                      title={resultExplanations[status]}
                      describeChild
                      slotProps={{
                        tooltip: { sx: { fontSize: '14px', lineHeight: 1.5 } },
                      }}
                    >
                      <IconButton
                        size='small'
                        aria-label={`About ${validationLabels[status].toLowerCase()}`}
                        sx={{ ml: 0.5, color: 'text.secondary' }}
                      >
                        <InfoOutlinedIcon fontSize='small' />
                      </IconButton>
                    </Tooltip>
                  </li>
                ))}
            </ul>
            <p>
              Matches are based on confident image text readings, not a
              guarantee. No number detected does not mean no label exists.
            </p>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {running ? (
          <>
            <Button onClick={onClose}>Hide (continue processing)</Button>
            <Button onClick={stop} disabled={stopping}>
              {stopping ? 'Aborting...' : 'Abort'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Close</Button>
            {phase !== 'done' && (
              <Button
                variant='contained'
                color='primary'
                onClick={() => void run()}
              >
                {phase === 'intro' ? 'Run Validation' : 'Run Again'}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

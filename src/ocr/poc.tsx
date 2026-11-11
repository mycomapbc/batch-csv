import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getObservationPhotos } from './inaturalist';
import { createPhotoScanner } from './photoScanner';
import { scanPhotos } from './scanPhotos';
import type { PhotoInput, PhotoScanSummary } from './scanPhotos';

const Poc = () => {
  const [observation, setObservation] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<PhotoScanSummary | null>(null);

  const run = async () => {
    setBusy(true);
    setError('');
    setSummary(null);
    let scanner: Awaited<ReturnType<typeof createPhotoScanner>> | undefined;

    try {
      setProgress('Loading photo list...');
      const photos: PhotoInput[] = files.map((file, index) => ({
        id: `local-${index + 1}: ${file.name}`,
        source: file,
      }));
      if (observation.trim()) {
        photos.push(...await getObservationPhotos(observation));
      }
      if (photos.length === 0) {
        throw new Error('Choose local images or enter an observation with photos.');
      }

      let completed = 0;
      scanner = await createPhotoScanner((status, fraction) => {
        setProgress(`Photo ${completed + 1}/${photos.length}: ${status} (${Math.round(fraction * 100)}%)`);
      });
      const result = await scanPhotos(photos, scanner.scanPhoto, (photo, count) => {
        completed = count;
        setProgress(`Scanned ${count}/${photos.length}: ${photo.status}`);
      });
      setSummary(result);
      setProgress(`Finished scanning all ${photos.length} photos.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setProgress('Scan failed.');
    } finally {
      try {
        await scanner?.terminate();
      } catch (error) {
        setError(`OCR worker cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>MycoMap photo OCR proof of concept</h1>
      <p>
        Scan every photo of an iNaturalist observation, local images, or both.
        Recognition runs in your browser; images are not uploaded.
        OCR engine and English language assets are downloaded on first use.
      </p>
      <p>
        Experimental: printed labels are the starting point. Handwriting, small
        text, glare, and perspective may cause missed or incorrect readings.
        A missing reading does not prove a photo has no label.
      </p>
      <form onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <fieldset disabled={busy}>
          <label htmlFor='observation'>iNaturalist observation ID or URL (optional)</label>
          <input
            id='observation'
            type='text'
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            placeholder='https://www.inaturalist.org/observations/...'
          />
          <label htmlFor='photos'>Local images (optional, multiple allowed)</label>
          <input
            id='photos'
            type='file'
            accept='image/*'
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <button type='submit'>Scan all photos</button>
        </fieldset>
      </form>
      <p role='status'>{progress}</p>
      {error && <p role='alert'>{error}</p>}
      {summary && (
        <section>
          <h2>Results</h2>
          <p>
            Distinct candidates (including uncertain readings):{' '}
            <strong>{summary.voucherNumbers.join(', ') || 'None'}</strong>
          </p>
          {!summary.complete && <p role='alert'>Incomplete: one or more photos could not be fully scanned.</p>}
          {summary.voucherNumbers.length > 1 && <p role='alert'>Multiple numbers detected: review the photo evidence.</p>}
          {summary.photos.length === 0 && <p>No photos scanned.</p>}
          <table>
            <thead>
              <tr><th>Photo</th><th>Status</th><th>Candidates</th><th>Passes</th><th>Time</th></tr>
            </thead>
            <tbody>
              {summary.photos.map((photo) => (
                <tr key={photo.photoId}>
                  <td>{photo.photoId}</td>
                  <td>{photo.status}{photo.error && <p role='alert'>{photo.error}</p>}</td>
                  <td>
                    <ul>
                      {photo.candidates.map((candidate, index) => (
                        <li key={index}>
                          <strong>{candidate.voucherNumber}</strong>{' '}
                          ({candidate.reading}, line confidence {candidate.confidence.toFixed(0)}/100)
                          <br />Raw: <code>{candidate.rawText}</code>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>{photo.passes.length}</td>
                  <td>{(photo.elapsedMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details>
            <summary>Full evidence JSON (OCR text, bounding boxes, passes, timings)</summary>
            <pre>{JSON.stringify(summary, null, 2)}</pre>
          </details>
        </section>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) {
  throw new Error('OCR proof-of-concept root element is missing.');
}
createRoot(root).render(<Poc />);

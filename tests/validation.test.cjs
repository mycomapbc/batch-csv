const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyObservation, validateObservations } = require('../.test-build/ocr/validateObservations');

const observation = (id = 1, photoCount = 1) => ({
  id, voucherNumber: 'BC26-00123',
  photos: Array.from({ length: photoCount }, (_, index) => ({ id: `${id}-${index}`, source: 'test.jpg' })),
});
const photo = (number, options = {}) => ({
  photoId: 'photo', status: number ? 'found' : 'not-found',
  candidates: number ? [{
    voucherNumber: number, rawText: number, reading: 'exact', confidence: 95,
    pass: 0, box: { x0: 0, y0: 0, x1: 10, y1: 10 }, ...options,
  }] : [],
  passes: [], elapsedMs: 1,
});

test('classifies matching, different, missing, and no-photo observations', () => {
  assert.equal(classifyObservation(observation(), [photo('BC26-00123')]).status, 'matched');
  assert.equal(classifyObservation(observation(), [photo('BC26-00999')]).status, 'different');
  assert.equal(classifyObservation(observation(), [photo(null)]).status, 'not-found');
  assert.equal(classifyObservation(observation(1, 0), []).status, 'no-photos');
});

test('uncertain, conflicting, or invalid expected numbers require review', () => {
  assert.equal(classifyObservation(observation(), [photo('BC26-00123', { confidence: 60 })]).status, 'review');
  assert.equal(classifyObservation(observation(), [photo('BC26-00123', { reading: 'corrected' })]).status, 'review');
  assert.equal(classifyObservation(observation(1, 2), [
    photo('BC26-00123'), photo('BC26-00999'),
  ]).status, 'review');
  assert.equal(classifyObservation({ ...observation(), voucherNumber: '' }, [
    photo('BC26-00123'),
  ]).status, 'review');
});

test('does not confirm matches until all photos finish successfully', () => {
  assert.equal(classifyObservation(observation(1, 2), [photo('BC26-00123')]).status, 'incomplete');
  assert.equal(classifyObservation(observation(1, 2), [
    photo('BC26-00123'), { ...photo(null), status: 'error', error: 'Cannot load photo' },
  ]).status, 'incomplete');
  assert.equal(classifyObservation(observation(1, 2), [
    photo('BC26-00123'), photo(null),
  ]).status, 'matched');
});

test('normalizes exact expected format without correcting numeric OCR substitutions', () => {
  assert.equal(classifyObservation({ ...observation(), voucherNumber: ' bc26 – 00123 ' }, [
    photo('BC26-00123'),
  ]).status, 'matched');
  assert.equal(classifyObservation({ ...observation(), voucherNumber: 'BC26-OO123' }, [
    photo('BC26-00123'),
  ]).status, 'review');
});

test('scans all photos and observations after matches and errors, reporting progress', async () => {
  const updates = [];
  const calls = [];
  const result = await validateObservations(
    [observation(1, 2), observation(2), observation(3, 0)],
    async (input) => {
      calls.push(input.id);
      return input.id === '1-1'
        ? { ...photo(null), status: 'error', error: 'Failed image' }
        : photo('BC26-00123');
    },
    new AbortController().signal,
    (progress) => updates.push(progress)
  );
  assert.deepEqual(calls, ['1-0', '1-1', '2-0']);
  assert.equal(result.completedPhotos, 3);
  assert.equal(result.totalPhotos, 3);
  assert.deepEqual(result.results.map((row) => row.status), ['incomplete', 'matched', 'no-photos']);
  assert.equal(updates.at(-1).currentObservation, null);
});

test('cancellation stops further work and does not classify unfinished observations', async () => {
  const controller = new AbortController();
  const calls = [];
  const result = await validateObservations(
    [observation(1, 2), observation(2)],
    async (input) => {
      calls.push(input.id);
      controller.abort();
      return photo('BC26-00123');
    },
    controller.signal,
    () => {}
  );
  assert.deepEqual(calls, ['1-0']);
  assert.equal(result.results.length, 0);
});

test('two workers overlap scans without exceeding the pool or sharing a busy worker', async () => {
  const updates = [];
  const calls = [];
  let active = 0;
  let peak = 0;
  const busy = new Set();
  const worker = (id) => async (input) => {
    assert.equal(busy.has(id), false);
    busy.add(id);
    active++;
    peak = Math.max(peak, active);
    calls.push(input.id);
    await new Promise((resolve) => setTimeout(resolve, input.id === '1-0' ? 20 : 1));
    busy.delete(id);
    active--;
    if (input.id === '1-1') throw new Error('Failed photo');
    return { ...photo('BC26-00123'), photoId: input.id };
  };
  const result = await validateObservations(
    [observation(1, 2), observation(2, 2)],
    [worker(1), worker(2)],
    new AbortController().signal,
    (progress) => updates.push(progress)
  );
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(new Set(calls).size, 4);
  assert.equal(result.completedPhotos, 4);
  assert.deepEqual(result.results.map((row) => row.observationId), [1, 2]);
  assert.deepEqual(result.results.map((row) => row.status), ['incomplete', 'matched']);
  assert.equal(result.results[0].photos[0].photoId, '1-0');
  assert.match(result.results[0].photos[1].error, /Failed photo/);
  for (const update of updates) {
    for (const row of update.results) assert.equal(row.photos.length, 2);
  }
  const counts = updates.map((update) => update.completedPhotos);
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b));
});

test('parallel abort waits for active scans and starts no further jobs', async () => {
  const controller = new AbortController();
  let calls = 0;
  let settled = 0;
  const worker = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort();
    settled++;
    return photo('BC26-00123');
  };
  const result = await validateObservations(
    [observation(1, 4)],
    [worker, worker],
    controller.signal,
    () => {}
  );
  assert.equal(calls, 2);
  assert.equal(settled, 2);
  assert.equal(result.results.length, 0);
});

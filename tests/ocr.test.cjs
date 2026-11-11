const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractVoucherNumbers, extractVoucherLines, getVoucherLabelRegions, getOverlappingImageRegions, hasVoucherLikeText } = require('../.test-build/ocr/voucherNumbers');
const { scanPhotos } = require('../.test-build/ocr/scanPhotos');
const { getObservationPhotos } = require('../.test-build/ocr/inaturalist');

test('extracts complete identifiers, normalizes presentation, preserves zeroes', () => {
  assert.deepEqual(extractVoucherNumbers('Label: bc26 – 00123; BC25-99999 BC99-00001'), [
    { voucherNumber: 'BC26-00123', rawText: 'bc26 – 00123', reading: 'exact' },
    { voucherNumber: 'BC25-99999', rawText: 'BC25-99999', reading: 'exact' },
    { voucherNumber: 'BC99-00001', rawText: 'BC99-00001', reading: 'exact' },
  ]);
});

test('allows future two-digit years, but not years before 25', () => {
  assert.deepEqual(
    extractVoucherNumbers('BC24-12345 BC27-12345 BC30-12345').map((match) => match.voucherNumber),
    ['BC27-12345', 'BC30-12345']
  );
});

test('fallback trigger requires a voucher-like prefix, not generic text or isolated numbers', () => {
  for (const text of ['BC26-', 'BC26', 'BC26-\n7495', 'bc 27-0012', 'BC2G-OO123']) {
    assert.equal(hasVoucherLikeText(text), true, text);
  }
  for (const text of ['', 'Woodland specimen', '40495', 'Field Photos:', 'ABC26-', 'BC26XYZ']) {
    assert.equal(hasVoucherLikeText(text), false, text);
  }
});

test('recognizes a newline after the hyphen, preserving exact and corrected evidence', () => {
  for (const separator of ['\n', '\r\n', ' \n  ']) {
    const rawText = `BC26-${separator}00123`;
    assert.deepEqual(extractVoucherNumbers(rawText), [
      { voucherNumber: 'BC26-00123', rawText, reading: 'exact' },
    ]);
  }
  assert.equal(extractVoucherNumbers('BC26-\nOO123')[0].reading, 'corrected');
  for (const invalid of ['BC26-\n1234', 'BC26-\n123456', 'BC26-\n12\n345', 'BC26-\nOther text\n00123']) {
    assert.deepEqual(extractVoucherNumbers(invalid), []);
  }
});

test('joins adjacent OCR lines with combined bounds and conservative confidence, without duplicating single-line matches', () => {
  const lines = [
    { text: 'BC26-\n', confidence: 95, bbox: { x0: 10, y0: 10, x1: 100, y1: 30 } },
    { text: '00123\n', confidence: 72, bbox: { x0: 15, y0: 35, x1: 110, y1: 55 } },
    { text: 'BC27-00999\n', confidence: 90, bbox: { x0: 10, y0: 60, x1: 150, y1: 80 } },
  ];
  const matches = extractVoucherLines(lines);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].voucherNumber, 'BC26-00123');
  assert.equal(matches[0].confidence, 72);
  assert.deepEqual(matches[0].box, { x0: 10, y0: 10, x1: 110, y1: 55 });
  assert.equal(matches[1].voucherNumber, 'BC27-00999');
});

test('targets two-row voucher prefixes without depending on full-page reading order', () => {
  const lines = [
    { text: 'BC26-\n\n', confidence: 90, bbox: { x0: 141, y0: 217, x1: 256, y1: 249 } },
    { text: 'Other/Species:', confidence: 59, bbox: { x0: 671, y0: 254, x1: 833, y1: 275 } },
    { text: '0444', confidence: 96, bbox: { x0: 150, y0: 258, x1: 278, y1: 302 } },
  ];
  assert.deepEqual(extractVoucherLines(lines), []);
  assert.deepEqual(getVoucherLabelRegions(lines, 1024, 646), [
    { left: 100, top: 213, width: 197, height: 100 },
  ]);
  const cropped = extractVoucherLines([
    lines[0],
    { text: '40444\n', confidence: 96, bbox: { x0: 118, y0: 258, x1: 278, y1: 302 } },
  ]);
  assert.equal(cropped[0].voucherNumber, 'BC26-40444');
  assert.equal(cropped[0].reading, 'exact');
  assert.equal(cropped[0].confidence, 90);
});

test('joins spatially aligned voucher rows despite interleaved form text (photo 760878620)', () => {
  const prefix = {
    text: 'BC26-\n\n', confidence: 90,
    bbox: { x0: 461, y0: 561, x1: 637, y1: 610 },
  };
  const formText = {
    text: 'Yes 13 Ng\n\n', confidence: 60,
    bbox: { x0: 901, y0: 592, x1: 1070, y1: 621 },
  };
  const number = {
    text: '40246\n\n', confidence: 96,
    bbox: { x0: 418, y0: 622, x1: 665, y1: 691 },
  };
  const matches = extractVoucherLines([prefix, formText, number]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].voucherNumber, 'BC26-40246');
  assert.equal(matches[0].reading, 'exact');
  assert.equal(matches[0].confidence, 90);
  assert.deepEqual(matches[0].box, { x0: 418, y0: 561, x1: 665, y1: 691 });
  assert.equal(extractVoucherLines([number, formText, prefix]).length, 1);

  for (const bbox of [
    { x0: 901, y0: 622, x1: 1148, y1: 691 },
    { x0: 418, y0: 800, x1: 665, y1: 869 },
    { x0: 418, y0: 400, x1: 665, y1: 469 },
    { x0: 530, y0: 622, x1: 550, y1: 691 },
  ]) {
    assert.deepEqual(extractVoucherLines([prefix, formText, { ...number, bbox }]), []);
  }
  assert.deepEqual(extractVoucherLines([prefix, formText, { ...number, text: '4024' }]), []);
  assert.deepEqual(extractVoucherLines([prefix, formText, { ...number, text: '402466' }]), []);
  assert.equal(extractVoucherLines([prefix, formText, { ...number, confidence: 45 }])[0].confidence, 45);
  assert.equal(extractVoucherLines([prefix, formText, { ...number, text: '4O246' }])[0].reading, 'corrected');
});

test('label crops stay within image bounds and require a valid standalone prefix', () => {
  const line = (text) => ({
    text, confidence: 90, bbox: { x0: 1, y0: 1, x1: 100, y1: 30 },
  });
  assert.deepEqual(getVoucherLabelRegions([line('BC26-')], 110, 50), [
    { left: 0, top: 0, width: 110, height: 50 },
  ]);
  for (const text of ['BC24-', 'BC26-12345', 'Other form text', 'ABC26-']) {
    assert.deepEqual(getVoucherLabelRegions([line(text)], 1024, 646), []);
  }
  assert.equal(getVoucherLabelRegions(Array.from({ length: 10 }, () => line('BC26-')), 1024, 646).length, 4);
});

test('label crop excludes QR border above prefix while retaining the wider numeric row', () => {
  const regions = getVoucherLabelRegions([{
    text: 'BC26-\n\n', confidence: 91,
    bbox: { x0: 309, y0: 450, x1: 486, y1: 501 },
  }], 1752, 1316);
  assert.deepEqual(regions, [{ left: 247, top: 444, width: 301, height: 159 }]);
  const region = regions[0];
  assert.ok(region.top > 439, 'QR border must be outside the crop');
  assert.ok(region.left <= 277 && region.left + region.width >= 509);
  assert.ok(region.top + region.height >= 585, 'Full numeric row must be inside the crop');
});

test('fallback regions overlap, cover every edge, and contain the unobscured lower label', () => {
  const regions = getOverlappingImageRegions(2048, 1630);
  assert.equal(regions.length, 9);
  assert.deepEqual(regions.at(-1), { left: 1024, top: 815, width: 1024, height: 815 });
  assert.ok(regions.some((region) =>
    region.left <= 1354 && region.left + region.width >= 1809 &&
    region.top <= 1413 && region.top + region.height >= 1477
  ));
  for (const [width, height] of [[2048, 1630], [101, 79], [1, 1]]) {
    const grid = getOverlappingImageRegions(width, height);
    assert.ok(grid.length <= 9);
    for (const region of grid) {
      assert.ok(region.left >= 0 && region.top >= 0);
      assert.ok(region.width > 0 && region.height > 0);
      assert.ok(region.left + region.width <= width);
      assert.ok(region.top + region.height <= height);
    }
    assert.equal(grid[0].left, 0);
    assert.equal(grid[0].top, 0);
    assert.equal(grid.at(-1).left + grid.at(-1).width, width);
    assert.equal(grid.at(-1).top + grid.at(-1).height, height);
  }
});

test('rejects partial, embedded, missing-hyphen and wrong-length identifiers', () => {
  for (const text of [
    'ABC26-12345', 'BC26-123456', 'BC26-1234', 'BC26-12345A',
    'BC2026-12345', 'BC2612345', 'BC26-1234 5', 'no label',
  ]) {
    assert.deepEqual(extractVoucherNumbers(text), [], text);
  }
});

test('marks digit substitutions as uncertain evidence, never exact', () => {
  assert.deepEqual(extractVoucherNumbers('BC2G-OOI23'), [
    { voucherNumber: 'BC26-00123', rawText: 'BC2G-OOI23', reading: 'corrected' },
  ]);
  assert.deepEqual(extractVoucherNumbers('8C26-00123'), []);
});

const result = (photoId, voucherNumber) => ({
  photoId,
  status: voucherNumber ? 'found' : 'not-found',
  candidates: voucherNumber ? [{ voucherNumber, rawText: voucherNumber, reading: 'exact',
    confidence: 95, pass: 0, box: { x0: 0, y0: 0, x1: 10, y1: 10 } }] : [],
  passes: [],
  elapsedMs: 1,
});

test('scans ALL photos sequentially, including after a match and an error', async () => {
  const calls = [];
  const progress = [];
  let active = 0;
  const summary = await scanPhotos(
    ['first', 'broken', 'different', 'duplicate', 'empty'].map((id) => ({ id, source: id })),
    async (photo) => {
      assert.equal(active++, 0);
      calls.push(photo.id);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      if (photo.id === 'broken') throw new Error('CORS failure');
      return result(photo.id, photo.id === 'empty' ? null :
        photo.id === 'different' ? 'BC27-00002' : 'BC26-00001');
    },
    (photo, completed, total) => progress.push([photo.photoId, completed, total])
  );
  assert.deepEqual(calls, ['first', 'broken', 'different', 'duplicate', 'empty']);
  assert.deepEqual(summary.voucherNumbers, ['BC26-00001', 'BC27-00002']);
  assert.equal(summary.photos.length, 5);
  assert.equal(summary.complete, false);
  assert.equal(summary.photos[1].status, 'error');
  assert.match(summary.photos[1].error, /CORS/);
  assert.equal(summary.photos[4].status, 'not-found');
  assert.deepEqual(progress.at(-1), ['empty', 5, 5]);
});

test('empty photo list is distinct from a scanned photo without a number', async () => {
  const summary = await scanPhotos([], async () => assert.fail('Must not run OCR'));
  assert.deepEqual(summary, { photos: [], voucherNumbers: [], complete: true });
});

test('retains all observation photos and requests original image resolution', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://api.inaturalist.org/v1/observations/123');
    return { ok: true, json: async () => ({ results: [{ photos: [
      { id: 1, url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg' },
      { id: 2, url: 'https://static.inaturalist.org/photos/2/square.jpeg?x=1' },
    ] }] }) };
  });
  const photos = await getObservationPhotos('https://www.inaturalist.org/observations/123');
  assert.deepEqual(photos, [
    { id: '1', source: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg' },
    { id: '2', source: 'https://static.inaturalist.org/photos/2/original.jpeg?x=1' },
  ]);
});

test('reports API errors and invalid photo metadata instead of silently skipping photos', async (context) => {
  const mock = context.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429 }));
  await assert.rejects(getObservationPhotos('123'), /429/);
  mock.mock.mockImplementation(async () => ({
    ok: true, json: async () => ({ results: [{ photos: [{ id: 1 }] }] }),
  }));
  await assert.rejects(getObservationPhotos('123'), /invalid photo metadata/);
  await assert.rejects(getObservationPhotos('https://example.com/observations/123'), /observation ID/);
});

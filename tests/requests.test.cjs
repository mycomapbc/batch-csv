const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getObservations, getDataPacket, partitionObservations } = require('../.test-build/utils/requests');

const observation = (id, projectIds, voucher) => ({
  id,
  observed_on: '2026-10-01',
  project_ids: projectIds,
  photos: [],
  ofvs: voucher ? [{ name: 'Voucher Number(s)', value: voucher }] : [],
});
const response = (results, total = results.length) => ({
  ok: true,
  json: async () => ({ results, total_results: total }),
});

test('one taxonomy search keeps user/date filters and splits by membership, not voucher presence', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('user_id'), 'collector');
    assert.equal(params.get('d1'), '2026-10-01');
    assert.equal(params.get('d2'), '2026-10-31');
    assert.equal(params.get('taxon_id'), '47170,47685');
    assert.equal(params.get('verifiable'), 'any');
    assert.equal(params.has('project_id'), false);
    return response([
      observation(1, [250590], 'BC26-00001'),
      observation(2, [], 'BC26-00002'),
      observation(3, [250590]),
      observation(4, [123]),
    ]);
  });
  const data = await getObservations(' collector ', '2026-10-01', '2026-10-31');
  assert.equal(data.error, null);
  const groups = partitionObservations(data.results);
  assert.deepEqual(groups.projectObservations.map((obs) => obs.id), [1, 3]);
  assert.deepEqual(groups.outsideProjectObservations.map((obs) => obs.id), [2, 4]);
  assert.equal(groups.projectObservations[1].voucherNumber, '');
  assert.equal(groups.outsideProjectObservations[1].voucherNumber, '');
});

test('fetches every page and retains both groups on subsequent pages', async (context) => {
  const pages = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    pages.push(page);
    return response(page === 1
      ? Array.from({ length: 200 }, (_, index) => observation(index + 1, [250590]))
      : [observation(201, [], 'BC26-00100')], 201);
  });
  const data = await getObservations('collector', '2026-10-01', '2026-10-31');
  assert.equal(data.error, null);
  assert.deepEqual(pages, [1, 2]);
  assert.equal(data.results.length, 201);
  assert.equal(partitionObservations(data.results).outsideProjectObservations[0].id, 201);
});

test('empty results produce two empty groups', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => response([]));
  const data = await getObservations('collector', '2026-10-01', '2026-10-31');
  assert.deepEqual(partitionObservations(data.results), {
    projectObservations: [], outsideProjectObservations: [],
  });
});

test('preserves the identified scientific name, including higher-rank identifications', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => response([
    { ...observation(1, []), taxon: { name: 'Amanita muscaria', preferred_common_name: 'Fly Agaric' } },
    { ...observation(2, []), taxon: { name: 'Fungi' } },
    { ...observation(3, []), taxon: null },
  ]));
  const data = await getDataPacket('collector', '2026-10-01', '2026-10-31', 1);
  assert.equal(data.error, null);
  assert.deepEqual(data.results.map((obs) => obs.species), [
    'Amanita muscaria', 'Fungi', 'Unidentified',
  ]);
});

test('retains all photos from search results for validation without extra metadata requests', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => response([{
    ...observation(1, [250590]),
    photos: [
      { id: 11, url: 'https://static.inaturalist.org/photos/11/square.jpg' },
      { id: 12, url: 'https://static.inaturalist.org/photos/12/square.jpg' },
    ],
  }]));
  const data = await getDataPacket('collector', '2026-10-01', '2026-10-31', 1);
  assert.equal(data.error, null);
  assert.deepEqual(data.results[0].photos, [
    { id: '11', source: 'https://static.inaturalist.org/photos/11/original.jpg' },
    { id: '12', source: 'https://static.inaturalist.org/photos/12/original.jpg' },
  ]);
});

test('surfaces HTTP, network, invalid JSON, and missing membership errors', async (context) => {
  const mock = context.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 429 }));
  const request = () => getDataPacket('collector', '2026-10-01', '2026-10-31', 1);
  assert.match((await request()).error, /429/);
  mock.mock.mockImplementation(async () => { throw new Error('Network failed'); });
  assert.match((await request()).error, /Network failed/);
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new Error('Bad JSON'); } }));
  assert.match((await request()).error, /Bad JSON/);
  mock.mock.mockImplementation(async () => response([{ id: 1, observed_on: '2026-10-01', ofvs: [] }]));
  assert.match((await request()).error, /membership/);
});

test('later page failures remain explicit instead of appearing as complete results', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) =>
    new URL(url).searchParams.get('page') === '1'
      ? response([observation(1, [250590])], 201)
      : { ok: false, status: 503 }
  );
  const data = await getObservations('collector', '2026-10-01', '2026-10-31');
  assert.match(data.error, /503/);
});

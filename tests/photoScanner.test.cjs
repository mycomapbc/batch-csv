const { test } = require('node:test');
const assert = require('node:assert/strict');
const tesseract = require('tesseract.js');
const { createPhotoScanner } = require('../.test-build/ocr/photoScanner');

const page = (text = '') => ({
  text, confidence: text ? 90 : 0,
  blocks: text ? [{ paragraphs: [{ lines: [{
    text, confidence: 90, bbox: { x0: 1354, y0: 1413, x1: 1809, y1: 1477 },
  }] }] }] : [],
});

const setup = (context, recognize) => {
  let closed = 0;
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  context.after(() => {
    for (const [name, descriptor] of [['createImageBitmap', originalBitmap], ['document', originalDocument]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({
    width: 2048, height: 1630, close: () => { closed++; },
  }) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        fillRect() {}, translate() {}, rotate() {}, drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(0) }),
        putImageData() {},
      }),
    }),
  } });
  context.mock.method(tesseract, 'createWorker', async () => ({
    setParameters: async () => {},
    recognize,
    terminate: async () => {},
  }));
  return () => closed;
};

test('scanner reaches overlapping fallback, completes the grid and retains recovered evidence', async (context) => {
  const calls = [];
  const closed = setup(context, async (_canvas, options) => {
    calls.push(options);
    return { data: options.rectangle?.left === 1024 && options.rectangle?.top === 815
      ? page('BC26-40495') : options.rectangle ? page() : page('BC26') };
  });
  const scanner = await createPhotoScanner();
  try {
    const result = await scanner.scanPhoto({ id: 'example', source: new Blob() });
    assert.equal(result.status, 'found');
    assert.equal(result.candidates[0].voucherNumber, 'BC26-40495');
    assert.equal(result.candidates[0].confidence, 90);
    assert.equal(calls.filter((call) => call.rectangle).length, 9);
    assert.equal(calls.length, 14);
    assert.equal(result.passes.at(-1).region.top, 815);
    assert.equal(closed(), 1);
  } finally {
    await scanner.terminate();
  }
});

test('fallback abort starts no further regions and releases decoded image', async (context) => {
  const controller = new AbortController();
  let regions = 0;
  const closed = setup(context, async (_canvas, options) => {
    if (options.rectangle) {
      regions++;
      controller.abort();
    }
    return { data: options.rectangle ? page() : page('BC26') };
  });
  const scanner = await createPhotoScanner();
  try {
    const result = await scanner.scanPhoto({ id: 'example', source: new Blob() }, controller.signal);
    assert.equal(result.status, 'error');
    assert.equal(regions, 1);
    assert.equal(closed(), 1);
  } finally {
    await scanner.terminate();
  }
});

test('photos with no voucher-like text skip the expensive regional fallback', async (context) => {
    const calls = [];
    const closed = setup(context, async (_canvas, options) => {
      calls.push(options);
      return { data: page('Woodland specimen 12345') };
    });
    const scanner = await createPhotoScanner();
    try {
      const result = await scanner.scanPhoto({ id: 'no-label', source: new Blob() });
      assert.equal(result.status, 'not-found');
      assert.equal(calls.length, 5);
      assert.equal(calls.some((call) => call.rectangle), false);
      assert.equal(closed(), 1);
    } finally {
      await scanner.terminate();
    }
  });

test('confident normal readings skip the regional fallback', async (context) => {
    let calls = 0;
    setup(context, async () => {
      calls++;
      return { data: page('BC26-40495') };
    });
    const scanner = await createPhotoScanner();
    try {
      const result = await scanner.scanPhoto({ id: 'clear-label', source: new Blob() });
      assert.equal(result.status, 'found');
      assert.equal(calls, 1);
    } finally {
      await scanner.terminate();
    }
  });

test('spatially aligned label rows are recovered in one pass despite interleaved text', async (context) => {
    let calls = 0;
    setup(context, async () => {
      calls++;
      return { data: {
        text: 'BC26-\n\nYes 13 Ng\n\n40246',
        confidence: 82,
        blocks: [{ paragraphs: [{ lines: [
          { text: 'BC26-\n\n', confidence: 90, bbox: { x0: 461, y0: 561, x1: 637, y1: 610 } },
          { text: 'Yes 13 Ng\n\n', confidence: 60, bbox: { x0: 901, y0: 592, x1: 1070, y1: 621 } },
          { text: '40246\n\n', confidence: 96, bbox: { x0: 418, y0: 622, x1: 665, y1: 691 } },
        ] }] }],
      } };
    });
    const scanner = await createPhotoScanner();
    try {
      const result = await scanner.scanPhoto({ id: '760878620', source: new Blob() });
      assert.equal(result.status, 'found');
      assert.equal(result.candidates[0].voucherNumber, 'BC26-40246');
      assert.equal(result.candidates[0].confidence, 90);
      assert.equal(calls, 1);
    } finally {
      await scanner.terminate();
    }
});

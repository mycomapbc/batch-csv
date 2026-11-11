## Mycomap Batch Data

This is a tool to allow any Mycomap BC contributor generate a CSV file for the batch of submissions.

Tool found here: https://mycomapbc.github.io/batch-csv/

Searches include the selected user's fungi (Fungi) and slime mould (Mycetozoa)
observations within the observed-date range, including casual observations.
One paginated search is split client-side using iNaturalist's `project_ids`:
**MycoMap observations** contains members of project 250590, while
**Without MycoMap project** lists non-members, with or without a voucher field.
The non-project table shows the identified scientific taxon name under **Species**
instead of the voucher number (higher-rank names are shown when not identified to species).
Voucher validation and CSV export apply only to the project tab.

The project's **Validate Images** button opens a confirmation dialog.
While validation runs, **Hide (continue processing)** closes the dialog without
stopping the scan. Main-table results continue updating; click **Validate Images**
again to reopen the current progress. A spinner in that main-page button indicates
active work, including while the dialog is hidden.
The final table-column header has a single-select result filter with live counts.
Choose all observations or one validation category; incomplete includes observations
not yet fully examined. Rows update as results arrive, and a new search resets the
filter. Filtering only changes the table view, not CSV export.
Validation examines every photo of every observation in the project tab.
The main dialog uses a bounded pool of fifteen recognition workers. Each worker
downloads and processes one photo at a time; the next queued photo starts as soon
as a worker is free. Observation results appear only after all their photos
finish, and Abort stops new jobs and waits for active recognition passes to end.
The standalone POC continues to use one worker.
**Run Validation** replaces the introduction with live photo/observation progress,
a rough remaining-time estimate based on completed photos, and
running observation-level results. Every photo is examined, even after a match.
The project table reserves a fixed-width final column for image-validation icons.
Starting a run shows incomplete icons for all rows; completed observations update
live to green for matches or orange for discrepancies/uncertain or missing readings.
Failed or unfinished scans remain grey. Hover or keyboard-focus an icon for its
expected/detected numbers and any photo errors. Rerunning clears previous results;
a new search resets the icons.
Conflicting or uncertain readings need review; failed photos are incomplete,
and observations without photos are counted separately from scans with no number
detected. Results are advisory and do not block CSV download or change fields.
**Abort** stops after the current recognition pass (or aborts a pending
image fetch); unfinished observations are not classified. Close is available
after scanning stops. Results remain in the dialog until rerun or a new search.

For people currently not using the standard `BCxx-xxxxx` format, they can disable the check by including a `?voucherCheck=false` parameter on the webpage.

### Dev notes

This is a pretty lightweight script. To get running:

- `nvm install` (it uses node 24)
- `npm install`
- `npm run start`

Updating the script on github pages can be done by running `npm run update-gh-pages`. That builds the script beforehand, so it should be pretty self-contained.

Other note: the prod build hardcodes the base path to `batch-csv` for use on github pages, so it won't run locally. There's probably a better way to do this, but it's such a simple script, a better solution isn't really needed. You only need the dev build locally.

### Photo OCR proof of concept

Run `npm run start` and open `/ocr-poc.html` on the dev server. The normal CSV
generator is unchanged. Enter an iNaturalist observation ID/URL, select multiple
local image files, or both, then choose **Scan all photos**.

All recognition runs locally using Tesseract.js (WebAssembly in a Web Worker).
Images are never uploaded to an OCR service. The default Tesseract worker/core
and English language assets are downloaded from its external CDNs on first use;
this is not an offline build. Observation metadata and photos are fetched directly
from iNaturalist and its photo hosts. These hosts must permit CORS; fetch/decode
failures are reported per photo, not interpreted as missing labels.

The reusable logic is in `src/ocr/`:

- `voucherNumbers.ts`: extract `BC25-00001` through `BC99-99999`, preserving leading
  zeroes, normalizing case/spacing/dashes, and marking common OCR digit
  substitutions as **corrected**, never exact. A hyphen is required. Labels split
  after the hyphen (such as `BC26-` followed by `00123` on the next line) are
  recognized across adjacent OCR lines, retaining combined bounds and the lower
  of the two line confidence scores. When form text interleaves those rows in OCR
  order, a standalone prefix can also pair with a nearby, horizontally centered
  five-digit row directly below it. Size and distance checks prevent pairing
  unrelated numbers elsewhere on the form, without extra recognition passes.
- If full-image OCR finds a standalone voucher prefix but no confident complete
  number, retry a bounded crop around the prefix and the space below it.
  This helps with two-row labels mixed into form text, where full-image OCR can
  interleave unrelated lines or miss digits. At most four label regions are
  retried per full-image pass; evidence records the crop rectangle.
  Targeted crops use single-block text segmentation to preserve two-row labels
  and their hyphens; full photos continue to use sparse-text segmentation.
  Crops keep a small top margin to avoid including nearby QR-code/form borders
  that can become spurious characters and lower recognition confidence.
- If all full-image/prefix-crop attempts fail to produce a confident reading
  and OCR found voucher-like text (a `BC` plus two-digit year prefix),
  scan a 3-by-3 overlapping grid of half-width/half-height regions, including
  every edge of the photo. Start with the unmodified upright image and retry at
  90/180/270 degrees only if necessary. Finish each grid before stopping so
  competing labels remain visible. The prefix need not include a readable hyphen
  or complete number. Photos with only generic text, isolated numbers, or no
  recognized text skip this fallback. This adds up to 36 recognition passes only
  for unresolved voucher-like text, at the cost of potentially missing labels
  whose prefixes were never recognized.
  Low-confidence conflicting readings remain in the evidence and can still
  cause an observation to need review, even if a clear label is recovered.
- `photoScanner.ts`: reuse one English OCR worker across a sequential batch.
  Scan the full image (up to a 2400px longest edge), then, if no exact reading with
  line confidence >=80 is found, retry with grayscale/contrast at up to 3200px
  and rotations of 0, 90, 180, and 270 degrees. Stop retries for that photo on
  the first qualifying reading, but never skip subsequent photos. Originals are
  fetched for iNaturalist photos; images are not upscaled.
- `scanPhotos.ts`: collect every photo's evidence/errors and aggregate distinct
  candidates, including uncertain ones, without comparing to or correcting
  against the observation's voucher field.

`found` means one distinct candidate with at least one exact reading at the
experimental confidence threshold. `uncertain` means corrected/low-confidence
readings or multiple distinct candidates. Confidence is an OCR heuristic, not a
probability of correctness. `not-found` means no candidate was recognized, not
proof that no label exists. `error` means the scan was incomplete, even if an
earlier pass yielded candidates. The evidence JSON includes each pass's OCR text,
timing, and candidate line boxes in that pass's rotated/resized pixel coordinates.

This POC does not yet include perspective correction,
handwriting-specific models, or
persistent caching of scan results. Large originals and multi-pass scans can be
slow, particularly on phones. The same scanner powers the main page's advisory
image-validation dialog; the standalone POC remains available for local files.

Run `npm test` for extraction, batch sequencing/error handling, and photo-list
tests; `npx tsc --noEmit` for type checking. For accuracy evaluation, try real
printed/handwritten labels, rotated/small labels, conflicting labels, and photos
without labels. Check **exact identifier accuracy**, false positives, missed
labels, and per-photo times against manually recorded ground truth. Synthetic
printed labels alone do not establish real-world accuracy.

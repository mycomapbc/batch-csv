## Mycomap Batch Data

This is a tool to allow any Mycomap BC contributor generate a CSV file for the batch of submissions.

Tool found here: https://mycomapbc.github.io/batch-csv/

For people currently not using the standard `BCxx-xxxxx` format, they can disable the check by including a `?voucherCheck=false` parameter on the webpage.

### Dev notes

This is a pretty lightweight script. To get running:

- `nvm install` (it uses node 24)
- `npm install`
- `npm run start`

Updating the script on github pages can be done by running `npm run update-gh-pages`. That builds the script beforehand, so it should be pretty self-contained.

Other note: the prod build hardcodes the base path to `batch-csv` for use on github pages, so it won't run locally. There's probably a better way to do this, but it's such a simple script, a better solution isn't really needed. You only need the dev build locally.

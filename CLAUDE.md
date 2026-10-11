# Cancer Predisposition Differential

Static GitHub Pages app (no build). Clinical content lives in `js/data.js`; see README.md.
Run `node` checks against data.js after editing (every rule's site/histology/predicate/test must exist,
every NICPR gene must be covered by a condition).
After changing data.js, app.js or style.css, bump the `?v=` version on their tags in index.html so browsers load the new files.
When re-checking a source, update its date in `SOURCE_DATES` (and `DATA_CHECKED`) in data.js.

## Git

- Always commit and push directly to `main`.

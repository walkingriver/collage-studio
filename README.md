# Collage Studio

A dead-simple photo collage maker. Pick a page size and a layout, drop in photos, swap and
crop them, adjust colors, add text, then print or save as PDF or JPEG. It replaces Microsoft
Publisher for making family photo collages.

It's an installable web app (PWA) written in plain HTML, CSS and JavaScript:

- **No framework and no build step.** The files in `app/` are exactly what runs.
- **One folder to deploy.** Copy `app/` to any static web host. All paths are relative, so it
  works at a domain root or in a sub-folder.
- **Private.** Photos never leave the computer. There are no accounts, analytics or network calls.
- **Works offline** once it has been opened (service worker).
- **The only third-party code** is `app/vendor/fflate.js` (MIT), used to zip project files.

## Project layout

```
app/                  ← the whole app; deploy this folder
  index.html  sw.js  manifest.webmanifest  privacy.html  support.html
  css/  fonts/  icons/  vendor/
  js/
    model.js store.js layouts.js shapes.js geometry.js text.js adjust.js   pure logic (tested in Node)
    random-layout.js  "Surprise me": random mosaics and scattered prints
    render.js         the one renderer used for screen, thumbnails, JPEG and print/PDF
    interact/stage.js the editor canvas (drag, swap, crop, text boxes, drops)
    ui/               toolbar, pages strip, inspector, tray, dialogs, start screen
    io/               .collage files, open/save dialogs, autosave, IndexedDB
    export/           print-resolution rendering, print / Save as PDF
scripts/              dev server, icon + test-photo generators (dev only)
tests/unit/           node --test
tests/e2e/            Playwright (drives the real UI in Edge or Chrome)
```

## Run it locally

```bash
npm install          # dev tools only (Playwright)
npm run serve        # http://localhost:5173/
```

The page must be served over `http://localhost` or `https://`. Opening `index.html` straight from
disk (`file://`) won't work, because browsers block ES modules and service workers there. The
service worker is off on localhost unless you add `?sw=1` to the URL.

## Tests

```bash
npm test             # unit tests (Node)
npm run e2e          # end-to-end in Microsoft Edge; use PW_CHANNEL=chrome for Chrome
npx -p typescript tsc -p jsconfig.json   # optional type check of the JSDoc types
```

`tests/e2e/deploy.spec.js` copies `app/` into a sub-folder, serves it with Python's plain
`http.server`, and checks that it installs and works offline.

## Deploying (GitHub Pages)

`.github/workflows/pages.yml` runs the tests on every push. On `main` it publishes `app/` as-is.
Its only change is stamping `sw.js` with the commit id, so every deploy reaches installed copies
as an update.

One-time setup: **Settings → Pages → Source: GitHub Actions**. Because the `walkingriver`
GitHub account's site uses the custom domain `walkingriver.com`, the app is published at
`https://walkingriver.com/collage-studio/`.

The link-preview tags in `app/index.html` (`og:*`, `twitter:*`, canonical) spell out the full
address, because X and other sites need absolute URLs. Update them if the address changes.
The preview image and start-screen sample are drawn by `node scripts/make-marketing.mjs`.

> Choose the permanent address before people install the app or it goes in the Store.
> Autosaved work and the recent-files list belong to the web address, so moving to another
> domain later would leave them behind.

## Microsoft Store (free listing)

1. Partner Center: sign up as an individual developer (free) and reserve the app name.
2. Package it: go to <https://www.pwabuilder.com>, enter the app's URL and choose Windows.
   Enter the Package ID, Publisher ID and Publisher display name from Partner Center. If the
   website is down, PWABuilder also has a command-line tool.
3. Listing: category *Photo & video*.
   - Privacy policy: `…/collage-studio/privacy.html`.
   - Support: `…/collage-studio/support.html`.
   - Screenshots: 1366×768 or larger.
   - Store logo: `app/icons/store-300.png`.
4. Fill in the age-rating questionnaire, then submit.

Later updates are just a push to `main`. Resubmit to the Store only when the manifest or icons change.

## Before release: check on a real Windows PC

- [ ] Install from Edge (the ⊕ "App available" button). It should open in its own window with its own icon.
- [ ] Double-click a saved `.collage` file in File Explorer and confirm it opens in the app.
- [ ] Print to a real printer at 100% scale, and check that "Save as PDF" keeps the page size.
- [ ] Try display scaling at 125% and 150%, and add 20 or more full-size phone photos.
- [ ] Turn on airplane mode and relaunch the app.
- [ ] She makes one of her old Publisher collages start to finish without help.

## Licenses

- App code: all rights reserved by the author unless a license is added.
- `app/vendor/fflate.js`: MIT (`app/vendor/fflate.LICENSE`).
- Icons: Lucide, ISC.
- Fonts: SIL Open Font License 1.1 or Apache 2.0 (`app/fonts/LICENSES.md`).

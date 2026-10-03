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

## Deploying

The live app is at **`https://collagestudio.walkingriver.com/`**, served from `app/` with no
build step, via **Cloudflare Pages** (`walkingriver.com`'s DNS already lives on Cloudflare).

**One-time setup, in the Cloudflare dashboard:** create a Pages project connected to this
GitHub repo, with:
- **Build command:** `npm ci && npm test && node scripts/stamp-sw-version.mjs`
- **Build output directory:** `app`
- **Environment variable:** `NODE_VERSION` = `22`
- **Custom domain:** `collagestudio.walkingriver.com` (Cloudflare adds the DNS record for you,
  since the zone is already there)

Every push to `main` triggers a build on Cloudflare's own infrastructure — independent of the
GitHub Actions workflow below. `npm test` runs the fast unit tests as part of that build, so a
failing test blocks the deploy; the heavier Playwright end-to-end suite runs only in GitHub
Actions and doesn't gate this deploy. `scripts/stamp-sw-version.mjs` stamps `app/sw.js`'s
version from Cloudflare's `CF_PAGES_COMMIT_SHA`, so every deploy reaches already-installed
copies as an update. Every branch/PR also gets its own preview URL automatically.

The link-preview tags in `app/index.html` (`og:*`, `twitter:*`, canonical) spell out the full
address, because X and other sites need absolute URLs. Update them if the address ever changes.
The preview image and start-screen sample are drawn by `node scripts/make-marketing.mjs` (the
domain text is baked into the OG image's pixels, so re-run it after changing the address).

> Autosaved work and the recent-files list belong to the web address. The app previously lived
> at `walkingriver.com/collage-studio/`; it moved to its own subdomain while adoption was still
> near zero, mainly so it no longer shares an origin (and therefore browser storage) with the
> blog's ad/analytics scripts. Moving again later would strand anyone's saved work.

### The old address (`walkingriver.com/collage-studio/`)

Still live, but now just a redirect, published by `.github/workflows/pages.yml` to GitHub Pages
(unchanged from before, except it now deploys `redirect/` instead of `app/`). That folder exists
only because the link was already shared before the move:

- `redirect/index.html` sends the homepage to the new address.
- `redirect/404.html` is the project's 404 page, so GitHub Pages routes every other old path
  there too (e.g. `/collage-studio/privacy.html` → `.../privacy.html` on the new domain).
- `redirect/sw.js` replaces the real app's old service worker. It clears every cache the old
  app left behind, sends any tab still open on the old address to the new one, then
  unregisters itself — so a copy installed from the old address doesn't keep running forever
  on stale cached files.

This can be deleted once nothing meaningfully links to the old address any more.

## macOS app (Mac App Store)

Native Swift app in `mac/`. Same `.collage` project format as the web app.

```bash
open mac/CollageStudio.xcodeproj   # Xcode 15+, macOS 13+
```

Set your **Development Team**, then **Product → Archive** for App Store Connect. Details and a test checklist: [`mac/README.md`](mac/README.md).

Regenerate layout/shape JSON for the mac bundle after changing web layouts:

```bash
node scripts/export-mac-data.mjs
```

## Microsoft Store (free listing)

1. Partner Center: sign up as an individual developer (free) and reserve the app name.
2. Package it: go to <https://www.pwabuilder.com>, enter the app's URL and choose Windows.
   Enter the Package ID, Publisher ID and Publisher display name from Partner Center. If the
   website is down, PWABuilder also has a command-line tool.
3. Listing: category *Photo & video*.
   - Privacy policy: `https://collagestudio.walkingriver.com/privacy.html`.
   - Support: `https://collagestudio.walkingriver.com/support.html`.
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

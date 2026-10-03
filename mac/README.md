# Collage Studio (macOS)

Native macOS app for Collage Studio. UI code lives in `CollageStudio/`; shared logic is in the local Swift package `CollageStudioCore/`.

## Open in Xcode

1. Open `mac/CollageStudio.xcodeproj` in Xcode 15 or later.
2. Select the **CollageStudio** scheme and a **My Mac** destination.
3. Press **Run** (⌘R).

If fonts are missing from the tray or text previews, ensure `CollageStudio/Resources/Fonts` points at the web app fonts:

```bash
cd mac/CollageStudio/Resources
ln -sf ../../../app/fonts Fonts
```

Regenerate the Xcode project after adding Swift files:

```bash
node mac/scripts/generate-xcodeproj.mjs
```

## Autosave (crash recovery)

Unsaved work is written ~1.2s after each edit to:

`~/Library/Application Support/Collage Studio/autosave/` (`session.json` plus photo bytes).

On launch, if that session is **dirty** and contains photos or floating text boxes, the start screen offers **Pick up where I left off** (same rules as the web app). **Discard** removes the autosave folder. Saving to a `.collage` file marks the document clean; the autosave snapshot stays but no longer triggers the banner.

Flush also runs when the app backgrounds or quits.

## Command-line build

```bash
xcodebuild -project mac/CollageStudio.xcodeproj -scheme CollageStudio -configuration Debug build
```

## Mac App Store archive

1. Generate app icons if needed: `npm run mac-icons` (from repo root).
2. Set your **Development Team** on the CollageStudio target (Signing & Capabilities).
3. **Product → Archive**, then distribute through Organizer.
4. Entitlements: App Sandbox, user-selected read/write, and print (already in `CollageStudio.entitlements`).

**App Store Connect listing** (same product as the web/PWA build):

- Category: Photo & video
- Privacy policy: `https://collagestudio.walkingriver.com/privacy.html`
- Support URL: `https://collagestudio.walkingriver.com/support.html`
- Bundle ID: `com.walkingriver.collage-studio`
- No analytics or network use in the app; photos stay on device

## Test checklist (mirrors web app)

- [ ] **Start screen**: New collage, Open, recent projects list; **recovery banner** after unsaved quit
- [ ] **New collage**: Page size + layout picker creates a project
- [ ] **Open / Save / Save As**: `.collage` round-trip; dirty indicator clears after save
- [ ] **Autosave**: Edit without saving, force-quit (or ⌘Q), relaunch → “Pick up where I left off” restores work; Discard clears it
- [ ] **Photos**: Add from picker; fill empty slots; tray remove with confirmation when used
- [ ] **Stage**: Select slot; drag photo to swap; double-click photo enters crop; pan in crop mode
- [ ] **Adjust**: Brightness, contrast, saturation, warmth on selected photo
- [ ] **Text**: Add text box; edit in inspector; delete selection
- [ ] **Surprise me**: Mosaic and scatter layouts
- [ ] **Pages**: Strip navigation; add, duplicate, delete page
- [ ] **Layout / page size**: Dialogs apply to project
- [ ] **Undo / redo**: ⌘Z / ⇧⌘Z
- [ ] **Export**: JPEG (one or all pages); Print; Save as PDF
- [ ] **Shortcuts**: ⌘O, ⌘S, ⌘P, ⌘+ / ⌘- zoom on stage

## Layout

```
mac/
  CollageStudio.xcodeproj/
  CollageStudio/           App target sources + Resources
  CollageStudioCore/       Swift package (swift build)
  scripts/generate-xcodeproj.mjs
```

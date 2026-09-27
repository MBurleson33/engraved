# Engraved

*“I have engraved you on the palms of my hands.” Isaiah 49:16*

Free Scripture wallpapers for iPhone.

A static gallery of iPhone wallpapers, hosted free on GitHub Pages. No frameworks, no build tools beyond one small Python script.

## Folder layout

```
index.html        the whole site (HTML + CSS + JS)
wallpapers.json   the list of wallpapers (generated, safe to hand-edit)
full/             1320×2868 JPEGs people download
thumbs/           small WebP images for the grid
og.jpg            preview image when the link is shared
build.py          turns originals/ into full/, thumbs/, and wallpapers.json
originals/        your source files (NOT committed; see .gitignore)
```

## Adding wallpapers

1. Name each file `book-chapter-verse--style.png` and drop it in `originals/`:
   - `psalm-27-1--woodcut.png` → Psalm 27:1 · Woodcut
   - `2-corinthians-5-7--noir.png` → 2 Corinthians 5:7 · Noir
   - `john-3-16-17--stained-glass.png` → John 3:16-17 · Stained Glass
   - `psalm-23-1--woodcut--2.png` → a second Psalm 23:1 woodcut
2. Run `python3 build.py` (first time: `pip3 install Pillow`).
3. Optional: open `wallpapers.json` and fill in `"text"` with the verse wording (improves search and screen-reader text) or set `"featured": true` to pin one to the top. Your edits are kept on future builds.
4. Commit and push `full/`, `thumbs/`, and `wallpapers.json`.

Export originals at **1320 × 2868** if you can. The script warns when a file is smaller and would look soft.

Wallpapers are shown in Bible order, so every version of the same verse sits side by side.
Wallpapers added in the last 21 days get a "New" badge (change `NEW_DAYS` in index.html).

## Publishing on GitHub Pages

1. Create a repo and push this folder to it.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. The site goes live at `https://<username>.github.io/<repo>/`. For a custom domain, add it on the same page and create a CNAME DNS record.

## How saving works on iPhone

"Save to Photos" opens the iOS share sheet with the image attached, so people can tap **Save Image** and it goes straight to Photos. The full image is fetched as soon as a preview opens, so the share sheet appears instantly. Older iOS falls back to opening the image for press-and-hold saving. On desktop the button is a regular download.

Each wallpaper has its own link (e.g. `…/#psalm-27-1--woodcut`), so you can share a specific one.

## Renaming the site

Search `index.html` for "Engraved" (title, meta tags, header, footer).

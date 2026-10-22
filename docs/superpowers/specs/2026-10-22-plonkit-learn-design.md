---
type: design-spec
status: approved
date: 2026-10-22
project: plonkit-learn
---

# Plonk It Learn — design spec

A self-contained, offline-capable web app for learning GeoGuessr country metas
from the Plonk It guide, with a quiz engine, spaced repetition, and progress
tracking. Runs from a static site on GitHub Pages; works on the phone with the PC
switched off.

---

## 1. Problem and goals

The user has 371 MB of single-page saves of `plonkit.net` country guides
(`Country/*.html`, 247 files, 134 with real content). These are readable but not
studyable: each page is a long scroll of a React app with base64-inlined
images, saved by SingleFile.

The goal is a browser app that:

1. Lets the user pick a country and read its metas one at a time.
2. Quizzes them: show a meta's image, make them name the country.
3. Quizzes from one country, or from anywhere.
4. Remembers what they have seen, what they got wrong, and what they starred.
5. Works offline on the user's Android phone, with the PC switched off.
6. Is also usable from the PC.

Non-goals: accounts, server-side state, cloud sync, a database, editing guide
content, or replacing GeoGuessr itself.

### 1.1 Decisions taken during brainstorming

| Question | Decision |
|---|---|
| Quiz core | "Guess the country from the meta" |
| Quiz source scope | Per-country (always that country) **or** global random |
| Quiz screen | Image only; pick the country from a list of buttons |
| Reveal | The meta's text and Maps link are shown after answering |
| Progress tracking | Seen checkmarks, per-country progress, bookmarks, spaced repetition, stats, own notes |
| Data source | Re-fetch from plonkit.net as JSON |
| Project location | `F:\Ai\Orca\Utama\Plonkit-Learn` (keep the existing folder) |
| Run mode | Static PWA; installable and offline on the phone |
| Look | Dark theme, Plonk It green `#5EBF82` |
| Stack | Zero-build vanilla JS + ES modules, no npm, no build step |
| Hosting | GitHub Pages, public repository |

---

## 2. Verified facts about the source data

All figures below were measured against the live site or the local archive
during the design session on 2026-10-22.

### 2.1 Coverage

| Fact | Value | How it was established |
|---|---|---|
| Guides published upstream | 140 | `GET https://www.plonkit.net/api/guides` |
| Of those, actual guides | 139 | `/maps` is a directory page and carries no `__PRELOADED_DATA__` |
| Local HTML files | 247 (246 country pages plus the user's own `index (1).html`) | directory listing of `Country/` |
| Local country pages with real content | 134 | absence of the SPA error string in each file |
| Local country pages that are error stubs | 112 | presence of `Oops! There was an error loading the guide` |

**The 112 stub pages are not a broken download.** Sampling confirmed the
correlation exactly: 11/11 sampled stub slugs return HTTP 404 upstream, and
8/8 sampled content slugs return HTTP 200. Those countries simply have no
Plonk It guide.

**Five guides were renamed upstream after the archive was captured**, so they
appear locally as stubs but exist today:

| Local (404 now) | Current slug |
|---|---|
| `svalbard-and-jan-mayen` | `svalbard` |
| `cocos-keeling-islands` | `cocos-islands` |
| `south-georgia-and-south-sandwich-islands` | `south-georgia-sandwich-islands` |
| `united-states-minor-outlying-islands` | `us-minor-outlying-islands` |
| `united-states-virgin-islands` | `us-virgin-islands` |

**Six guides are new since the archive was captured**: `china`, `alaska`,
`hawaii`, `azores`, `madeira`, `israel-west-bank`.

Two upstream entries are not countries: `spillover-countries` and
`middle-earth`. `beginners-guide` is a general guide with no metas. These are
kept out of the country list; `spillover-countries` and `middle-earth` remain
available as browsable guides.

### 2.2 Volume

| Measure | Value |
|---|---|
| Steps (sections) across all guides | 476 |
| **Metas (tips)** | **5,303** |
| Images referenced by metas | 5,443 |
| Metas containing a `NOTE:` paragraph | 1,456 (27%) |
| Continent split | Europe 50, Asia 31, Africa 18, North America 16, South America 11, Oceania 9, Antarctica 1, General Guide 2 |
| Largest guide | `united-states`, 177 metas |
| Smallest guides | `martinique` 4, `iraq` 5, `belarus` 6, `south-georgia-sandwich-islands` 6 |

### 2.3 The data format

Every guide page embeds its content as JSON in a single script tag:

```html
<script id="__PRELOADED_DATA__" type="application/json"> { ... } </script>
```

The `data.public` object holds:

```jsonc
{
  "_id": "china", "title": "China", "slug": "china", "code": "CN",
  "cat": ["Asia"], "heroImage": "/images/china/banner1.jpg",
  "headerNotes": [],
  "steps": [
    { "kind": "tip", "title": "Identifying China", "items": [ ... ] },
    { "kind": "map", "title": "Coverage map", "text": "..." }
  ]
}
```

Step kinds: `tip` (404 steps, carry `items[]`) and `map` (72 steps, carry
`text`).

Item kinds inside a `tip` step, with counts across all guides:

| Kind | Count | Shape |
|---|---|---|
| `tip` | 5,303 | `data.image {imageUrl, imageLink, alt, width}`, `data.text` = array of markdown paragraphs |
| `centeredImage` | 141 | `imageUrl` |
| `divider` | 217 | — |
| `text` | 79 | `text` |
| `subsection` | 55 | heading |
| `centeredImageWithCaption` | 37 | `imageUrl` + caption |
| `centeredText` | 20 | `text` |
| `notes` | 3 | notes block |
| `centeredVideoWithCaption` | 2 | video + caption |
| `navButtons` | 1 | navigation block |

Text is Markdown. Common constructs: `**bold**`, `[label](url)`, `_italic_`, and
paragraphs beginning with `NOTE:`.

`data.image.imageLink` is the "see it on the map" target and resolves to one of:
a Google Maps short link (4,256 metas), a relative path equal to the image
itself (584), another http(s) URL (462), or nothing (1).

### 2.4 Images

| Fact | Value |
|---|---|
| Upstream original size | ~555 KB average (max observed 1,028 KB); served as WebP even for `.png` paths |
| Upstream total, all 5,443 images | ~2.5 GB |
| Images inside the local archive | 6,103, decoding to **261 MB** (avg 44 KB) |
| Archive image formats | 5,857 WebP, 246 PNG (the 246 PNGs are the site logo/favicon) |
| Resize support on the server | **None.** `?w=`, `?width=`, `?resize=` are all ignored; bytes are identical |

The archive's images are ~12x smaller than upstream because SingleFile
downscales them. That is why the archive is the preferred source.

The image host sits behind Cloudflare and Caddy and **hard rate-limits**:
sustained probing showed roughly 1 success per 3–6 s, with HTTP 429 beyond
that, and the limit did not reset immediately after a 25 s pause. Responses are
backed by Google Cloud Storage (`x-goog-*` headers) with
`Cache-Control: public, max-age=31536000`, but no bucket name or alternative
host is exposed, so the rate limit cannot be bypassed.

### 2.5 Machine and toolchain constraints

| Fact | Value |
|---|---|
| `npm` | **Broken** — `Cannot find module '../internal/lrucache'`. No build tooling that needs `npm install`. |
| `node` | v24.19.0, works. Built-in `node:test` runner works. |
| Python | 3.12.7, `Pillow` 12.3.0 present, `pip` present, `pytest` absent |
| Playwright | Chromium 1248 present at `%LOCALAPPDATA%\ms-playwright` |
| `gh` | Logged in as `aawwdadstumbal-png`; all 5 existing repos are private; plan field is empty (Free) |
| Tailscale | Installed, service present, client reports `NoState` (logged out) |
| cloudflared, mkcert | Installed |
| Free space | C: 7.1 GB, E: 71.9 GB, F: 28.6 GB |

**GitHub Pages on a private repository requires a paid GitHub plan.** This
account is on Free, so a public repository is required for Pages. The published
content is the public Plonk It guide material plus the app's own source; the
user's progress, notes and quiz history never leave the browser.

---

## 3. Architecture

```
F:\Ai\Orca\Utama\Plonkit-Learn\
  app\                              the static site — this is what gets published
    index.html
    styles.css
    app.js                          entry module
    js\
      data.js                       load + cache guide JSON, index
      store.js                      localStorage state, export/import
      md.js                         Markdown subset renderer
      render.js                     DOM builders for every screen
      router.js                     hash router
      quiz.js                       option generation, scoring
      srs.js                        SM-2-lite scheduling
      stats.js                      accuracy and weakness aggregation
    sw.js                           service worker
    manifest.webmanifest
    icons\
    data\
      index.json                    139-country list
      guides\<slug>.json            one file per guide
      img\<slug>\<metaId>.webp      one file per meta image
  tools\
    fetch_guides.py                 pull guide JSON from plonkit.net
    build_images.py                 decode the local pool, fetch the remainder
    serve.py                        local static server for development
  tests\
    test_extract.py                 python unittest
    test_quiz.mjs                   node:test
  run.cmd
  docs\superpowers\specs\           this document
  Country\                          the original archive — left untouched
  untitled.md                       the original request — left untouched
```

**No build step.** The browser loads ES modules directly. `tools/` produces
data files; the app never talks to plonkit.net at runtime.

**Why a static site and not a server:** the phone must work with the PC off.
A static origin plus a service worker is the only arrangement that satisfies
that without a hosted backend.

---

## 4. The data pipeline

### 4.1 `tools/fetch_guides.py`

1. `GET https://www.plonkit.net/api/guides` for the slug list.
2. For each slug, `GET https://www.plonkit.net/<slug>`, extract the
   `__PRELOADED_DATA__` JSON, reshape it, and write
   `app/data/guides/<slug>.json`.
3. Write `app/data/index.json`.

**Output shape for a guide:**

```jsonc
{
  "slug": "japan", "title": "Japan", "code": "JP", "continent": "Asia",
  "hero": "img/japan/hero.webp",
  "sections": [
    { "id": "s1", "title": "Identifying Japan", "kind": "tip", "metas": [
      { "id": "0D6J", "image": "img/japan/0D6J.webp",
        "mapsUrl": "https://goo.gl/maps/...", "width": 0.5,
        "text": ["markdown paragraph", ...] }
    ]},
    { "id": "s2", "title": "Region-specific clues", "kind": "tip",
      "extras": [ { "kind": "centeredImage", "image": "img/japan/summary.webp" } ],
      "metas": [ ... ] }
  ],
  "metaCount": 82
}
```

`extras` holds the non-tip item kinds (`centeredImage`, `divider`, `text`,
`subsection`, `centeredImageWithCaption`, `centeredText`, `notes`,
`centeredVideoWithCaption`) in document order, so the browse view can render
them in place between metas. A section with `kind: "map"` carries its `text`
instead of `metas`.

**Requirements:**

- **Idempotent and resumable.** The guide list from `/api/guides` carries each
  guide's `updatedAt`, so the list is fetched first and compared against the
  `updatedAt` recorded in the existing output file. A guide whose timestamp is
  unchanged is skipped without fetching its page at all. A partial run resumes
  where it stopped.
- **Rate-limited.** 2.5 s between requests, exponential backoff on HTTP 429,
  never aborts the whole run for one failure.
- **Shaped for the app.** Non-tip item kinds (`centeredImage`, `divider`,
  `text`, `subsection`, `centeredImageWithCaption`, `centeredText`, `notes`,
  `centeredVideoWithCaption`) are attached to the enclosing section as
  `extras`, in document order, so the browse view can show them in place.
- **Map steps** are kept as a section with `kind: "map"` and their `text`.
- **`NOTE:` paragraphs** are marked with `note: true` on the paragraph so the
  app can style them distinctly. A paragraph counts as a note when it starts
  with `NOTE` (case-insensitive) or is wrapped in `_..._` and mentions a note.

### 4.2 `tools/build_images.py`

Two tiers, both resumable, both writing to `app/data/img/<slug>/<metaId>.webp`.

**Tier 1 — the local archive (no network).** For each local `Country/*.html`:

1. Split the saved DOM into tip blocks.
2. For each block, extract the base64 image bytes and the rendered plain text.
3. Match each block to a meta in the fetched JSON by **text similarity**:
   normalise both to lowercase alphanumeric words, then compare.
4. Accept the match only above a similarity threshold (0.75 of the shorter
   string's words present in the longer). A meta whose wording changed since
   August is therefore *not* paired with a stale image.
5. Write the decoded bytes to `app/data/img/<slug>/<metaId>.webp`. The bytes
   are already WebP; they are copied, not re-encoded.

**Tier 2 — the network (background).** For every meta still without an image:

1. `GET https://www.plonkit.net<imageUrl>` with a `Referer` header. **The
   header is required** — without it the host returns 403.
2. Downscale to a maximum dimension of 1000 px and encode as WebP quality 78.
3. On HTTP 429, back off 30 s, 60 s, 120 s, 240 s, then skip and continue; the
   next run picks it up.
4. Skip any file that already exists.
5. Also fetch each guide's `heroImage` to `app/data/img/<slug>/hero.webp`.
   Heroes are optional: the country screen renders a gradient header with the
   country name when a hero is missing.

**Both tiers must be individually runnable and individually re-runnable.**

### 4.3 Volume to expect

| Outcome | Size |
|---|---|
| All 139 guides' JSON | ~4 MB |
| All 5,443 images at Tier 1 sizes | ~255 MB (the archive's own images) |
| Tier 2 images, once fetched | ~400–500 MB at 1000 px / q78 |

The published site is therefore roughly **300–700 MB**, dominated by images.
That is a large but workable GitHub Pages payload; the initial push is the slow
part, and after that only changed files are re-pushed.

---

## 5. The application

### 5.1 Screens

**Home** — a searchable grid of 139 country cards. Each card carries the
country's name, its ISO code as a badge, its continent, its meta count and a
progress bar. Above the grid: the global quiz entry point and links to stats
and review.

**Flags.** Country cards show the **ISO code as a styled badge** (for example
`JP`), not a flag image. Windows does not render regional-indicator flag emoji,
and fetching flag images from a third-party CDN would add a network dependency
and a build step that can fail. The badge is honest, offline-safe, and costs
nothing.

**Country** — hero image, the list of sections with meta counts, a progress
bar, and three actions: *Browse metas*, *Quiz this country*, *Make available
offline*.

**Meta** — the image, the rendered Markdown, `NOTE` paragraphs in a distinct
callout, and an *Open in Google Maps* link when the meta has one. Previous /
next controls. Actions: mark seen, star, add a personal note. Left and right
arrow keys navigate.

**Quiz** — the image only. Below it, 4–8 country buttons. On answering, the
meta's text and Maps link are revealed, the button turns green or red, and a
*Next* button appears. The session ends with a summary: correct out of total,
per-country breakdown, and what was missed.

**Stats** — metas seen overall, per-country accuracy, the weakest countries
ranked, the current streak, and the number of reviews due.

**Review** — starred metas, and the spaced-repetition queue.

### 5.2 Quiz mechanics

- **Country-scoped mode.** The meta is always drawn from the chosen country;
  the answer is that country. Distractors are other countries.
- **Global mode.** The meta is drawn from any country with metas; the answer
  is its country.
- **Distractors.** Two are drawn from the **same continent** as the answer
  (harder and more useful) and the remainder are drawn at random from any
  other country with metas. All options are shuffled.
- **Option count is exactly 6**, reduced only if there are fewer than 6
  candidate countries in total, in which case every candidate is offered and
  the minimum is 3.
- **A country must not be duplicated in the options.** Where a continent has
  too few countries to supply two distractors, the remainder is filled from the
  global pool.
- **Only countries with at least one meta** appear as options. Exactly one
  published guide, `beginners-guide`, has none; it is excluded from the option
  pool and from the country grid.
- **Answers are revealed, not graded by the user.** The app marks right or
  wrong, shows the full text, and records the result.
- **Session length** is 10 questions by default, with a *Skip* that ends the
  session early.

### 5.3 Spaced repetition

A light SM-2 over metas that have been quizzed:

- Each meta has a box (0–5) and a due date.
- Correct: box increases by 1, capped at 5. Due date moves out by
  `1, 2, 4, 8, 16, 32` days according to the new box.
- Wrong: box resets to 0, due immediately, and the meta is queued again inside
  the same session so it is asked twice.
- The *Review* screen lists metas whose due date has passed, plus starred
  metas.
- A meta that is correct while in a review session is not asked again in that
  same session.

### 5.4 State

One `localStorage` key, `plonkit-learn:v1`, holding a JSON document:

```jsonc
{
  "seen":       { "<country>:<metaId>": true },
  "bookmarked": { "<country>:<metaId>": true },
  "notes":      { "<country>:<metaId>": "my own note" },
  "srs":        { "<country>": { "<metaId>": { "box": 2, "due": 1730000000 } } },
  "history":    [ { "country": "japan", "metaId": "0D6J", "ok": true, "at": 1730000000 } ],
  "streak":     { "current": 4, "best": 11 }
}
```

`seen` will hold up to 5,303 keys; the whole document stays well under the
5 MB `localStorage` budget. History is capped at the most recent 2,000
entries.

**Export / import.** Because `localStorage` is keyed by origin, changing the
host or port would orphan the data. A *Settings* action exports the document
as a JSON file and imports it back.

### 5.5 Markdown rendering

The guide text uses a small Markdown subset. The renderer must handle:

- `**bold**`
- `[label](url)` — links; external links get `target="_blank" rel="noopener"`
- `_italic_`
- `NOTE:` paragraphs — styled as a callout, recognised before markdown parsing
- Literal URLs in plain text — linkified
- Everything else — escaped and rendered as text

Markdown is rendered by escaping the text **first**, then applying the
inline rules. Raw HTML in guide text is never injected.

### 5.6 Look and feel

- Dark theme by default. Background `#0f1214`, panel `#171b1e`, text `#e8ecef`,
  muted `#8b949e`, line `#262b2f`, accent `#5EBF82` (Plonk It's own green).
- The accent is used for buttons and progress fills. Text on the accent is
  `#06130c`, chosen for contrast against `#5EBF82` rather than picked by eye.
- Poppins for headings, Inter for body — the same pair the guide site uses.
- Cards on a responsive grid, 1 column on narrow phones, 2 on a small phone in
  landscape, 3–4 on a desktop.
- The quiz image is centred and constrained to the viewport height so the
  options are always reachable without scrolling.
- **Every element toggled with the `hidden` property also carries
  `[hidden] { display: none !important; }`** in the stylesheet. An author
  `display` rule beats the user agent's `[hidden]` rule at equal specificity,
  and the failure is silent.

### 5.7 Offline and installation

- `manifest.webmanifest` with the app name, a maskable icon, and
  `display: standalone`.
- The service worker precaches the shell: `index.html`, `styles.css`, every
  module in `js/`, `sw.js`, the manifest, the icons, and `data/index.json`.
- Guide JSON and images are cached on demand as they are requested.
- *Make available offline* on a country screen prefetches that country's
  guide JSON and all of its images into the cache, with a progress indicator.
- A *Make everything available offline* action in Settings prefetches all
  guides and all images.
- The service worker uses a cache-first strategy for `data/` and a
  stale-while-revalidate strategy for the app shell.

### 5.8 Local development

`run.cmd` starts `tools/serve.py` on port 8000 bound to `0.0.0.0` and opens
`http://127.0.0.1:8000`. Over the LAN the phone can reach
`http://192.168.18.13:8000`, but that origin is **not secure**, so the service
worker will not register there and the app cannot be installed on the phone
from the LAN address. The phone installs from the GitHub Pages URL.

---

## 6. Deployment

- A public GitHub repository `aawwdadstumbal-png/plonkit-learn`, created with
  `gh repo create --public`.
- A GitHub Actions workflow deploys the `app/` directory to GitHub Pages.
- `.gitignore` excludes the `Country/` archive (371 MB) and nothing else. The
  generated `app/data/` **is** committed, because GitHub Pages has to serve it
  and the phone has to be able to fetch it.
- `untitled.md`, the original request note, is committed. It is 300 bytes and
  documents where the project came from.

---

## 7. Testing and verification

| Layer | Tool | Covers |
|---|---|---|
| Extractor | Python `unittest` | JSON shaping, section/meta assignment, `NOTE` detection, rename resolution, idempotent re-run produces identical output |
| Image alignment | Python `unittest` | a known meta maps to the right image; a text-changed meta is deliberately **not** matched |
| Quiz engine | `node:test` | option generation (correct answer present exactly once, distractors unique, no duplicate countries, 4–8 options), scoring, SRS transitions, seen/bookmark writes |
| Browser | Playwright Chromium (already installed) | click home → country → meta → quiz → answer → stats; assert on the **rendered** result, not on event handlers; screenshot each screen |

The browser pass exists because of a known class of bug: a handler fires, the
state updates, and the screen still shows nothing. Only a rendered check
catches that.

### 7.1 Acceptance criteria

1. `python tools/fetch_guides.py` produces 139 guide files and an index of 139
   countries, totalling 5,303 metas.
2. `python tools/build_images.py` tier 1 fills the large majority of metas
   without network access; tier 2 fills the rest and is re-runnable.
3. Every country on the index opens, lists its sections, and its metas open
   one at a time with text, notes and Maps links.
4. A country-scoped quiz only ever asks about that country; a global quiz can
   ask about any country.
5. Every quiz question shows the image and not the answer text before the
   answer is given.
6. Answering correctly or incorrectly updates the seen set, the SRS box and
   the statistics, and the change survives a page reload.
7. A starred meta appears in Review; a meta answered wrongly comes back in a
   later session.
8. The app installs on Android Chrome from the GitHub Pages URL, and with the
   network off it still opens, browses, and quizzes using cached data.
9. A missing image shows a labelled placeholder; the app does not break.
10. The published site contains no personal data and no unpublished archive.

---

## 8. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| plonkit.net rate-limits image downloads | Certain | Tier 1 covers most images offline; tier 2 is slow, resumable and never blocks the build; missing images degrade to placeholders |
| Tier 1 alignment pairs a stale image with a changed meta | Medium | Text-similarity threshold rejects mismatches; the meta is re-fetched in tier 2 |
| A ~700 MB first push to GitHub Pages | High | One-time cost; excluded archive keeps the repository smaller than it looks; if the push proves impractical, publish the images separately |
| Service worker serves a stale app after an update | Medium | Stale-while-revalidate for the shell plus a version bump in the cache name |
| `localStorage` data orphaned by a change of origin | Low | Export/import in Settings; the GitHub Pages origin is stable from here on |
| The user expects a feature not in this spec | — | Scope changes are a new spec, not an edit to this one |

---

## 9. Open items

None blocking. Two decisions were deferred to implementation and are recorded
here so they are not lost:

- The exact image quality setting (1000 px / q78) is a tunable; if the
  published site proves too large it is lowered in one place in
  `build_images.py`.
- Whether `spillover-countries` and `middle-earth` get their own browse pages
  or are folded into a "special guides" section of the home screen.

---

## 10. Sources

All URLs retrieved 2026-10-22.

1. `https://www.plonkit.net/api/guides` — the published guide list (140
   entries: slug, title, ISO code, continent, `updatedAt`).
2. `https://www.plonkit.net/<slug>` — each guide page; the
   `__PRELOADED_DATA__` script tag holds the guide JSON.
3. `https://www.plonkit.net/images/...` — the image host. Requires a
   `Referer` header or it answers 403. Rate-limits with HTTP 429.
4. `F:\Ai\Orca\Utama\Plonkit-Learn\Country\*.html` — the local archive
   (SingleFile saves, August 2026).
5. `F:\Ai\Orca\Utama\Plonkit-Learn\Country\download-log.txt` — the capture
   log; every fetch is marked OK, which is what made the 112 stub pages look
   like a download failure rather than genuinely absent guides.

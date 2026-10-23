---
type: implementation-plan
date: 2026-10-22
project: plonkit-learn
spec: docs/superpowers/specs/2026-10-22-plonkit-learn-design.md
---

# Plonk It Learn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build an offline-capable web app that turns the 139 plonkit.net country guides into a study tool: browse a country's metas one at a time, and get quizzed on identifying a meta's country from its image alone.

**Architecture:** A static, zero-build PWA served from GitHub Pages. A Python pipeline (`tools/`) turns the upstream guide JSON into one app-shaped JSON file per country plus downscaled WebP images; the browser loads ES modules directly, keeps all user state in `localStorage`, and caches data through a service worker. All application logic lives in DOM-free ES modules so it can be tested under `node:test`; DOM code is confined to `js/dom.js` and `js/screens.js`.

**Tech Stack:** Vanilla JavaScript ES modules (no npm, no bundler), Python 3.12 (`Pillow` only), `node:test`, Python `unittest`, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-22-plonkit-learn-design.md` — read it before starting; this plan argues from it.

## Global Constraints

- **No npm.** `npm` is broken on this machine (`Cannot find module '../internal/lrucache'`). No package installs, no bundler, no framework, no test runner beyond `node:test` and stdlib `unittest`.
- **Nothing may be installed on `C:`** (7.1 GB free). `pip install` is not permitted; `Pillow` 12.3.0 and `unittest` are already available.
- **Plain ES modules.** The browser loads `js/*.js` directly via `<script type="module">`. No `require`, no `import` of anything outside `js/`.
- **DOM-free core.** `js/data.js`, `js/store.js`, `js/md.js`, `js/quiz.js`, `js/srs.js` and `js/stats.js` must not touch `document`, `window` or `localStorage` at import time, so `node --test` can import them directly.
- **No dependencies between DOM-free modules and `js/screens.js`.** Screens consume the core modules; the core never imports a screen.
- **Meta key format is `<slug>:<metaId>`** everywhere — in `localStorage`, in stats, in the SRS, in export/import.
- **Data output paths are fixed:** `app/data/index.json`, `app/data/guides/<slug>.json`, `app/data/img/<slug>/<metaId>.webp`, `app/data/img/<slug>/hero.webp`.
- **Guide JSON field names are fixed** and are the contract between Python and JavaScript: `slug`, `title`, `code`, `continent`, `hero`, `sections[]`, `metaCount`; section `{ id, title, kind, metas[], extras[], text[] }`; meta `{ id, image, mapsUrl, width, text[] }`.
- **Text is Markdown** in the source and stays Markdown in the JSON. Rendering to HTML happens only in `js/md.js`.
- **Any element toggled with the `hidden` property** must be covered by one global `[hidden] { display: none !important; }` rule at the top of `app/styles.css`. An author `display` rule beats the user agent's `[hidden]` rule at equal specificity, and the failure is silent.
- **The accent colour is `#5EBF82`** and text on the accent is `#06130c`, chosen for contrast against the accent rather than picked by eye.
- **The image host requires a `Referer` header** of `https://www.plonkit.net/` or it answers 403.
- **Never commit the `Country/` archive.** It is in `.gitignore`.
- **Python tests use `unittest`**, not `pytest`. Node tests use `node:test`. Both run from the project root.

## Review Focus

Five failure modes the spec implies that no task's happy path would catch. Each has a test pinned to the task that owns the code.

1. **A guide whose slug changed upstream.**    The local archive has `czech-republic`; the site now publishes `czechia`. If the pipeline trusts local filenames the app ships a country card that loads nothing, and if it trusts local filenames for the 5 renamed guides it silently loses Svalbard, Cocos Islands, South Georgia, and the two US territories. *Expected:* the index contains the current upstream slugs and the app never renders a card that fails to load. → Task 1, Task 14.
2. **A meta whose image was never downloaded.** The image host rate-limits, so some of the 5,443 images will be missing for a long time. *Expected:* a labelled placeholder, a working "Open in Google Maps" link, and a quiz that still asks the question. → Task 9, Task 10.
3. **A continent with too few countries to supply distractors.** Antarctica has 1 guide, Oceania 9, and a small country cannot supply two same-continent distractors. *Expected:* the option list still has the right size, contains no duplicate country, and contains the correct answer exactly once. → Task 6.
4. **Progress lost when the origin changes.** `localStorage` is keyed by origin, so moving from `http://192.168.18.13:8000` to the GitHub Pages URL orphans everything. *Expected:* export produces a file that imports back into an empty store with every field intact, and the app tells the user to export before moving. → Task 4, Task 11.
5. **A guide with zero metas.** `beginners-guide` is published with no metas. *Expected:* it never appears as a country card and is never offered as an answer option. → Task 1, Task 6, Task 8.

---

## File Structure

```
F:\Ai\Orca\Utama\Plonkit-Learn\
  app\
    index.html                     shell, module entry, screen containers
    styles.css                     dark theme, all screen styles
    manifest.webmanifest           PWA manifest
    sw.js                          service worker
    app.js                         entry module: wires router, store, screens
    js\
      dom.js                       el(), clear(), on()  (DOM only)
      data.js                      index + guide loading and caching
      store.js                     localStorage-backed state
      md.js                        Markdown subset renderer
      quiz.js                      option generation, question pool
      srs.js                       SM-2-lite scheduling
      stats.js                     accuracy and weakness aggregation
      router.js                    hash router
      screens.js                   every screen's DOM construction
      prefs.js                     the only module that touches window/localStorage
    icons\
      icon-192.png, icon-512.png, icon-maskable-512.png
    data\
      index.json                   generated
      guides\<slug>.json           generated
      img\<slug>\<metaId>.webp     generated
  tools\
    fetch_guides.py                upstream JSON -> app/data/guides + index.json
    build_images.py                local archive + network -> app/data/img
    serve.py                       local static server
  tests\
    test_fetch_guides.py           python unittest
    test_build_images.py           python unittest
    test_store.mjs                 node:test
    test_md.mjs                    node:test
    test_quiz.mjs                  node:test
    test_srs.mjs                   node:test
    test_stats.mjs                 node:test
    cdp.mjs                        minimal Chrome DevTools Protocol client
    test_browser.mjs               node:test, drives real Chromium
  run.cmd
  docs\superpowers\plans\2026-10-22-plonkit-learn.md
```

**Responsibility boundaries.** `js/dom.js` builds elements; `js/screens.js` composes them into screens and is the only file that knows about screen layout. `js/data.js` knows how to fetch and cache; it knows nothing about screens. `js/store.js` owns persistence; every other module receives what it needs as an argument, never reaching for a global store.

---

### Task 1: Guide pipeline — fetch and reshape

**Files:**
- Create: `tools/fetch_guides.py`
- Create: `tests/test_fetch_guides.py`
- Read (not modify): `data-source/*.json` — the 139 already-fetched upstream payloads, used as test fixtures

**Interfaces:**
- Consumes: `data-source/<slug>.json` (the raw `__PRELOADED_DATA__` payload) and `https://www.plonkit.net/api/guides`.
- Produces:
  - `fetch_guide_list(entries: list[dict]) -> None` — no, precisely:
  - `load_list(path: Path) -> list[dict]` — reads the guide list, each `{slug, title, code, cat, updatedAt}`.
  - `parse_preloaded(html: str) -> dict` — extracts and JSON-decodes the `__PRELOADED_DATA__` script tag; raises `ValueError` if absent.
  - `reshape(public: dict) -> dict` — the upstream `data.public` object to the app guide shape. This is the contract; `app/data/guides/<slug>.json` is exactly its return value.
  - `build_index(guides: list[dict]) -> list[dict]` — the list of index entries, in the order given.
  - `main() -> int` — the CLI.
- The app guide shape (fixed, this is the Python/JavaScript contract):

```jsonc
{
  "slug": "japan", "title": "Japan", "code": "JP", "continent": "Asia",
  "hero": "img/japan/hero.webp",
  "metaCount": 82,
  "sections": [
    { "id": "s1", "title": "Identifying Japan", "kind": "tip",
      "text": [], "extras": [], "metas": [
        { "id": "0D6J", "image": "img/japan/0D6J.webp",
          "mapsUrl": "https://goo.gl/maps/...", "width": 0.5,
          "text": ["markdown paragraph", "NOTE: ..."] }
      ]}
  ]
}
```

- Index entry shape: `{ slug, title, code, continent, metaCount, hero }`.

**Notes the implementer needs:**
- `continent` comes from `public["cat"][0]`. A guide whose `cat` is empty or whose first entry is not a known continent uses `"General"`.
- `code` may be missing on one guide; use `""`.
- A `map` step becomes `{kind: "map", text: [...], metas: [], extras: []}`.
- A `tip` step's items are walked in order. `kind: "tip"` items become metas; every other kind becomes an entry in `extras`, keeping `kind` and whichever of `imageUrl`, `text`, `title` it has. A `divider` carries a `title` that acts as a sub-heading and must be preserved.
- `meta.id` is the upstream item `id`. It is unique within a guide. If two items in one guide share an id, the second gets `id` + `"-"` + its 1-based index within the guide.
- `meta.image` is `img/<slug>/<metaId>.webp` when the meta has an `imageUrl`, otherwise `null`.
- `meta.mapsUrl` is `data.image.imageLink` when it is present **and differs from `imageUrl`**, otherwise `null`.
- `meta.width` is `data.image.width` or `null`.
- `meta.text` is `data.text` verbatim, including NOTE paragraphs. Do not strip or restructure them; `js/md.js` decides what is a note.
- `hero` is `img/<slug>/hero.webp` when `public["heroImage"]` exists, otherwise `null`.
- `metaCount` counts metas only, not extras.
- `id` for a section is `s1`, `s2`, … in document order across the whole guide.

- [x] **Step 1: Write the failing tests**

In `tests/test_fetch_guides.py`, add at the top of the file:

```python
import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import fetch_guides
```

Test cases:
- `test_parse_preloaded_returns_the_payload` — feed a minimal HTML string containing `<script id="__PRELOADED_DATA__" type="application/json">{"success":true,"data":{"public":{"slug":"x"}}}</script>`; assert `parse_preloaded(html)["data"]["public"]["slug"] == "x"`.
- `test_parse_preloaded_raises_when_absent` — feed `"<html></html>"`; assert it raises `ValueError`.
- `test_reshape_japan_produces_the_contract_shape` — load `data-source/japan.json`, take `["data"]["public"]`, call `reshape`, then assert:
  - `g["slug"] == "japan"`, `g["title"] == "Japan"`, `g["code"] == "JP"`, `g["continent"] == "Asia"`
  - `g["metaCount"] == 82`
  - `len(g["sections"]) == 4` and the last section has `kind == "map"`
  - the first meta's `id` is a non-empty string, its `image` starts with `"img/japan/"`, and its `text` is a non-empty list of strings
  - every meta's `text` list contains no entry that is not a `str`
- `test_reshape_marks_missing_image_as_null` — take a meta in the japan guide whose upstream item has no `imageUrl` (there is at least one) and assert `meta["image"] is None`.
- `test_reshape_keeps_divider_titles` — assert the japan guide's extras include at least one `{"kind": "divider"}` entry that carries a non-empty `title`.
- `test_reshape_counters_match_the_upstream_totals` — reshape all 139 files in `data-source/`, assert the sum of `metaCount` is `5303` and the number of guides is `139`.
- `test_build_index_excludes_guides_with_no_metas` — build the index from all 139 reshaped guides; assert `beginners-guide` is not in it and every other guide is; assert the index has 138 entries and each entry's `metaCount` equals the guide's.
- `test_index_uses_current_upstream_slugs` — assert the index contains `"svalbard"`, `"cocos-islands"`, `"south-georgia-sandwich-islands"`, `"us-minor-outlying-islands"`, `"us-virgin-islands"`, and `"china"`; and does **not** contain `"svalbard-and-jan-mayen"`, `"cocos-keeling-islands"`, `"united-states-virgin-islands"`.
- `test_reshape_is_deterministic` — reshape the japan guide twice and assert the two results are equal (`json.dumps` with `sort_keys=True`).

- [x] **Step 2: Run the tests to verify they fail**

Run: `python -m unittest tests.test_fetch_guides -v`
Expected: `ModuleNotFoundError: No module named 'fetch_guides'` and then `ERROR: test_...` for each test.

- [x] **Step 3: Implement `tools/fetch_guides.py`**

Module-level constants:

```python
BASE_URL = "https://www.plonkit.net"
DATA_DIR = Path(__file__).resolve().parent.parent / "app" / "data"
SOURCE_DIR = Path(__file__).resolve().parent.parent / "data-source"
LIST_URL = f"{BASE_URL}/api/guides"
KNOWN_CONTINENTS = {"Europe", "Asia", "Africa", "North America", "South America", "Oceania", "Antarctica"}
```

Required functions with these exact names: `load_list(path)`, `parse_preloaded(html)`, `reshape(public)`, `build_index(guides)`, `write_guide(guide)`, `main()`.

`reshape` is the function that does the real work. Its body should:
1. Read `slug`, `title`, `code` (default `""`), `cat`, `heroImage` from `public`.
2. Compute `continent` as `cat[0]` if `cat` and `cat[0] in KNOWN_CONTINENTS` else `"General"`.
3. Walk `public["steps"]`, building one section per step with `id` `s1`, `s2`, … in order.
4. For a step with `kind == "map"`, set `kind = "map"`, `text = step.get("text") or []`, `metas = []`, `extras = []`.
5. For a step with `kind == "tip"`, set `kind = "tip"`, `text = []`, and walk `step["items"]`.
6. For each item, if `kind == "tip"` build a meta from `item["data"]`; otherwise append an extra carrying `kind` plus whichever of `imageUrl`, `text`, `title` the item has.
7. Track seen meta ids per guide; on a duplicate, suffix with `-<n>` where `n` is the 1-based index of that meta within the guide.
8. Set `image` to `f"img/{slug}/{meta_id}.webp"` when `data.image.imageUrl` is truthy, else `None`.
9. Set `mapsUrl` to `data.image.imageLink` when it is truthy and not equal to `data.image.imageUrl`, else `None`.
10. Set `width` to `data.image.width` when the key is present, else `None`.
11. Set `text` to `data.get("text") or []`.
12. `metaCount` is the number of metas across all sections.

`build_index(guides)` returns one entry per guide **that has at least one meta**, in the order the guides were given, each `{slug, title, code, continent, metaCount, hero}`.

`main()`:
- Fetch the guide list from `LIST_URL` unless `--list-from` names a local file. Use `urllib.request` with a `User-Agent` of `Mozilla/5.0` and a `Referer` of `BASE_URL`.
- For each entry in the list, if `data-source/<slug>.json` exists, use it; otherwise fetch `<BASE_URL>/<slug>`, parse the preloaded payload and write it to `data-source/<slug>.json`.
- Reshape and write `app/data/guides/<slug>.json` as UTF-8 JSON with `ensure_ascii=False` and `indent=1`.
- Build the index and write `app/data/index.json`.
- Sleep 2.5 s between network requests and back off on HTTP 429.
- Print a one-line summary per guide and a final tally: guides written, metas written, guides skipped.

- [x] **Step 4: Run the tests to verify they pass**

Run: `python -m unittest tests.test_fetch_guides -v`
Expected: all tests `ok`.

- [x] **Step 5: Run the pipeline for real**

Run: `python tools/fetch_guides.py`
Expected: `app/data/guides/` holds 139 files and `app/data/index.json` exists with 138 entries and a total `metaCount` of 5,303.

- [x] **Step 6: Commit**

```bash
git add tools/fetch_guides.py tests/test_fetch_guides.py app/data
git commit -m "Add the guide pipeline: fetch and reshape upstream guide JSON"
```

---

### Task 2: Image pipeline tier 1 — reuse the local archive

**Files:**
- Create: `tools/build_images.py`
- Create: `tests/test_build_images.py`
- Read (not modify): `Country/*.html` (the archive), `app/data/guides/*.json`

**Interfaces:**
- Consumes: `app/data/guides/<slug>.json` (from Task 1), `Country/<slug>.html`.
- Produces:
  - `LocalBlock` — a named tuple `(image_bytes: bytes | None, text: str, kind: str)`.
  - `parse_blocks(html: str) -> list[LocalBlock]` — splits a saved page into its tip blocks, in document order.
  - `normalise(text) -> set[str]` — lowercased word set, markdown punctuation stripped, words shorter than 3 characters dropped.
  - `similarity(a, b) -> float` — the fraction of the **longer** word set that also appears in the shorter one. The denominator is the longer set, not the shorter: a short block whose words all happen to appear in a long meta that has since been rewritten would score 1.0 against a `min()` denominator and pair a stale image with changed text.
  - `align(blocks: list[LocalBlock], metas: list[dict], threshold: float = 0.75) -> dict[str, int]` — meta id to block index.
  - `tier1(guide: dict, html: str, out_dir: Path) -> tuple[int, int]` — returns `(matched, unmatched)`.
  - `main() -> int` — the CLI.
- CLI: `python tools/build_images.py --tier 1` and `python tools/build_images.py --tier 2`. Both default to running over every guide in `app/data/guides/`.

**Notes the implementer needs:**
- The archive page is one long line of minified HTML. Its tip blocks are separated by the literal marker `class="relative group/bk"`. The first block in the file is the summary image and has no text; it is **not** a meta.
- A block's image is the first `data:image/<type>;base64,<payload>` in the block. Decode with `base64.b64decode(payload + "=" * (-len(payload) % 4))`.
- A block's text is the first `<p style=white-space:pre-wrap>...</p>` in the block, with tags stripped and HTML entities unescaped. A block whose text is empty is not a meta candidate.
- **Do not use positional matching.** The archive is a month older than the live guide and the wording of some metas has changed, so a tip at position 7 today may have been position 7 with different words in August. Match on text only.
- `normalise` strips `**`, `__`, `_`, backticks, and splits on non-alphanumeric characters, lowercases, and drops words shorter than 3 characters.
- `similarity(a, b)` = `len(normalise(a) & normalise(b)) / min(len(normalise(a)), len(normalise(b)))`, and `0.0` when either side has no words.
- A meta is matched only when `similarity` is at or above `threshold`. When two blocks both match a meta, the higher similarity wins; ties go to the earlier block.
- A block may match at most one meta, and a meta may take at most one block. Assign greedily by descending similarity, skipping pairs already used.
- The decoded bytes are already WebP for all but the 246 logo PNGs. **Write the bytes as they are** — do not re-encode. A block whose bytes are PNG is a logo, not a meta image, and must be skipped (a meta image must be WebP).
- Output path: `app/data/img/<slug>/<metaId>.webp`. Skip the write if the file already exists.

- [x] **Step 1: Write the failing tests**

In `tests/test_build_images.py`:

```python
import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import build_images
```

Test cases:
- `test_normalise_drops_markup_and_short_words` — `build_images.normalise("The **maximum** 'a' sign")` equals `{"maximum", "sign"}`.
- `test_similarity_is_one_for_identical_text` — `similarity("Albanian licence plates have blue strips", "albanian licence plates have blue strips")` is `1.0`.
- `test_similarity_is_zero_for_unrelated_text` — `similarity("aaa bbb ccc", "xxx yyy zzz")` is `0.0`.
- `test_similarity_is_zero_when_a_side_has_no_words` — `similarity("!!!", "licence plate")` is `0.0`.
- `test_similarity_counts_shared_words` — `similarity("speed signs use maximum word", "the maximum word appears on signs")` is between `0.5` and `0.9`.
- `test_align_rejects_a_meta_whose_text_changed` — build two blocks: one whose text is "Albanian licence plates either have blue strips on both sides", and a meta whose text is something completely different. Assert `align(blocks, metas)` returns an empty mapping.
- `test_align_matches_a_meta_whose_text_is_the_same` — one block with the text above and one meta with exactly that text. Assert `align` maps the meta id to block index 0.
- `test_align_rejects_a_below_threshold_match` — block text "licence plates blue strips", meta text "licence plates blue strips and a very different additional clause about something else entirely" → similarity below threshold → no match.
- `test_align_never_reuses_a_block` — two metas with identical text and one block; assert at most one meta is matched.
- `test_parse_blocks_finds_the_images_and_text` — parse `Country/albania.html`; assert more than 20 blocks are found, at least 20 have image bytes, and at least 20 have non-empty text. Assert the first block (the summary image) has empty text.
- `test_tier1_writes_a_webp_for_a_known_meta` — using `Country/albania.html` and `app/data/guides/albania.json`, run `tier1` into a `tempfile.TemporaryDirectory()`. Assert at least 10 files were written, each starts with the WebP magic bytes `b"RIFF"`, and the total matched count is greater than 0. Assert no file was written for a meta whose text does not appear in the archive.
- `test_tier1_is_idempotent` — run `tier1` twice into the same directory; assert the second run writes 0 new files and the file count is unchanged.

- [x] **Step 2: Run the tests to verify they fail**

Run: `python -m unittest tests.test_build_images -v`
Expected: `ModuleNotFoundError: No module named 'build_images'`.

- [x] **Step 3: Implement `tools/build_images.py` tier 1**

Module constants:

```python
PROJECT = Path(__file__).resolve().parent.parent
GUIDES_DIR = PROJECT / "app" / "data" / "guides"
IMG_DIR = PROJECT / "app" / "data" / "img"
ARCHIVE_DIR = PROJECT / "Country"
BASE_URL = "https://www.plonkit.net"
```

Functions with these exact names: `parse_blocks(html)`, `normalise(text)`, `similarity(a, b)`, `align(blocks, metas, threshold=0.75)`, `tier1(guide, html, out_dir)`, `tier2(guide, out_dir)`, `main()`.

`align` implementation approach: build every `(similarity, block_index, meta_index)` triple at or above the threshold, sort descending by similarity, then walk the list assigning a pair only when neither the block nor the meta is already used. Return `{meta_id: block_index}`.

`tier1(guide, html, out_dir)`:
1. `blocks = parse_blocks(html)`.
2. `metas` = the guide's metas flattened across sections, each as `{id, text}` where `text` is the metas' text paragraphs joined with a space.
3. `matches = align(blocks, metas)`.
4. For each match, decode the block's image bytes; skip the block if the bytes are not a WebP (check the `RIFF` magic and the `WEBP` tag at offset 8); write them to `out_dir / f"{meta_id}.webp"` unless the file exists.
5. Return `(written, len(metas) - len(matches))`.

`main()` for `--tier 1`: for each guide file in `GUIDES_DIR`, find the matching archive file at `ARCHIVE_DIR / f"{slug}.html"`. If the archive file is absent, or the guide has a slug the archive does not (the 5 renamed guides and the 6 new ones), skip it and count it as unmatched — those are tier 2's job. Print a per-guide line and a final tally.

- [x] **Step 4: Run the tests to verify they pass**

Run: `python -m unittest tests.test_build_images -v`
Expected: all tests `ok`.

- [x] **Step 5: Run tier 1 for real**

Run: `python tools/build_images.py --tier 1`
Expected: a tally showing a majority of the 5,303 metas matched, and `app/data/img/` holding that many `.webp` files. Record the number in the commit message.

- [x] **Step 6: Commit**

```bash
git add tools/build_images.py tests/test_build_images.py app/data/img
git commit -m "Add image pipeline tier 1: reuse the local archive by text match"
```

---

### Task 3: Image pipeline tier 2 — fetch what tier 1 could not

**Files:**
- Modify: `tools/build_images.py` (add the network tier; tier 1 already exists)
- Modify: `tests/test_build_images.py` (add the tier 2 tests)

**Interfaces:**
- Consumes: `app/data/guides/<slug>.json`, the network.
- Produces: `tier2(guide: dict, out_dir: Path, sleep=2.5, referer=BASE_URL) -> tuple[int, int]` returning `(written, failed)`, and `downscale(raw: bytes, max_dim: int = 1000, quality: int = 78) -> bytes` returning WebP bytes.
- `tier2` writes `app/data/img/<slug>/<metaId>.webp` for every meta whose image file is missing, and `app/data/img/<slug>/hero.webp` when the guide has a hero and the file is missing.

**Notes the implementer needs:**
- The image host answers 403 without a `Referer` header. Send `Referer: https://www.plonkit.net/` and a browser `User-Agent`.
- The host rate-limits with HTTP 429 at roughly one success per 3–6 seconds. On 429, back off 30, 60, 120, 240 seconds and then give up on that one image, recording it as failed and moving on. The run must never abort because of one image.
- `downscale` uses `PIL.Image.open(BytesIO(raw))`, converts to RGB, and if the larger dimension exceeds `max_dim` calls `thumbnail((max_dim, max_dim * 4), Image.LANCZOS)`, then saves as WebP with `quality=quality, method=4` into a `BytesIO` and returns its bytes. Images already smaller than `max_dim` are still re-encoded, so every output is comparable in size.
- A non-image response (HTML error page) must not be written. Check that the decoded image is valid before writing; on failure treat it as a failed image.
- `tier2` must skip any file that already exists, so the run is resumable and re-running it after tier 1 fills the gaps costs nothing.

- [x] **Step 1: Write the failing tests**

Add to `tests/test_build_images.py`:
- `test_downscale_shrinks_a_large_image` — build a 2400x1200 PNG in memory with `PIL.Image`, call `downscale(png_bytes, max_dim=1000)`, reopen the result with `PIL.Image`, assert its larger dimension is at most 1000 and the bytes start with `b"RIFF"`.
- `test_downscale_leaves_a_small_image_small` — a 200x100 PNG becomes at most 200x100.
- `test_downscale_rejects_non_image_data` — `downscale(b"<html>not an image</html>")` raises `ValueError`.
- `test_tier2_skips_existing_files` — write a dummy `0D6J.webp` into a temp dir, run `tier2` for a guide with `sleep=0`, assert the dummy file's bytes are unchanged and `written == 0` for that meta. Use a guide whose meta already has a file so no network call is attempted; assert the function does not raise.

- [x] **Step 2: Run the tests to verify they fail**

Run: `python -m unittest tests.test_build_images -v`
Expected: `AttributeError: module 'build_images' has no attribute 'downscale'`.

- [x] **Step 3: Implement tier 2 in `tools/build_images.py`**

Add `downscale`, `fetch_image(url, referer, timeout=45)` returning raw bytes or `None` after its own 429 backoff, and `tier2`.

`fetch_image` must:
1. Build the request with `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36` and `Referer: https://www.plonkit.net/`.
2. On HTTP 429, sleep 30, 60, 120, 240 seconds and retry, up to four attempts, then return `None`.
3. On any other HTTP error, return `None` immediately.
4. On success, return the bytes.

`tier2(guide, out_dir, sleep=2.5)`:
1. For each meta with a non-null `image`, compute the target path. If it exists, skip.
2. Fetch `BASE_URL + upstream_image_url`. The upstream URL is **not** in the app guide JSON — the app guide stores only the local path. So `tier2` must read the upstream URL from `data-source/<slug>.json`, mapping meta id to `data.image.imageUrl`. Add a helper `upstream_image_urls(slug) -> dict[str, str]` that reads `data-source/<slug>.json` and returns `{meta_id: imageUrl}` for every meta, plus `"hero": heroImage` under a separate key.
3. Downscale and write.
4. Sleep `sleep` seconds between network requests.
5. Also fetch the hero to `out_dir / "hero.webp"` when the guide has one and the file is absent.
6. Return `(written, failed)`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `python -m unittest tests.test_build_images -v`
Expected: all tests `ok`.

- [x] **Step 5: Start the tier 2 run in the background**

Run: `python tools/build_images.py --tier 2`
Expected: it downloads steadily. The site rate-limits, so this is expected to take hours and to be stopped and restarted freely. It is safe to interrupt at any time because every finished file is kept.

- [x] **Step 6: Commit**

```bash
git add tools/build_images.py tests/test_build_images.py
git commit -m "Add image pipeline tier 2: fetch and downscale from plonkit.net"
```

---

### Task 4: State store

**Files:**
- Create: `app/js/store.js`
- Create: `tests/test_store.mjs`

**Interfaces:**
- Consumes: a `backend` object with `getItem(key) -> string | null` and `setItem(key, value) -> void`.
- Produces:

```js
export function createStore(backend, { key = 'plonkit-learn:v1' } = {})
```

returning an object with:

| Method | Returns / does |
|---|---|
| `isSeen(metaKey)` | boolean |
| `markSeen(metaKey)` | void — idempotent |
| `seenCount()` | number |
| `isBookmarked(metaKey)` | boolean |
| `toggleBookmark(metaKey)` | boolean — the new state |
| `note(metaKey)` | string — `''` when absent |
| `setNote(metaKey, text)` | void — `''` removes the note |
| `srs(metaKey)` | `{ box: number, due: number }` — `{ box: 0, due: 0 }` when absent |
| `setSrs(metaKey, state)` | void |
| `pushHistory(entry)` | void — appends `{ country, metaId, ok, at }`, capped at 2000 entries, newest last |
| `history()` | array of entries, oldest first |
| `streak()` | `{ current: number, best: number }` |
| `setStreak(value)` | void |
| `export()` | the plain state object |
| `import(obj)` | void — replaces the state, ignoring unknown keys |
| `reset()` | void |

- The meta key is `<slug>:<metaId>`. The store never builds a key itself; callers pass the key.

**Notes the implementer needs:**
- The state document shape is fixed: `{ seen: {}, bookmarked: {}, notes: {}, srs: {}, history: [], streak: { current, best } }`. Each of `seen`, `bookmarked`, `notes`, `srs` is keyed by the meta key.
- `backend` is injected so the module never touches `localStorage` itself. The app passes `window.localStorage`; the test passes an in-memory object.
- The whole document is read once into memory, mutated in memory, and written back on every change. Write on every mutation — losing a note to a closed tab is worse than a small write cost.
- `import` must accept a document produced by `export` and restore every field exactly, and must ignore any key it does not recognise rather than failing.
- A corrupt or unparseable stored document must not crash the app: fall back to an empty state and keep the bad value under a `__corrupt` key so it can be recovered by hand.

- [x] **Step 1: Write the failing test**

Create `tests/test_store.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';

function memBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}
```

Test cases:
- `starts empty` — a new store has `seenCount() === 0`, `history()` deep-equals `[]`, `streak()` deep-equals `{ current: 0, best: 0 }`.
- `markSeen is idempotent` — mark `"japan:0D6J"` twice, assert `seenCount() === 1` and `isSeen("japan:0D6J")` is true.
- `toggleBookmark returns the new state` — assert it returns `true` then `false`.
- `setNote with empty string removes the note` — set `"hello"`, assert `note(key) === 'hello'`, then `setNote(key, '')`, assert `note(key) === ''`.
- `srs defaults to box 0 due 0` and `setSrs round-trips`.
- `history is capped at 2000` — push 2100 entries, assert `history().length === 2000` and the **first** entry is the 101st pushed.
- `export and import round-trip` — build a store with seen, bookmarks, notes, srs, history and streak; `export()` it; create a second store, `import()` it; assert every field matches the original exactly.
- `import ignores unknown keys` — import `{ seen: {}, bogus: 1 }`; assert the store still works and `export().bogus` is undefined.
- `a corrupt stored document does not throw` — put `"{not json"` in the backend under the store key; assert `createStore(backend).seenCount() === 0` and that the store still works afterwards.
- `state survives a new store over the same backend` — write with one store, read with a second store over the same backend; assert the seen set survived.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_store.mjs`
Expected: `Cannot find module '../app/js/store.js'`.

- [x] **Step 3: Implement `app/js/store.js`**

Pure ESM. Export `createStore(backend, { key })`. No `document`, no `window`, no `localStorage`.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_store.mjs`
Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add app/js/store.js tests/test_store.mjs
git commit -m "Add the state store: seen, bookmarks, notes, SRS, history, export/import"
```

---

### Task 5: Markdown renderer

**Files:**
- Create: `app/js/md.js`
- Create: `tests/test_md.mjs`

**Interfaces:**
- Produces:
  - `renderMarkdown(src: string) -> string` — HTML string, safe to insert.
  - `splitNoteParagraphs(paragraphs: string[]) -> { text: string[], notes: string[] }` — splits a meta's paragraphs into ordinary ones and NOTE ones.
  - `plainText(src: string) -> string` — the source with all markdown syntax removed, for searching and for matching.

**Notes the implementer needs:**
- The Markdown subset in the guide text is: `**bold**`, `*italic*`, `_italic_`, `[label](url)`, bare http(s) URLs, and paragraphs that begin with `NOTE`. There is no code, no lists, no headings inside a meta's text.
- **`renderMarkdown` must escape the input before applying any inline rule.** Escape `&`, `<`, `>`, `"` first. Never emit a tag that came from the source text.
- `[label](url)` becomes `<a href="url" target="_blank" rel="noopener noreferrer">label</a>`. The `url` is validated: only allow `http`, `https` and `mailto` schemes; anything else is rendered as plain text.
- `**bold**` becomes `<strong>`, `*italic*` and `_italic_` become `<em>`.
- A bare http(s) URL in the text becomes a link.
- `plainText` strips all of the above and collapses whitespace.
- `splitNoteParagraphs` treats a paragraph as a note when its trimmed text starts with `NOTE` (case-insensitive) or when it is wrapped in `_..._` and contains the word `note`. The returned `notes` array keeps the paragraph text as written.

- [x] **Step 1: Write the failing test**

Create `tests/test_md.mjs` with these cases:
- `renders bold` — `renderMarkdown('a **b** c')` contains `<strong>b</strong>`.
- `renders italic` — `renderMarkdown('a _b_ c')` contains `<em>b</em>` and `renderMarkdown('a *b* c')` contains `<em>b</em>`.
- `renders a link` — `renderMarkdown('see [here](https://x.test/a)')` contains `href="https://x.test/a"` and `>here</a>` and `rel="noopener noreferrer"`.
- `rejects a javascript link` — `renderMarkdown('[x](javascript:alert(1))')` contains no `href` and no `javascript:`.
- `escapes html` — `renderMarkdown('<script>alert(1)</script>')` contains no `<script>` and contains `&lt;script&gt;`.
- `escapes a quote` — `renderMarkdown('say "hi"')` contains no raw `"` inside the text it emits.
- `linkifies a bare url` — `renderMarkdown('go to https://x.test/b now')` contains `href="https://x.test/b"`.
- `plainText strips markup` — `plainText('a **b** [c](https://x.test/d) _e_')` equals `'a b c e'`.
- `splitNoteParagraphs splits on NOTE` — `splitNoteParagraphs(['first', 'NOTE: second', 'third'])` returns `text` `['first', 'third']` and `notes` `['NOTE: second']`.
- `splitNoteParagraphs handles a lowercase note` — `'note: x'` is a note.
- `splitNoteParagraphs leaves an ordinary paragraph alone` — `splitNoteParagraphs(['The plates are blue'])` returns `notes` `[]`.
- `splitNoteParagraphs on an empty list` returns `{ text: [], notes: [] }`.
- `renderMarkdown of an empty string` returns `''`.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_md.mjs`
Expected: `Cannot find module '../app/js/md.js'`.

- [x] **Step 3: Implement `app/js/md.js`**

Pure ESM, no DOM. `renderMarkdown` returns a string, not a DOM node.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_md.mjs`
Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add app/js/md.js tests/test_md.mjs
git commit -m "Add the Markdown renderer and NOTE paragraph splitter"
```

---

### Task 6: Quiz engine and spaced repetition

**Files:**
- Create: `app/js/quiz.js`
- Create: `app/js/srs.js`
- Create: `tests/test_quiz.mjs`
- Create: `tests/test_srs.mjs`

**Interfaces — `app/js/quiz.js`:**
- `buildOptions({ answerSlug, countries, count = 6, rng = Math.random }) -> string[]`
  - `countries` is an array of `{ slug, title, continent }`.
  - Returns a shuffled array of slugs of length `min(count, countries.length)`, containing `answerSlug` exactly once and no duplicate slugs.
  - At least 2 options come from the same continent as the answer when the continent has enough countries for them; the rest are drawn from any other country.
  - When there are fewer candidates than `count`, every candidate is returned.
- `buildPool({ guides, scope = 'all' | 'country' }) -> Array<PoolEntry>`
  - `guides` is an array of guide objects, each with `slug`, `title` and `sections[].metas[]`.
  - `scope: 'country'` uses `guides[0]` only; `scope: 'all'` uses every guide.
  - Returns one entry per meta, in guide order then document order. A `PoolEntry` is `{ id, country, answer, text, section }`, where `answer` is the guide's slug, `country` is the guide's title, and `text` is the meta's paragraphs joined with a space.
  - A `PoolEntry` is the unit the session planner samples from, so a pool of every meta across all 139 guides is 5,303 entries.
- `scoreAnswer(question, chosenSlug) -> { correct: boolean, correctSlug: string }`

**Interfaces — `app/js/srs.js`:**
- `SRS_INTERVALS = [1, 2, 4, 8, 16, 32]` — days.
- `initialState() -> { box: 0, due: 0 }`
- `review(state, correct, now = Date.now()) -> { box: number, due: number }`
  - Correct: `box = min(state.box + 1, 5)`, `due = now + SRS_INTERVALS[box] * 86400000`.
  - Wrong: `box = 0`, `due = now`.
- `isDue(state, now = Date.now()) -> boolean`

**Notes the implementer needs:**
- `countries` passed to `buildOptions` must already exclude guides with zero metas, and must exclude `answerSlug` from the distractor pool.
- Distractor selection: pick the same-continent candidates first, then fill the remainder from the global pool. If the same-continent pool is short, take what it has and fill the rest globally. Never produce a duplicate slug.
- The shuffle must use the injected `rng`, so tests are deterministic. Pass `rng: () => 0` in tests to get a stable order.
- `buildPool` is deterministic: it returns every meta of the selected guides, in document order. The random choice of a question happens in the session planner, not here.
- `review` is a pure function of `(state, correct, now)`. It never reads a clock by itself — the caller passes `now`, except that `now` defaults to `Date.now()`.

- [x] **Step 1: Write the failing tests**

Create `tests/test_srs.mjs`:
- `a new meta is box 0 and due now` — `initialState()` deep-equals `{ box: 0, due: 0 }`.
- `a correct answer raises the box` — `review({ box: 0, due: 0 }, true, 1000)` gives `box: 1` and `due: 1000 + 1 * 86400000`.
- `the box caps at 5` — reviewing correctly 9 times from box 0 gives `box: 5`.
- `the interval grows with the box` — from box 4, a correct answer sets `due` to `now + 16 * 86400000`.
- `a wrong answer resets the box and makes it due` — `review({ box: 4, due: 999 }, false, 1000)` gives `{ box: 0, due: 1000 }`.
- `isDue` — `{ box: 1, due: 1000 }` is not due at `now = 999` and is due at `now = 1001`.

Create `tests/test_quiz.mjs`:
- `buildOptions includes the answer exactly once` — over 40 countries, assert `opts.filter(s => s === 'japan').length === 1`.
- `buildOptions returns six options` — assert `opts.length === 6`.
- `buildOptions has no duplicates` — `new Set(opts).size === opts.length`.
- `buildOptions returns every candidate when there are fewer than six` — 4 candidates, assert `opts.length === 4`.
- `buildOptions always offers at least three` — 2 candidates, assert `opts.length === 2` and the function does not throw.
- `buildOptions prefers same-continent distractors` — 6 Japanese countries and 40 European ones; assert at least one of the 5 distractors is a Japanese country.
- `buildOptions never repeats the answer as a distractor` — the answer is in the list once.
- `buildOptions is deterministic with a fixed rng` — two calls with `rng: () => 0` return equal arrays.
- `buildPool in country scope returns every meta` — a guide with 5 metas gives a pool of 5, each with `answer` equal to the guide's slug.
- `buildPool in global scope returns every meta of every guide` — two guides with 3 and 2 metas give a pool of 5.
- `buildPool records the country title` — a pool entry's `country` is the guide's title.
- `buildPool excludes a guide with no metas` — a guide whose sections hold no metas contributes nothing.
- `scoreAnswer` — a correct slug gives `{ correct: true, correctSlug: 'japan' }`; a wrong slug gives `{ correct: false, correctSlug: 'japan' }`.

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/test_quiz.mjs tests/test_srs.mjs`
Expected: `Cannot find module '../app/js/quiz.js'`.

- [x] **Step 3: Implement `app/js/quiz.js` and `app/js/srs.js`**

Pure ESM, no DOM. `buildOptions` takes the `rng` for its shuffle and for its draws; use a small helper `pick(rng, arr)` that returns `arr[Math.floor(rng() * arr.length)]` and removes the picked element.

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/test_quiz.mjs tests/test_srs.mjs`
Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add app/js/quiz.js app/js/srs.js tests/test_quiz.mjs tests/test_srs.mjs
git commit -m "Add the quiz engine and the spaced-repetition scheduler"
```

---

### Task 7: Data loading and statistics

**Files:**
- Create: `app/js/data.js`
- Create: `app/js/stats.js`
- Create: `tests/test_stats.mjs`

**Interfaces — `app/js/data.js`:**
- `createDataClient({ base = '', fetchImpl = fetch } = {})` returning:
  - `index() -> Promise<Array<{ slug, title, code, continent, metaCount, hero }>>` — fetched once and cached in a module-level promise; a second call returns the same promise.
  - `guide(slug) -> Promise<Guide>` — fetched from `base + '/data/guides/' + slug + '.json'` and cached per slug in a module-level `Map`.
  - `clearCache()` — clears both, for tests and for a "reload data" action.
- The guide object is exactly the shape Task 1 writes.

**Interfaces — `app/js/stats.js`:**
- `summarise({ history, index, store, now = Date.now() }) -> { totalMetas, totalSeen, accuracy, byCountry, weakest, streak, dueCount }`
  - `byCountry` is an array of `{ slug, title, code, continent, seen, total, accuracy, correct, wrong }` for every country in `index`, sorted by slug.
  - `accuracy` is `correct / (correct + wrong)` over the whole history, or `null` when there is no history.
  - `weakest` is the 10 countries with at least 5 attempts, sorted by accuracy ascending, then by attempts descending.
  - `dueCount` is the number of metas across all countries whose SRS state is due.
- `countryProgress(store, country, metaCount) -> { seen, total, pct }`

**Notes the implementer needs:**
- `data.js` must not touch `document`. It uses the injected `fetchImpl`, so a test can pass a stub.
- `stats.js` reads the SRS state through the `store` object passed in, never through a global.
- `summarise` must handle a history of zero entries: `accuracy` is `null` and `weakest` is `[]`.
- A country with fewer than 5 attempts is excluded from `weakest`, so one lucky guess does not put a country at the top.

- [x] **Step 1: Write the failing tests**

Create `tests/test_stats.mjs`:
- `accuracy is null with no history` — `summarise({ history: [], index, store, now })` gives `accuracy: null` and `weakest: []`.
- `accuracy counts right and wrong` — a history of 3 correct and 1 wrong gives `accuracy === 0.75`.
- `byCountry counts seen metas` — a store with 2 metas seen in `japan` (82 metas) gives `seen: 2`, `total: 82`, `pct` close to 0.0244.
- `weakest needs five attempts` — a country with 4 wrong attempts is not in `weakest`; with 5 it is, and it is first.
- `weakest is sorted by accuracy ascending` — two countries with 10 attempts each, one at 0.2 and one at 0.8; assert the 0.2 one comes first.
- `dueCount counts due metas` — a store with one SRS entry due in the past and one due in the future gives `dueCount === 1`.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_stats.mjs`
Expected: `Cannot find module '../app/js/stats.js'`.

- [x] **Step 3: Implement `app/js/data.js` and `app/js/stats.js`**

Pure ESM, no DOM. `data.js` uses a module-level `Map` for guide cache and a module-level variable for the index promise.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_stats.mjs`
Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add app/js/data.js app/js/stats.js tests/test_stats.mjs
git commit -m "Add guide loading with caching and the statistics aggregation"
```

---

### Task 8: App shell and the home screen

**Files:**
- Create: `app/index.html`
- Create: `app/styles.css`
- Create: `app/app.js`
- Create: `app/js/dom.js`
- Create: `app/js/router.js`
- Create: `app/js/screens.js`
- Create: `app/js/prefs.js` — the one module that knows about `localStorage` and `window`, so that the core stays DOM-free. It creates the store and the data client and exposes them.

**Interfaces — `app/js/dom.js`:**
- `el(tag, props = {}, children = []) -> HTMLElement` — `props` may hold `className`, `text`, `html`, `href`, `src`, `alt`, `onClick`, `attrs`, `style`, and `data` (an object of `data-*` values). `children` may be nodes or strings.
- `clear(node) -> void`
- `frag(children) -> DocumentFragment`
- `mount(parent, node) -> void`

**Interfaces — `app/js/router.js`:**
- `createRouter({ routes, onRoute })` returning `{ start(), navigate(hash), current() }`.
  - `routes` maps a hash path to a handler `(params) => void`. `#/`, `#/country/japan`, `#/meta/japan/0D6J`, `#/quiz`, `#/quiz/japan`, `#/stats`, `#/review`, `#/settings`.
  - `navigate` sets `location.hash` and the router reacts to `hashchange`.

**Interfaces — `app/js/prefs.js`:**
- `createPrefs()` returning `{ store, data, base }` where `store` is `createStore(window.localStorage)` and `data` is `createDataClient({ base: '' })`.

**Interfaces — `app/js/screens.js`:**
- `createScreens({ store, data, router, container })` returning an object with one function per screen: `home`, `country`, `meta`, `quiz`, `stats`, `review`, `settings`.
  - Each screen is `async (params) => void`. It clears `container` and renders into it. The router calls them.
  - `container` is the single `<div id="app">` from `index.html`.
- `filterCountries(index, query) -> index` — the search filter, exported separately so it can be unit tested without a DOM.
- `createScreens` in this task implements `home` and stubs the other screens as a `<div>` reading `Coming soon`. `app.js` registers a route for all of them so the router is complete from the start.

**Notes the implementer needs:**
- `index.html` contains a single `<div id="app">` and a single `<script type="module" src="app.js">`. The module entry point must be `app.js` relative to `app/`, so the file is `app/app.js` and the script tag is `<script type="module" src="./app.js"></script>`.
- `styles.css` defines the dark theme as CSS custom properties: `--bg: #0f1214`, `--panel: #171b1e`, `--panel-2: #1d2226`, `--text: #e8ecef`, `--muted: #8b949e`, `--line: #262b2f`, `--accent: #5EBF82`, `--on-accent: #06130c`, `--danger: #e5534b`. Body font `Inter`, headings `Poppins`, both with a system fallback stack.
- The **first rule** in `styles.css` is `[hidden] { display: none !important; }`.
- The home screen renders one card per index entry. Each card shows: the country title, the ISO `code` as a badge, the continent, `metaCount` metas, and a progress bar from `countryProgress`. The card is a link to `#/country/<slug>`.
- A country with `metaCount === 0` is not rendered at all.
- The home screen has a search box that filters by title and by ISO code, case-insensitively, as the user types. Filtering re-renders the grid; it does not reload the page.
- The home screen has a link to `#/quiz` (global) and links to `#/stats` and `#/review`.
- A country card must be reachable and clickable by its title text, so the browser test can find it by role and name.
- `app.js` creates the prefs, the router and the screens, registers the routes, and calls `router.start()`.
- Screens are responsible for their own container: each screen function clears the container and appends its node.

- [x] **Step 1: Write the browser test for the home screen**

Do this task's test in `tests/test_browser.mjs`, but the CDP client does not exist yet — it is built in Task 12. For this task, instead write a **DOM-free unit test** of the screen's data preparation, so the task is independently testable now:
- Create `tests/test_home.mjs` asserting that a pure helper `filterCountries(index, query)` returns the matching countries by title or code, case-insensitively, and returns an empty array for a query that matches nothing. Put `filterCountries` in `app/js/screens.js` and export it.

Add to `tests/test_home.mjs`:
- `matches by title` — `filterCountries([{title: 'Japan', code: 'JP'}], 'jap')` has length 1.
- `matches by code` — `filterCountries([{title: 'Japan', code: 'JP'}], 'jp')` has length 1.
- `is case insensitive` — `filterCountries([{title: 'Japan', code: 'JP'}], 'JAPAN')` has length 1.
- `matches nothing` — `filterCountries([{title: 'Japan', code: 'JP'}], 'zzz')` has length 0.
- `an empty query returns everything` — length equals the input length.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_home.mjs`
Expected: `Cannot find module '../app/js/screens.js'`.

- [x] **Step 3: Write `app/index.html`, `app/styles.css`, `app/js/dom.js`, `app/js/router.js`, `app/js/prefs.js`, `app/js/screens.js`, `app/app.js`**

Follow the interfaces above. `screens.js` in this task implements `home` and stubs the other screens as a `<div>` reading `Coming soon`. `app.js` registers the routes for all of them so the router is complete from the start.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_home.mjs`
Expected: all tests pass.

- [x] **Step 5: Serve the app and look at it**

Run: `python -m http.server 8123 --directory app` from the project root, then open `http://127.0.0.1:8123` in a browser. The home screen must show 138 country cards with their progress bars, and the search box must filter. **Stop the server afterwards.**

- [x] **Step 6: Commit**

```bash
git add app/index.html app/styles.css app/app.js app/js
git commit -m "Add the app shell, router and the home screen"
```

---

### Task 9: Country screen and meta browser

**Files:**
- Modify: `app/js/screens.js` (replace the `country` and `meta` stubs)
- Modify: `app/styles.css`
- Create: `tests/test_meta.mjs`

**Interfaces:**
- The `country` screen of `createScreens` is `async ({ slug }) => void`.
- The `meta` screen of `createScreens` is `async ({ slug, metaId }) => void`.
- The meta screen's DOM must carry `data-meta-key="<slug>:<metaId>"` on its root element and `data-testid` attributes on the interactive parts: `meta-image`, `meta-text`, `meta-maps`, `seen-toggle`, `bookmark-toggle`, `note-input`, `prev-meta`, `next-meta`.

**Notes the implementer needs:**
- The country screen renders, in order: the hero (or a gradient header with the country name when `hero` is null), the title, the continent and meta count, the progress bar, the three buttons (*Browse metas*, *Quiz this country*, *Make available offline*), and the list of sections. Each section shows its title and its meta count; clicking a section scrolls to it.
- *Browse metas* navigates to the first meta of the first section that has one.
- The meta screen renders the image, the meta's text with `renderMarkdown`, the `NOTE` paragraphs in a callout, and the *Open in Google Maps* link when `mapsUrl` is set.
- **A missing image renders a placeholder**, not a broken image: a `<div class="img-placeholder">` reading `No image downloaded for this meta`. The `meta-image` test id must still be present so a test can find it.
- The meta screen has *Mark as seen*, *Star* and a note field. Marking seen writes `store.markSeen(slug + ':' + metaId)`. Starring toggles `store.toggleBookmark`. The note field writes `store.setNote` on change, and is pre-filled with the stored note.
- Previous and next move through the guide's metas in document order. The next button is disabled on the last meta and the previous button is disabled on the first.
- Left and right arrow keys navigate, but **not** while a note field or any other input has focus.
- The screen title shows the country name and the meta's position, for example `Japan — 12 of 82`.

- [x] **Step 1: Write the failing test**

Create `tests/test_meta.mjs` with a pure helper in `screens.js`:
- Export `flattenMetas(guide) -> Array<{ id, section, sectionTitle }>`.
- `flattenMetas returns every meta in document order` — a fixture guide with 2 sections of 2 and 3 metas gives 5, in order.
- `flattenMetas records the section title` — the first meta's `sectionTitle` is the first section's title.
- `flattenMetas on a guide with no metas` returns `[]`.
- Export `metaKey(slug, metaId) -> string` returning `slug + ':' + metaId`.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_meta.mjs`
Expected: `Cannot find module '../app/js/screens.js'` or an assertion failure for the missing export.

- [x] **Step 3: Implement the country and meta screens**

Replace the `country` and `meta` stubs in `app/js/screens.js` and add the styles.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_meta.mjs`
Expected: all tests pass.

- [x] **Step 5: Look at it in a browser**

Run `python -m http.server 8123 --directory app` from the project root, open `http://127.0.0.1:8123`, click into Japan, step through several metas, star one, mark one seen, add a note, and reload the page to confirm the state persisted. **Stop the server afterwards.**

- [x] **Step 6: Commit**

```bash
git add app/js/screens.js app/styles.css tests/test_meta.mjs
git commit -m "Add the country screen and the meta browser"
```

---

### Task 10: Quiz screen

**Files:**
- Modify: `app/js/screens.js` (replace the `quiz` stub)
- Modify: `app/styles.css`
- Create: `tests/test_quizflow.mjs`

**Interfaces:**
- The `quiz` screen of `createScreens` is `async ({ slug }) => void`, where `slug` is absent for the global quiz and a country slug for the country-scoped quiz.
- The quiz DOM carries `data-testid` on: `quiz-image`, `quiz-options`, `quiz-option` (one per button, each with `data-slug`), `quiz-reveal`, `quiz-next`, `quiz-summary`, `quiz-skip`.
- The quiz screen must **not** show the meta's text before the answer is given. Put the text in a node that is absent from the DOM until the answer is submitted, not merely hidden with CSS.

**Notes the implementer needs:**
- A session is 10 questions by default.
- A question is a meta drawn from the pool, plus 6 options built by `buildOptions`. The option list is the country titles, in the same order as the slugs.
- The image is shown alone, above the options. The meta's text is not in the DOM.
- Clicking an option immediately reveals: the option turns green (correct) or red (wrong), the correct option turns green if it was not chosen, the meta's text and Maps link appear in `quiz-reveal`, and `quiz-next` appears.
- An option can only be clicked once. A second click does nothing.
- Answering writes: `store.markSeen(key)`, `store.setSrs(key, srs.review(previous, correct))`, `store.pushHistory({ country, metaId, ok, at })`, and updates the streak.
- **A wrong answer queues the meta again inside the same session**, so it is asked a second time later in the session. A correct answer never repeats in the same session.
- The streak increments on a correct answer and resets to zero on a wrong one. `store.setStreak({ current, best })` where `best` is the maximum ever reached.
- `quiz-skip` ends the session early and shows the summary.
- The summary shows: correct out of total, the list of missed metas with their countries, and links to review those countries.
- When the pool is exhausted, the summary appears.
- The question's meta is chosen at random, so the meta's text is known to the app but is not in the DOM until the reveal.

- [x] **Step 1: Write the failing test**

Create `tests/test_quizflow.mjs` for a pure session planner exported from `screens.js`:
- Export `planSession(pool, length = 10, rng = Math.random) -> Array<PoolEntry>`
  - `planSession takes up to length metas` — a pool of 3 gives 3.
  - `planSession caps at length` — a pool of 25 gives 10.
  - `planSession never repeats a meta` — a pool of 25 gives 10 entries with 10 distinct `id` values.
  - `planSession is deterministic with a fixed rng` — two calls with `rng: () => 0` return the same ids in the same order.
  - The re-queue of a wrongly answered meta is **not** part of the planner. It happens at runtime: the screen keeps a queue and pushes a wrong answer's entry onto the end of it.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_quizflow.mjs`
Expected: an assertion failure because `planSession` is not exported.

- [x] **Step 3: Implement the quiz screen**

Replace the `quiz` stub and add the styles. Keep the option buttons as real `<button>` elements so they are reachable by role and name.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_quizflow.mjs`
Expected: all tests pass.

- [x] **Step 5: Look at it in a browser**

Serve the app, open `#/quiz/japan`, answer several questions, confirm the text is absent before answering and present after, confirm a wrong answer reappears later in the session, and confirm the summary at the end. **Stop the server afterwards.**

- [x] **Step 6: Commit**

```bash
git add app/js/screens.js app/styles.css tests/test_quizflow.mjs
git commit -m "Add the quiz screen with reveal, scoring and the session summary"
```

---

### Task 11: Stats, review and settings screens

**Files:**
- Modify: `app/js/screens.js` (replace the `stats`, `review` and `settings` stubs)
- Modify: `app/styles.css`

**Interfaces:**
- The `stats`, `review` and `settings` screens of `createScreens` are `async () => void`.
- Test ids: `stats-total`, `stats-accuracy`, `stats-weakest`, `review-due`, `review-bookmarked`, `settings-export`, `settings-import`, `settings-download-all`, `settings-reset`.

**Notes the implementer needs:**
- The stats screen shows: total metas seen out of total metas, the overall accuracy, a per-country table, the ten weakest countries, the current and best streak, and the number of reviews due.
- The review screen lists two groups: metas whose SRS state is due, and starred metas. Each row shows the country, the meta's first sentence, a link to open the meta, and a *Quiz these* button that starts a quiz scoped to that meta's country.
- The settings screen has:
  - *Export progress* — downloads the store's state as a JSON file named `plonkit-learn-progress-<date>.json`. Build the download with a `Blob` and an object URL, then revoke the URL.
  - *Import progress* — a file input that reads a chosen JSON file and calls `store.import`.
  - *Make everything available offline* — starts the service worker's prefetch of every guide and image, with a progress readout. This calls into the service worker; if the service worker is not available the button shows a message saying so rather than failing.
  - *Reset all progress* — asks for confirmation with `confirm()` before clearing the store.
  - A line explaining that progress is stored in this browser only and should be exported before changing the address the app is served from.

- [x] **Step 1: Write the failing test**

Create `tests/test_review.mjs` for two pure helpers exported from `screens.js`:
- Export `collectReviewItems({ index, store, now }) -> { due: Array, starred: Array }` where each item is `{ key, slug, metaId, country }`.
  - `due lists metas whose srs is due` — a store with one due SRS entry and one future entry gives `due.length === 1`.
  - `starred lists bookmarked metas` — a store with two bookmarks gives `starred.length === 2`.
  - `an item appears in both lists when it is due and starred` — one meta that is both gives `due.length === 1` and `starred.length === 1`.
  - `an empty store gives empty lists`.
- Export `exportFilename(now) -> string` returning `plonkit-learn-progress-<YYYY-MM-DD>.json`.
  - `the export filename carries the date` — for `now = Date.UTC(2026, 9, 22)` the result is `plonkit-learn-progress-2026-10-22.json`.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_review.mjs`
Expected: an assertion failure because the exports are missing.

- [x] **Step 3: Implement the three screens**

Replace the stubs and add the styles.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_review.mjs`
Expected: all tests pass.

- [x] **Step 5: Look at it in a browser**

Serve the app, open `#/stats`, `#/review` and `#/settings`. Confirm the stats numbers match a session you just played, confirm export writes a file, and confirm importing that file into a cleared store restores everything. **Stop the server afterwards.**

- [x] **Step 6: Commit**

```bash
git add app/js/screens.js app/styles.css tests/test_review.mjs
git commit -m "Add the stats, review and settings screens"
```

---

### Task 12: Local server and launcher

**Files:**
- Create: `tools/serve.py`
- Create: `run.cmd`
- Create: `tests/test_serve.py`

**Interfaces:**
- `tools/serve.py` serves the `app/` directory on a given port, bound to `0.0.0.0` so the phone can reach it over the LAN.
- `run.cmd` starts it and opens the browser.

**Notes the implementer needs:**
- `serve.py` must set the correct `Content-Type` for `.webp` (`image/webp`), `.json` (`application/json`), `.js` (`text/javascript`), `.webmanifest` (`application/manifest+json`), and `.png`.
- It must send `Cache-Control: no-store` so a change to a data file is picked up on reload.
- It must not serve files outside the `app/` directory. Resolve the requested path and refuse anything that escapes it.
- It prints the LAN URL using the machine's IPv4 address, so the user can open it on the phone.
- `run.cmd` runs `python tools\serve.py --port 8000` and starts the browser with `start http://127.0.0.1:8000`.

- [x] **Step 1: Write the failing test**

Create `tests/test_serve.py` with `unittest`, using `http.client` against a server started on port 0 in a thread:
- `serves index html` — a GET of `/` returns 200 and the body contains `id="app"`.
- `serves a webp with the right content type` — GET a known `.webp` under `/data/img/` returns 200 and `Content-Type: image/webp`. Skip the test if no `.webp` exists yet.
- `serves json` — GET `/data/index.json` returns 200 and `Content-Type: application/json`.
- `refuses to escape the app directory` — GET `/../tools/serve.py` returns 404 or 403, never the file.
- `sends no-store` — the `Cache-Control` header contains `no-store`.

- [x] **Step 2: Run the test to verify it fails**

Run: `python -m unittest tests.test_serve -v`
Expected: `ModuleNotFoundError: No module named 'serve'`.

- [x] **Step 3: Implement `tools/serve.py` and `run.cmd`**

Use `http.server.ThreadingHTTPServer` with a `SimpleHTTPRequestHandler` subclass whose `directory` is the `app/` folder.

- [x] **Step 4: Run the test to verify it passes**

Run: `python -m unittest tests.test_serve -v`
Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add tools/serve.py run.cmd tests/test_serve.py
git commit -m "Add the local server and the launcher"
```

---

### Task 13: PWA — manifest, icons and the service worker

**Files:**
- Create: `app/manifest.webmanifest`
- Create: `app/sw.js`
- Create: `app/icons/icon-192.png`, `app/icons/icon-512.png`, `app/icons/icon-maskable-512.png`
- Create: `tools/make_icons.py` — generates the three PNGs with `Pillow` so they are reproducible rather than opaque binaries.
- Create: `tests/test_sw.mjs`

**Interfaces:**
- `app/sw.js` registers under the scope `/`. It uses a cache name that includes a version string, for example `plonkit-learn-v1`.
- The service worker exposes a message interface: a message `{ type: 'prefetch', slugs: [...] }` or `{ type: 'prefetch-all' }` starts a background prefetch of the guide JSON and the images for those guides, and posts back `{ type: 'prefetch-progress', done, total }` messages.
- The app's settings screen posts those messages to `navigator.serviceWorker.controller`.

**Notes the implementer needs:**
- The service worker precaches the shell on install: `index.html`, `styles.css`, `app.js`, every file in `js/`, `manifest.webmanifest`, the icons, and `data/index.json`.
- The cache strategy: cache-first for `/data/`, stale-while-revalidate for everything else.
- The prefetch must be **incremental and resumable**: it walks the guide JSON for a slug, then the image paths, and skips anything already in the cache. It must not try to cache 5,000 files in one go without yielding — yield to the event loop between files so the worker is not killed.
- The icons are generated by `tools/make_icons.py`: a 512x512 image with the accent green background and a dark rounded "P" drawn with `PIL.ImageDraw`, plus a 192x192 version and a 512x512 maskable version with the glyph inside the 80% safe zone. The manifest's `icons` array lists all three with the maskable one carrying `"purpose": "maskable"`.
- The manifest's `start_url` is `"./"` and `scope` is `"./"` so the app works from a subpath on GitHub Pages (`/plonkit-learn/`).
- **Every path the service worker handles must be relative to the app's base**, not absolute from the origin root, or the app breaks under a GitHub Pages subpath.

- [x] **Step 1: Write the failing test**

Create `tests/test_sw.mjs`. `sw.js` cannot be imported by node (it references `self` and `caches`), so test the parts that are pure. Export from `sw.js` a pure function `shellAssets(base)` returning the list of shell paths:
- `shellAssets includes the entry point` — the list contains `index.html`, `styles.css`, `app.js` and `manifest.webmanifest`.
- `shellAssets includes every js module` — the list contains `js/data.js`, `js/store.js`, `js/md.js`, `js/quiz.js`, `js/srs.js`, `js/stats.js`, `js/dom.js`, `js/router.js`, `js/screens.js`, `js/prefs.js`.
- `shellAssets includes the index data` — the list contains `data/index.json`.
- `shellAssets uses relative paths` — no entry starts with `/`.

To keep `sw.js` importable by node, guard the service-worker-only code with `if (typeof self !== 'undefined' && typeof caches !== 'undefined')` and keep the `export` at the top level.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/test_sw.mjs`
Expected: `Cannot find module '../app/sw.js'`.

- [x] **Step 3: Implement `app/sw.js`, `app/manifest.webmanifest` and `tools/make_icons.py`**

Write `tools/make_icons.py` first, run it to produce the three PNGs, then write the manifest and the service worker.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/test_sw.mjs`
Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add app/sw.js app/manifest.webmanifest app/icons tools/make_icons.py tests/test_sw.mjs
git commit -m "Add the PWA manifest, icons and the service worker"
```

---

### Task 14: Browser verification with Chromium

**Files:**
- Create: `tests/cdp.mjs`
- Create: `tests/test_browser.mjs`
- Create: `tools/browser_test.py` — starts the local server, runs the node test against it, and stops the server.

**Interfaces — `tests/cdp.mjs`:**
- `launchChromium({ userDataDir }) -> { proc, wsUrl, close() }` — starts the Chromium binary at `%LOCALAPPDATA%\ms-playwright\chromium-*\chrome-win64\chrome.exe` with `--headless=new --disable-gpu --no-first-run --remote-debugging-port=0 --user-data-dir=<dir>`, then reads the DevTools endpoint from `<dir>/DevToolsActivePort`.
- `connect(wsUrl) -> Promise<CDP>` where `CDP` has `send(method, params) -> Promise<result>` and `on(event, handler)`.
- `newPage(cdp) -> Promise<Page>` where `Page` has `goto(url)`, `evaluate(expression)`, `waitForSelector(selector, timeout)`, `screenshot(path)`, `text(selector)`, `click(selector)` and `close()`.

**Notes the implementer needs:**
- Node 24 has a global `WebSocket`, so the DevTools protocol needs no dependency. Connect to the browser's WebSocket endpoint, call `Target.createTarget` to open a page, then `Target.attachToTarget` with `flatten: true` and send page-level commands with the session id.
- Chromium's path must be found by globbing `%LOCALAPPDATA%\ms-playwright\chromium-*\chrome-win64\chrome.exe`. If it is not found, the browser tests must **skip** rather than fail, and the skip must be reported.
- `--remote-debugging-port=0` makes Chromium pick a free port and write it to `DevToolsActivePort` in the user data directory. Poll that file for up to 20 seconds.
- The browser test needs the app served over http. `tools/browser_test.py` starts `tools/serve.py` on a free port, waits for it to answer, runs `node --test tests/test_browser.mjs` with the base URL in an environment variable `PLONKIT_BASE_URL`, and stops the server.

**The browser test must cover, in this order:**
1. The home screen renders 138 country cards and the search box filters them down to 1 for `japan`.
2. **A sample of 10 country cards each open their country screen** with no page error. A card whose slug has no guide file would fail here, which is how a renamed guide would be caught.
3. Clicking the Japan card opens the country screen and the progress bar is visible.
4. Opening a meta shows an image and text; marking it seen and reloading shows the seen state persisted.
5. **A meta whose image file is missing shows the placeholder text, not a broken image.** The test picks a meta whose image file does not exist under `app/data/img/`.
6. The quiz shows an image and **no meta text** before answering. The test asserts the text of the chosen meta is not present anywhere in the document body.
7. Clicking a wrong option reveals the text and marks the option red.
8. The summary appears after the last question and shows a correct count.
9. The stats screen shows a number and the weakest-country list is present.
10. Every screen is screenshotted to `tests/screenshots/`.
11. The console is watched for errors: **any uncaught console error or page error fails the test.** A screen that throws in the console but still looks right is a failure.

- [x] **Step 1: Write the failing test**

Create `tests/test_browser.mjs` with the cases above, each guarded by `test.skip` when `PLONKIT_BASE_URL` is not set, so `node --test tests/` still passes without a server.

- [x] **Step 2: Run it to verify it skips cleanly**

Run: `node --test tests/test_browser.mjs`
Expected: the tests report as skipped, not failed.

- [x] **Step 3: Implement `tests/cdp.mjs` and `tools/browser_test.py`**

- [x] **Step 4: Run the browser test**

Run: `python tools/browser_test.py`
Expected: all the browser cases pass, and the screenshots exist under `tests/screenshots/`. If Chromium cannot be found the run reports a skip and exits 0.

- [x] **Step 5: Look at the screenshots**

Open each screenshot and confirm the layout is right: the home grid, a country page, a meta page, and a quiz question. **A screenshot that renders but looks broken is a failure** — fix the CSS and re-run.

- [x] **Step 6: Commit**

```bash
git add tests/cdp.mjs tests/test_browser.mjs tools/browser_test.py tests/screenshots
git commit -m "Add browser verification driving real Chromium over the DevTools protocol"
```

---

### Task 15: Publish to GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `.gitignore` if needed
- Create: `docs/deploy.md` — how to publish, and how to run the image pipeline again

**Notes the implementer needs:**
- The repository must be **public** for GitHub Pages on a free plan. The published content is the public Plonk It guide material and the app's own source. The user's progress, notes and quiz history stay in the browser and are never published.
- The `Country/` archive stays out of the repository through `.gitignore`.
- The workflow uses `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages`, publishing the `app/` directory. It must run on pushes to the main branch and on manual dispatch.
- The `app/data/` directory is committed, including the images. The first push carries the bulk of the payload; expect it to be slow.
- `docs/deploy.md` records: the repository URL, the Pages URL, the command to re-run the image pipeline, the command to rebuild the guide data, and the fact that a guide refresh is a pull, a rebuild and a push.

- [x] **Step 1: Create the workflow and the deploy note**

Write `.github/workflows/pages.yml` and `docs/deploy.md`.

- [x] **Step 2: Create the repository and push**

Run:

```bash
gh repo create aawwdadstumbal-png/plonkit-learn --public --source=. --remote=origin --push
```

Expected: the repository is created and the push succeeds. If the push fails because of a large payload, retry; if it still fails, push the images in a second commit.

- [x] **Step 3: Turn on Pages**

Run: `gh api --method POST repos/aawwdadstumbal-png/plonkit-learn/pages -f build_type=workflow`
Expected: the Pages site is enabled. If the API refuses because the build type must be set in the workflow alone, that is fine — the workflow's `configure-pages` action does it.

- [x] **Step 4: Verify the deployment**

Run: `gh api repos/aawwdadstumbal-png/plonkit-learn/pages --jq '.html_url + " " + .status'`
Expected: a `https://aawwdadstumbal-png.github.io/plonkit-learn/` URL and a status of `built`. The first build takes a few minutes; poll every 20 seconds until the status leaves `building`.

Then open the URL and confirm the home screen loads with its 138 cards.

- [x] **Step 5: Verify the service worker works on the published origin**

Open the published URL in Chromium with the DevTools protocol, confirm `navigator.serviceWorker.controller` is non-null after a reload, and confirm `app/data/index.json` is served with a 200.

- [x] **Step 6: Update the vault**

Update `G:\Obsidian\Main\Main\Projects\plonkit-learn.md`: set `status: built`, fill in the Pages URL, and change the *Next* line to the remaining work.

- [x] **Step 7: Commit**

```bash
git add .github/workflows/pages.yml docs/deploy.md
git commit -m "Add the GitHub Pages deployment workflow"
```

---

## Execution Order

Tasks 1 through 15 are in dependency order and each leaves the tree working. Task 3 (the network image fetch) is the long pole and can run in the background while tasks 4 to 14 are implemented; its output is only needed for the visual polish in tasks 9 and 14, not for the app's logic.

**Two things must be finished before the app is genuinely usable**: tier 1 and tier 2 images (tasks 2 and 3), because the quiz is image-based and a meta with no image cannot be quizzed. The app is fully functional and testable without them, using placeholders.

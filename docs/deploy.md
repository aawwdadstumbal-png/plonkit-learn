# Deploying

The app is a static site. GitHub Pages serves the `app/` directory, and the
browser's service worker caches the guides and images so it works with no
connection at all.

## Where it lives

- Repository: `https://github.com/aawwdadstumbal-png/plonkit-learn`
- Site: `https://aawwdadstumbal-png.github.io/plonkit-learn/`

The repository is **public**, because GitHub only serves Pages from a private
repository on a paid plan. The published content is the Plonk It guide material
and the app's own source. The user's progress, notes and quiz history are kept
in the browser and are never uploaded.

## Using it on the phone

Open the site in Chrome on the phone, then *Add to Home screen*. It installs as
an app. Open *Settings* and use *Make everything available offline* to cache
the guides and their images, after which it works with no connection.

The browser ties stored progress to the address the app is served from, so
export the progress from *Settings* before changing that address.

## Running it on the computer

```
run.cmd
```

That serves the app on `http://127.0.0.1:8000` and prints the address other
devices on the same wifi can use. The phone cannot install the app from that
address, because a browser only allows installation and offline caching on a
secure origin.

## Refreshing the guide data

The guide text comes from plonkit.net. To pull a fresh copy:

```
python tools/fetch_guides.py
```

This reads the guide list from the site's API, fetches any guide it does not
already have in `data-source/`, reshapes them into `app/data/guides/`, and
rewrites `app/data/index.json`. The run is resumable and only re-fetches a
guide whose `updatedAt` has changed.

## Refreshing the images

The images are the slow part. The site's image host only serves objects the
Cloudflare edge has already cached, so a first request for an uncached object
comes back 429 with a Retry-After of about half an hour; the same request
once the edge has fetched it comes back 200.

```
python tools/warm_cache.py          # ask for the missing images, which warms the edge
python tools/warm_cache.py --fetch  # later: save the ones the edge has cached
```

`tools/build_images.py --tier 1` reuses the images in the `Country/` archive,
matching them to the live guides by their text. `--tier 2` fetches the rest.

## Running the tests

```
python -m unittest discover -s tests -t . -v    # the data pipeline and the server
node --test "tests/*.mjs"                       # the application logic
python tools/browser_test.py                    # the app in a real browser
```

The browser tests need Chromium; they use the build in the Playwright cache
and skip themselves if it is not there.

## Publishing a change

```
git add -A
git commit -m "..."
git push
```

The workflow in `.github/workflows/pages.yml` publishes the `app/` directory.
The first push carries the images and takes a while.

# runtrovert.app

The landing page, privacy policy and credits. Plain HTML and CSS, no build step, no
third-party requests (fonts are self-hosted, subset WOFF2 of the app's Fraunces
and DM Sans; footage is four of the app's own loops from `assets/`).

Preview locally: `python3 -m http.server --directory site`, then open http://localhost:8000.

## Hosting

The site runs on our own server in its own container; `deploy/site/README.md` has the setup.
The server pulls main every 10 minutes, so a merge is a deploy.

## Before the store launch

- Replace the placeholder store buttons (`aria-disabled` in `index.html`) with the
  official Google Play badge and the listing link, following Google's badge rules.
- Check `hello@runtrovert.app` exists (or swap it for the real address).
- Keep `privacy.html` in step with the Privacy text in Settings (`src/i18n/ui/en.ts`,
  `runtrovertHasNoServerYour`). If the app fetches something new, this page changes first.

## Changing the CSS or JS

Bump the `?v=` number on `style.css` and `site.js` in all the HTML files whenever either
changes. nginx lets browsers keep both for 7 days, so without a new number visitors
keep the old file for up to a week.

The same goes for the logo: `mark.svg`, `favicon.png` and `apple-touch-icon.png` are kept
for 30 days, so a new logo needs a new `?v=` on every reference in all the HTML files.

## Footage

(Bump the folder, v2 -> v3, whenever the loops change: the server caches media for 30 days.) `media/v2/bg-*` are the app's 9:16 loops (phones). `media/v2/wide-*` are 1920x1080 versions for
landscape screens, made from the original Pexels clips with `scripts/grade-bg-wide.sh`
(same grade; Pexels licence, IDs in `assets/CREDITS.md`). Posters are `<img>`s that load
lazily; `site.js` attaches a chapter's loop only when it comes near the screen.

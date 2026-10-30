# runtrovert.app

The landing page and privacy policy. Plain HTML and CSS, no build step, no
third-party requests (fonts are self-hosted, subset WOFF2 of the app's Fraunces
and DM Sans; footage is four of the app's own loops from `assets/`).

Preview locally: `python3 -m http.server --directory site`, then open http://localhost:8000.

## Going live on runtrovert.app

`.github/workflows/pages.yml` publishes this folder on every push to main that
touches `site/`. One-time setup:

1. Repo Settings > Pages > Build and deployment > Source: **GitHub Actions**.
2. At the domain registrar, add DNS records for the apex `runtrovert.app`:
   - A: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - AAAA: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - CNAME `www` → `yigini.github.io`
3. Settings > Pages > Custom domain: `runtrovert.app` (the `CNAME` file here says the same).
   Wait for the certificate, then tick **Enforce HTTPS**. `.app` is HTTPS-only in every
   browser, so the site shows nothing until the certificate is issued.
4. Optional but recommended: verify the domain under your GitHub account's
   Settings > Pages, so nobody else can claim it for their Pages site.

## Before the store launch

- Replace the two placeholder store buttons (`aria-disabled` in `index.html`) with the
  official Google Play badge and the listing link, following Google's badge rules.
- Fill in `[developer name and country]` in `privacy.html`.
- Check `hello@runtrovert.app` exists (or swap it for the real address).
- Keep `privacy.html` in step with the Privacy text in Settings (`src/i18n/ui/en.ts`,
  `runtrovertHasNoServerYour`). If the app fetches something new, this page changes first.

## Changing the CSS or JS

Bump the `?v=` number on `style.css` and `site.js` in both HTML files whenever either
changes, so browsers that cached the old file fetch the new one.

## Footage

`media/bg-*` are the app's 9:16 loops (phones). `media/wide-*` are 1920x1080 versions for
landscape screens, made from the original Pexels clips with `scripts/grade-bg-wide.sh`
(same grade; Pexels licence, IDs in `assets/CREDITS.md`). Posters are `<img>`s that load
lazily; `site.js` attaches a chapter's loop only when it comes near the screen.

# Listen, and Kit & offers

The Listen tab is everything you hear on a run, in one place:

1. **Your sound**: two tiles for the music app and the podcast app, the run screen's music strip switch, and a live copy of the strip to try the buttons (Android: previous / play / next as media-button presses; iPhone: open the app). See [MUSIC.md](MUSIC.md).
2. **New for your run**: a swipeable row of episodes out in the last 10 days, one per show, the ones close to the runner's usual run length first (`freshEpisodes` in `src/shelfLogic.ts`).
3. **Shelves** of covers: Near you, Quiet company, Stories, Learn something, First steps. Tapping a cover opens a sheet with the why, the latest episodes and "Open in <your app>".

Kit & offers is a sponsor shelf at the bottom of it, which only appears when there is at least one sponsor.

## How the list stays fresh

```
content/listen.json   hand-picked shows (edit by hand)
content/offers.json   sponsor offers (edit by hand, empty = no shelf)
        │
        ▼  .github/workflows/shelf.yml: every day at 04:23 UTC, and on every push to content/
scripts/build-shelf.mjs
        │  reads Apple's public podcast charts and lookup API (no key, no account)
        │  and the first ~96 KB of each show's RSS feed
        ▼
shelf.json + art/<id>.jpg on the `shelf` branch (one force-pushed commit)
        │
        ▼  https://raw.githubusercontent.com/yigini/runtrovert/shelf/shelf.json
the app, only when someone opens Listen, and only if they said yes (Settings → Listen → Daily list)
```

- **Hand-picked shows** keep your one-line "why" and a group: `quiet`, `stories`, `learn`, `start`. Find a show's Apple id in its Apple Podcasts URL (`…/id1083410032`).
- **Near you**: for about 55 countries, the builder takes Apple's Running chart for that country and keeps up to 8 shows that published in the last 60 days, have at least 10 episodes and speak a language of that country. The app picks the country from the phone's region setting, or from Settings, without telling anyone. Some countries have few active local shows; Turkey had one on 29 Oct 2026.
- `"noFeed": true` on a hand-picked show links to it without reading its feed. The BBC's feeds ask for a licence for commercial use, so the BBC show is linked, not read.
- **Covers**: the builder takes each show's Apple artwork, shrinks it to a 256 px JPEG with sharp and publishes it as `art/<id>.jpg` beside shelf.json. The phone loads covers from there, never from Apple, and only when the daily download is on. Hand-picked covers also ship in the app (`assets/shelf-art/`, indexed by the generated `src/shelfArt.ts`), so the shelves look right offline. Without a cover a show gets its initials on the section's pastel.
- The app ships with `src/shelfBundled.json`. Refresh it before a release with `npm run shelf` (takes about 10 minutes, Apple throttles bursts). It also refreshes the shipped covers.
- Run the builder by hand from GitHub: Actions → Listen shelf → Run workflow.
- GitHub turns off scheduled workflows in a repository with no activity for 60 days. A push, or Run workflow, turns it back on.

## Privacy

- The download is the same file for everyone and carries no location, id, query string or cookie.
- Runtrovert never plays audio. "Open" hands the show to the runner's own podcast app, so the podcast hosts (Megaphone, Acast and others, which log downloads for advertising) never see a Runtrovert user.
- The country, the podcast app and the offer topics are settings on the phone.
- Covers come from the same GitHub branch as the list, so turning on the daily download adds no new party.

## Taking a sponsor

Sponsors contact the developer and pay a flat fee for a slot. There are no clicks to count and no pay-per-click. Add an entry to `content/offers.json` and push to main; it reaches phones the same day.

```json
{
  "offers": [
    {
      "id": "shoe-brand-2026-11",
      "sponsor": "Shoe Brand",
      "title": "Neutral daily trainers",
      "text": "Free returns in the EU. 10% off with the code.",
      "code": "QUIET10",
      "url": "https://shoebrand.example/runtrovert",
      "topics": ["Road shoes"],
      "countries": ["all"],
      "until": "2026-11-30"
    }
  ]
}
```

- `topics` come from: Road shoes, Trail, Anti-chafe, Night running, Rain, Watches (`OFFER_TOPICS` in `src/shelfLogic.ts`).
- `countries`: `["all"]` or Apple storefront codes such as `["tr", "de"]`.
- `until`: last day shown. Expired offers drop out on the next daily build.
- The builder strips tracking parameters from `url` (`utm_*`, `ref`, `fbclid`, affiliate ids) and refuses anything that isn't https. A missing field fails the build, so a typo never reaches a phone.
- The discount code is how a sponsor measures results, in their own shop.

What every sponsor agrees to:

1. Running only. Kit you'd recommend to a friend anyway.
2. No data brokers, betting, crypto or miracle supplements.
3. Every card says "Paid placement".
4. They never learn who looked or tapped, and they don't ask.
5. At most six offers at a time.

## Store labels

- Apple: "Data Not Collected" is unaffected. No tracking, no ad SDK.
- Google Play: Play counts sponsored content shown in a list as ads. When the first paid offer goes live, answer "Contains ads" with yes, and say in the store listing that it is one shelf the runner opens themselves, with no tracking.

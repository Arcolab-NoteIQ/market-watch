# Pivot Path Market & Competitor Watch

A read-only web dashboard for the Pivot Path team covering industry trends, competitor moves, pharma AI news, FDA Form 483s and warning letters. It is hosted on GitHub Pages, and nobody needs a Claude account to use it.

## What's in the repo

| Path | What it is |
| --- | --- |
| `index.html` | The page: Market Watch (AI, Products, Services and 483s tabs, tracked websites, signal rubric) and Competitor Watch (latest moves and one profile per competitor with website and LinkedIn links) |
| `assets/` | Styles, script and the Pivot Path logo |
| `data/*.json` | The data, updated every weekday by Claude's refresh |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Turning on GitHub Pages (one time)

1. In this repo, open **Settings → Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then click **Save**.
3. After a minute or two the page shows the site address, usually `https://arcolab-noteiq.github.io/market-watch/`. Share that link with the team.

## How the data stays current

Claude refreshes the data at 6:37 am India time every weekday:

- **Monday (full refresh):** a complete sweep of news, every competitor, the latest 100 Form 483s with synopses, recent warning letters and the tracked websites.
- **Tuesday to Friday (light refresh):** only what is new since the last run (news, new 483s and warning letters, tracked websites). Existing items are left as they are.

Each run commits fresh `data/*.json` files to `main`, and GitHub Pages republishes automatically within a few minutes.

## Features

- Filter by product, service, type and signal; search the 483 list by company or FEI.
- **Download CSV** on every feed and table.
- **Print / Save PDF** prints every tab, one section per page.

## Notes

- The repo is public, so the data files can be seen by anyone who finds them. Search engines are asked not to index the page.
- To suggest a website for the daily checks, contact the marketing team.

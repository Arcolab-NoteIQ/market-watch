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

## Email digest (Monday and Thursday)

`.github/workflows/email-digest.yml` runs `scripts/email_digest.py` at 8:30 am IST every Monday and Thursday. It emails everything new since the previous digest (high-signal items first, then product, service and AI news, new 483s and warning letters with Indian sites first, and competitor moves). If nothing is new, it sends a short note with last week's highlights instead. What has been sent is tracked in `email/state.json`.

Repository secrets (Settings, then Secrets and variables, then Actions):

| Secret | Value |
| --- | --- |
| `GMAIL_USER` | The sending Gmail address |
| `GMAIL_APP_PASSWORD` | A Gmail app password for that account (needs 2-Step Verification on the account) |
| `MAIL_TO` | Recipients, comma-separated. They are sent as Bcc, so recipients don't see each other. |

To test, open **Actions, then Email digest, then Run workflow**. Leave "Mark these items as sent" unticked so the test doesn't affect the next scheduled email.

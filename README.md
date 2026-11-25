# Pivot Path Market & Competitor Watch

A standalone web app for the Pivot Path team: industry trends, competitor moves, pharma AI news, FDA Form 483s and warning letters, with team flags and comments. Nobody needs a Claude account to use it.

## What is in this folder

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The app (plain HTML, CSS and JavaScript, no build step) |
| `data/*.json` | The research data the app shows. Replaced every Monday by Claude's scheduled refresh |
| `netlify/functions/notes.mjs` | Small serverless function that stores team flags and comments (Netlify Blobs, no database to manage) |
| `netlify.toml`, `package.json` | Netlify settings and the one dependency |

## One-time setup (about 10 minutes)

1. **Create a GitHub repository** (private is fine), e.g. `pivotpath/market-watch`, and upload the contents of this folder to it. Do not upload `node_modules`.
2. **Create a free Netlify account** at netlify.com (sign in with GitHub is easiest).
3. In Netlify: **Add new site, Import an existing project, GitHub**, pick the repository, leave the build settings as detected (publish directory `.`, functions `netlify/functions`) and deploy.
4. Netlify gives you a link such as `https://pivotpath-market-watch.netlify.app`. You can rename it under **Site configuration, Change site name**, or attach a company subdomain under **Domain management**.
5. Share the link with the team. Anyone with the link can open it, flag items and comment. Search engines are told not to index it.

## Keeping the data fresh

Claude's Monday scheduled task researches as before and commits new versions of `data/news.json`, `data/fda.json`, `data/competitors.json`, `data/run.json` and `data/sites.json` to the repository. Netlify redeploys automatically within a minute or two of each commit. For this, Claude needs push access to the repository: connect GitHub in Claude's settings and give the Claude GitHub App access to this repository.

To update data by hand, edit or replace the JSON files in GitHub; the field names must stay the same.

## Team features

- **Flag** marks an item for the team; it then appears in the **Flagged** tab with who flagged it.
- **Comments** open a thread under any news item, competitor row or 483.
- People enter their name once; it is remembered in their browser. Only the browser that posted a flag or comment can remove it.
- **Suggest a website** (bottom of the page) collects sites for the marketing team to add to the weekly checks.
- **Download CSV** exports the filtered list; **Print / Save PDF** prints every tab, one per page.

Flags and comments live in Netlify Blobs on your Netlify site, not in GitHub. To clear them all, delete the `team-notes` store in Netlify under **Blobs**.

## Notes

- Content is written by Claude from public sources; open the source link before using a figure in client material.
- Form 483 synopses come from company stock-exchange disclosures and trade press, not from FDA's text.

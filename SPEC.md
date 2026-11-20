# Cookie Leaderboard — build spec

Static site for GitHub Pages at `cookies.johannes-nirschl.tech`. NO build step: vanilla HTML/CSS/JS (ES modules ok), no frameworks, no npm. Language: English UI text.

## Files to create
- `index.html`, `css/style.css`, `js/app.js` — public leaderboard
- `admin/index.html`, `css/admin.css` (may share tokens with style.css), `js/admin.js` — admin
- `js/shared.js` — shared helpers (escape, rank titles, data validation/normalisation, constants)
- `404.html` — playful "cookie not found" page linking home
- `favicon.svg` — a cookie
Do NOT modify `data/leaderboard.json`, `CNAME`, `.nojekyll`, `SPEC.md`.
All asset paths must work both at domain root and when opened from `/admin/` (use `../` from admin, relative paths, no leading `/`) so it also works on a local static server.

## Data contract — `data/leaderboard.json`
```json
{ "version": 1, "updatedAt": "ISO", "people": [ { "id": "p-xxxx", "name": "str", "emoji": "🍪", "cookies": 42, "updatedAt": "ISO" } ],
  "log": [ { "at": "ISO", "personId": "p-xxxx", "name": "str", "delta": 5 } ] }
```
- `cookies` is an integer >= 0. `name` 1–40 chars trimmed. `emoji` one short string (default "🍪"). `log` keeps the newest 50 entries, newest first.
- `shared.js` exports `normalizeData(raw)` that tolerates missing/invalid fields (drops invalid people, clamps cookies, defaults emoji/log) and never throws on bad shape — returns a valid empty structure instead.
- Sorting: cookies desc, then name asc. Ties share the same rank number (1,1,3 style).

## Public page (`index.html`)
Goal: VERY playful, joyful, delightful. Think bakery-meets-arcade. Warm palette (cookie brown, cream, chocolate, pops of strawberry pink / mint / sprinkle colors). Rounded chunky display font from Google Fonts (e.g. "Fredoka" or "Baloo 2") + readable body font. Must look great on phone (360px) and desktop.
- Header: big wobbly/bouncy title "The Cookie Leaderboard" with a giant clickable cookie. Clicking the cookie makes it take a bite (chomp animation, bite marks via CSS mask/clip or SVG) and spawns a burst of crumbs; after some bites it regenerates. Count of bites shown playfully ("om nom ×3").
- Stats strip: total cookies in the jar, number of cookie collectors, last updated as relative time ("5 min ago").
- Podium for top 3: gold/silver/bronze, different heights, crown 👑 bobbing on #1, each shows emoji avatar, name, cookie count, and a rank title.
- Rank titles by cookie count (in shared.js): 0 "Crumb Seeker", 1–4 "Nibbler", 5–9 "Snack Apprentice", 10–24 "Cookie Connoisseur", 25–49 "Dough Master", 50–99 "Biscuit Baron", 100+ "Cookie Monarch".
- List for everyone (including ranks 4+): rank badge, emoji, name, title, count, and a bar made of little cookie icons / progress bar relative to the leader. Rows animate in staggered. Hover/tap on a row wiggles it and pops a few cookie emojis.
- "Recent crumbs" ticker/feed from `log`: "+5 🍪 for Anna · 2h ago" (negative deltas: "-2 🍪 ... (someone got hungry)").
- Background: slowly falling cookie/sprinkle particles (lightweight, canvas or CSS, max ~25 elements, paused when tab hidden).
- Confetti/cookie rain when you click the #1 podium spot.
- Empty state: cute "The jar is empty!" illustration/message.
- Loading state (skeleton or spinning cookie) and an error state with a retry button.
- Fetch `data/leaderboard.json?t=<Date.now()>` with `cache: "no-store"`. Auto-refresh every 60s (only while tab visible); animate count changes (count-up).
- Accessibility: semantic list/table roles, alt/aria labels, visible focus, sufficient contrast, ALL motion disabled/reduced under `prefers-reduced-motion: reduce`. Escape all user strings (use textContent, never innerHTML with data).
- Small footer: "baked at johannes-nirschl.tech" linking to https://johannes-nirschl.tech.

## Admin page (`admin/index.html`, URL `/admin`)
Same playful theme but more practical. `<meta name="robots" content="noindex">`.
Writes go through the GitHub REST API (contents endpoint) — this is the real auth: only someone with a valid token can save.
- **Settings panel** (collapsible, shown open if no token): owner (default `opencode-fast`), repo (default `cookies.johannes-nirschl.tech`), branch (default `main`), path (default `data/leaderboard.json`), token (password input). Help text: create a fine-grained personal access token limited to only this repo with "Contents: Read and write". "Remember on this device" checkbox → localStorage (key `cookieAdmin.settings`), otherwise sessionStorage. "Forget token" button. Wrap all storage access in try/catch.
- **Load**: GET `https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}` with headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-API-Version: 2022-11-28`. Decode base64 as UTF-8 (TextDecoder; emoji must survive). Keep the returned `sha`. If 404, start with empty data (and save will create the file without sha).
- **Editing (local draft)**: table/cards of people sorted like public page. Per person: quick buttons −1, +1, +5, +10, a custom amount input (+/− integer) with apply, editable name and emoji (with a small emoji picker of ~16 fun options + free text), delete (with confirm dialog naming the person). "Add person" form: name (required, 1–40 chars, reject duplicate names case-insensitively), emoji, starting cookies (int ≥ 0). Cookies can never go below 0 (clamp and show a playful toast). Each change appends to `log` (delta, name, personId, at) — collapse consecutive changes to the same person within the unsaved session into one log entry. New ids: `p-` + random base36.
- Show an "unsaved changes" badge with count; `beforeunload` warning when dirty. "Discard changes" reloads from GitHub.
- **Save**: PUT to the same contents URL with `{ message: "Update cookies: <short summary>", content: base64(UTF-8 JSON, 2-space indent, trailing newline), sha, branch }`. Set `updatedAt`. On success store the new sha, clear dirty, celebratory toast + cookie burst, and note "Live site updates in ~1 minute". On 409/422 (sha conflict): refetch, tell user someone else changed it, and offer to re-apply? Keep it simple: show error, keep draft, offer "Reload from GitHub (discard my changes)". On 401/403: "Token invalid or lacks Contents write permission". On network error: clear message. Never log the token. Disable save button while saving.
- Link "View leaderboard" → `../`.

## Quality bar
- No console errors. No external JS libraries (fonts from Google Fonts only).
- Keep JS modules small and readable; comments for non-obvious bits.
- Validate all inputs; no silent failures (toasts for errors).
- Must work with the page opened via a local static server (`python3 -m http.server` from the repo root) — admin can't save locally without a token, which is fine.

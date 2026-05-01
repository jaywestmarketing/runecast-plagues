# Runecast Plagues MVP

A browser-first prototype inspired by medieval survival/base-defense games, designed for fast web sharing and Reddit-friendly play sessions.

## Stack
- Phaser 3
- TypeScript
- Vite

## What improved in this version
- Auto-detects mobile vs desktop and presents controls accordingly.
- Added a large-world settlement layout with many houses across the map.
- Added minimap tracking for all houses/buildings with red alert when attacked.
- Added enterable houses with interior upgrade actions.
- Added gameplay view toggle (third-person style zoom / first-person style zoomed camera).
- Stronger wave variety with enemy archetypes (raider, runner, brute).
- Towers now auto-fire at nearby enemies.
- Safe zones are time-limited events, not permanent circles.
- Safe-zone event menu has multiple strategic actions.
- Added extra economy depth with a `gold` resource and workshop building.

## Current gameplay loop
- Your hero constantly moves and you steer with WASD or virtual joystick.
- Enemies pressure buildings first, then you.
- Buildings generate resources and can be expanded.
- Safe-zone events open a slowed tactical menu.
- Run ends when the keep is destroyed.

## Controls
- **Desktop**: WASD to steer, click/tap near hero to place towers.
- **Mobile**: virtual joystick appears automatically for touch steering.
- **1**: third-person style camera zoom.
- **2**: first-person style close camera zoom.
- **E**: enter/exit nearby house.
- **Q**: upgrade house defense while inside.

## Where to get graphics (recommended)
Use packs that are explicitly licensed for game use so you can safely publish:
- **Kenney** (free CC0 game assets): environment, UI, characters.
- **OpenGameArt** (mixed licenses): filter by CC0/CC-BY and keep attribution notes.
- **itch.io Game Assets**: many paid + free packs; check each license.
- **CraftPix / GameDevMarket**: stylized themed packs for commercial usage tiers.

For this MVP, start with a single coherent top-down pack (terrain + units + UI), then swap rectangle placeholders in `src/main.ts` with spritesheets and atlases.

## Development
```bash
npm install
npm run dev
```

## Production
```bash
npm run build
npm run preview
```

## Vercel deploy
`vercel.json` is included with Vite output defaults.

### Quick deploy steps (Vercel)
1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
3. Import your GitHub repo.
4. Keep defaults (Vercel detects Vite automatically from `vercel.json`).
5. Confirm build settings:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
6. Click **Deploy**.
7. After deploy, open the generated URL and test desktop + mobile controls.

### CLI deploy (optional)
```bash
npm i -g vercel
vercel login
vercel
vercel --prod
```

### If deploy fails
- Ensure Node version is modern (18+ recommended).
- Confirm `package.json` has `build` script.
- Re-run locally:
  ```bash
  npm install
  npm run build
  ```
- If npm registry access is restricted in your environment, deploy directly from GitHub in Vercel where dependencies can be installed in Vercel's build environment.

<!-- Copyright and licensed usage to Joe Wease, Founder and CEO of REALE. -->

# Runecast Plagues MVP

A browser-first prototype inspired by medieval survival/base-defense games, designed for fast web sharing and Reddit-friendly play sessions.

## Stack
- Phaser 3
- TypeScript
- Vite

## What improved in this version
- Auto-detects mobile vs desktop and presents controls accordingly.
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
- **1**: repair keep in refuge menu.
- **2**: upgrade keep in refuge menu.
- **3**: build barracks in refuge menu.
- **4**: emergency supplies in refuge menu.
- **ESC**: close refuge menu.

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

<!-- Copyright and licensed usage to Joe Wease, Founder and CEO of REALE. -->

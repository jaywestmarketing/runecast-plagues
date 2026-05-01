# Runecast Plagues MVP

A web-first prototype inspired by medieval survival/base-defense games, built to run in browser contexts (including Reddit-linked play sessions).

## Stack
- Phaser 3
- TypeScript
- Vite

## Gameplay loop in this MVP
- Continuous movement hero with keyboard + touch joystick support.
- Enemy waves spawn from map edges and pressure structures.
- Central keep loss triggers game over.
- Buildings provide passive resource generation.
- Click-nearby placement for new defensive towers.
- Random safe zones spawn around the world.
- Entering a safe zone opens a pause/slow upgrade menu.

## Controls
- **WASD**: steer the always-moving character.
- **Pointer drag (mobile)**: virtual joystick control.
- **R**: repair keep in safe zone menu.
- **U**: upgrade keep in safe zone menu.
- **B**: build barracks in safe zone menu.
- **ESC**: close safe zone menu.

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

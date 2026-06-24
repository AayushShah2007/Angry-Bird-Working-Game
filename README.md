# Angry Birds

A canvas-based Angry Birds clone built with vanilla JavaScript and [Matter.js](https://github.com/liabru/matter-js) physics engine. Fully playable on desktop and mobile devices.

## Features

- **10 levels** with progressive difficulty (introducing crates, pigs, barriers)
- **Physics-based gameplay** — realistic collisions, gravity, and projectile motion
- **Slingshot aiming** — drag, aim, and release to launch birds
- **Explode power-up** — available in levels 4–6 (1 use) and 8–10 (2 uses) — triggers a destructive blast on bird/pig collision
- **Mobile responsive** — full-screen menu map with bottom-to-top level layout and full-screen gameplay on mobile devices
- **Visual effects** — particle explosions, screen shake, cloud reveal transitions, and animated backgrounds

## Play

Play the game directly: **[https://aayushshah2007.github.io/Angry-Bird-Working-Game/](https://aayushshah2007.github.io/Angry-Bird-Working-Game/)**

Or clone the repo and open `index.html` in any modern browser.

```bash
git clone https://github.com/AayushShah2007/Angry-Bird-Working-Game.git
cd Angry-Bird-Working-Game
```

No build tools or server required — just serve the files with any static file server or open `index.html` directly.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Select level | Click on map node | Tap on map node |
| Grab bird | Click and hold near bird | Touch and hold near bird |
| Aim/Launch | Drag and release | Drag and release |
| Explode | Click 💥 EXPLODE button | Tap 💥 EXPLODE button |

## Assets

- **Sprites & backgrounds**: Community assets from [Gumroad](https://danshive.gumroad.com/) and raw GitHub repositories
- **Explosion sprite**: [Kenney](https://kenney.nl/) asset pack via Cloudinary
- **Physics**: [Matter.js](https://github.com/liabru/matter-js) (loaded from CDN with jsDelivr fallback)

## Project Structure

```
├── index.html          # Entry point — canvas, UI overlays, button elements
├── css/
│   └── style.css       # Responsive styles, mobile layout, overlays
├── js/
│   └── game.js         # All game logic (physics, rendering, input, levels)
└── README.md
```

## Tech Stack

- **Canvas 2D API** — rendering
- **Matter.js** — physics engine
- **Vanilla JavaScript** — no frameworks or build steps

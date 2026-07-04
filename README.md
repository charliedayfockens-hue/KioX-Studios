<h1 align="center">KIOX STUDIOS</h1>

<p align="center"><em>Small, fast, good-looking browser games — built to just work on your phone.</em></p>

<p align="center">
  <a href="https://charliedayfockens-hue.github.io/KioX-Studios/"><strong>▶&nbsp; Play&nbsp;now</strong></a>
</p>

---

## Who we are

**KioX Studios** is an independent game studio making lightweight games that run
right in the browser — no downloads, no installs, no app store. Everything is
built with plain **HTML, CSS and JavaScript** (plus a little WebGL) so a game is
always one tap away and works the same on iPhone, Android and desktop.

Our focus:

- **Mobile-first** — designed for touch and landscape phones before anything else.
- **Instant play** — open a link and you're in.
- **Self-contained** — no build steps and no fragile external dependencies, so
  the games keep working for years.
- **Feel over realism** — arcade handling that's fun in the first five seconds.

## Games

| Game | Genre | Status | Play |
| --- | --- | --- | --- |
| **KioX Drift** | 3D arcade drifting | 🟢 Playable (v1) | [Play ▶](https://charliedayfockens-hue.github.io/KioX-Studios/) |

More games are on the way.

### 🏎️ KioX Drift

A 3D mobile drift arena. Slide the car around a floodlit parking-lot map, lay
down smoke and skid marks, and chase a bigger drift score.

**Controls**

- **Touch:** on-screen Gas, Brake / Reverse, Steer L / R and Handbrake (multi-touch).
- **Keyboard:** `W`/`↑` gas · `S`/`↓` brake/reverse · `A`/`←` left · `D`/`→` right · `Space` handbrake.

**Highlights**

- Polished mobile main menu with an animated 3D car preview
- Fullscreen + landscape support with a rotate hint
- A 3D drift arena (asphalt, markings, barriers, cones, buildings, lights)
- A drift car built from primitives with steering front wheels and body roll
- Arcade drift physics, tire smoke, skid marks and a live drift score
- A smooth 3D follow camera

## Tech

- **Rendering:** [Three.js](https://threejs.org/) (WebGL), vendored locally so
  there's no CDN dependency to break.
- **Everything else:** vanilla HTML / CSS / JavaScript ES modules — no framework,
  no bundler, no build.
- **Audio:** procedural engine and tire sounds via the WebAudio API (no asset files).

## Hosting

The site is served with **GitHub Pages** straight from this repository, so the
game is live at:

**https://charliedayfockens-hue.github.io/KioX-Studios/**

Because everything uses relative paths and no build step, you can also just open
`index.html` locally in any modern browser to play offline.

## Project layout

```
index.html              # entry point
css/style.css           # menu + HUD styling
js/
  main.js               # app wiring (menu <-> game)
  ui.js                 # menu, settings, fullscreen, 3D car preview
  game.js               # renderer, follow camera, main loop, HUD
  world.js              # the 3D drift arena
  car.js                # the drift car + arcade physics
  effects.js            # tire smoke + skid marks
  audio.js              # procedural engine / tire sound
  controls.js           # touch + keyboard input
  vendor/three.module.js
```

---

<p align="center"><sub>© KioX Studios — made for the web.</sub></p>

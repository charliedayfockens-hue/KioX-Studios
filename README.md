# KioX Drift — Mobile Drift Arena

A 3D mobile-first drifting game built with plain HTML, CSS and JavaScript using [Three.js](https://threejs.org/) (loaded from a CDN via an import map — no build step).

## Play

Open `index.html` in a browser, or host on **GitHub Pages** (Settings → Pages → deploy from branch). Everything uses relative paths, so it works from a project subpath.

## Controls

**Touch:** on-screen Gas, Brake/Reverse, Steer L/R and Handbrake buttons (multi-touch).

**Keyboard:** W/↑ gas · S/↓ brake/reverse · A/← left · D/→ right · Space handbrake.

## Features

- Polished mobile main menu with an animated 3D car preview
- Fullscreen + landscape-orientation support with a rotate hint
- A 3D drift arena (asphalt, markings, barriers, cones, buildings, lights)
- A drift car built from primitives with steering front wheels and body roll
- Arcade drift physics with a handbrake, tire smoke, skid marks and a drift score
- A smooth 3D follow camera

## Structure

```
index.html
css/style.css
js/  main.js ui.js game.js world.js car.js effects.js audio.js controls.js
```

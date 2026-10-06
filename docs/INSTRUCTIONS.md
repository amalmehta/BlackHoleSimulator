# Instructions

## What you need

- A browser with WebGL 2 and float render targets: any recent Chrome, Edge, Safari (15+) or Firefox, with hardware acceleration on.
- Node.js 18 or newer, only to run the tests.
- No build step and no install. The site is plain HTML, CSS and JavaScript.

## Run it

The live site is at <https://amalmehta.github.io/BlackHoleSimulator/>. To run it yourself, double-click `index.html` or serve the folder.

Serving the folder is recommended, so the page behaves exactly as it does online:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The math is typeset by KaTeX, loaded from cdnjs. Offline, the formulas show as raw TeX and everything else still works.

## Use it

**The live view (top of the page)**

| Action | How |
|---|---|
| Orbit the camera | Drag |
| Zoom | Pinch on a trackpad or touch screen, ⌥/⌘ + scroll, or the + / − buttons |
| Back to the start view | **Reset view** |
| Scroll the page | Plain scrolling always scrolls the page, never zooms |

The readout in the top-right corner shows the camera's distance (in units of M), its height above the disk and the frame rate.

**Settings**: the **Settings** button, or **⌘,** (Ctrl+, on Windows/Linux). Esc closes the panel. Every preference is here:

- *Picture quality*: resolution, max ray steps, step size, bloom, exposure. If it runs slowly, lower **Resolution** first.
- *Accretion disk*: show or hide it, inner and outer edge, peak temperature, spin speed.
- *Physics*: switch light bending, Doppler beaming and gravitational redshift on or off, to see what each one does.
- *Sky & camera*: stars, star brightness, field of view, auto-orbit and its speed.

Settings are saved in this browser (localStorage). **Reset to defaults** restores them.

**The article** explains the physics in seven short sections. Each chart responds to hover. The sliders change the impact parameter $b$, and "Data table" shows the numbers behind each chart. "Try it" buttons flip a setting and scroll back up to the live view.

**Feedback**: the small **Feedback** tab on the right edge. Notes are stored only in this browser. Use **Download** or **Copy** to pass them on. Nothing is sent anywhere.

## Test it

```bash
node --test
```

This runs `tests/physics.test.js` (10 tests). They check the key radii, the photon-sphere peak of the potential, capture vs escape around $b_c$, the exact deflection against the weak-field expansion and against a traced ray, conservation of $h$, the redshift factor, the disk temperature profile and blackbody colours.

The GPU shader has no automated test. Check it by eye: see "How it's tested" in [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md).

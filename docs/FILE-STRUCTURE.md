# File structure

```
Black Hole Simulator/
├── index.html              The whole site: live view, article, settings and feedback panels
├── css/
│   └── style.css           All styles (dark theme, figures, panels, phone layout)
├── js/
│   ├── physics.js          Schwarzschild math, no DOM. Shared by the page and the tests
│   ├── renderer.js         WebGL 2 ray tracer: scene shader, bloom, tone mapping, orbit camera
│   ├── app.js              Live view: camera controls, render loop, HUD, "Try it" buttons
│   ├── settings.js         Settings schema, saved values, Settings panel, ⌘, shortcut
│   ├── feedback.js         Feedback tab (notes kept in this browser)
│   └── figures.js          Interactive 2D charts for the article
├── tests/
│   └── physics.test.js     Node tests for physics.js (run: node --test)
├── docs/
│   ├── INSTRUCTIONS.md     Set up, run, use, test
│   ├── SYSTEM-DESIGN.md    Architecture, flows, decisions, limits
│   ├── FILE-STRUCTURE.md   This file
│   └── images/             Screenshots used by the README
├── README.md               One line, pictures, links
└── black_hole_simulator.md Project brief, assumptions and changelog
```

Scripts load in this order (classic scripts, so the page also works from `file://`):
`physics.js` → `settings.js` → `feedback.js` → `renderer.js` → `app.js` → `figures.js`.
Each one adds a single global: `BH`, `Settings`, `Feedback`, `BlackHoleRenderer` + `orbitCamera`, `SimulatorApp` and `Figures`.

# Black Hole Simulator

A non-spinning black hole ray-traced live in your browser, with an illustrated walk-through of the math behind every pixel.

![The simulator: a lensed accretion disk around a Schwarzschild black hole](docs/images/hero.jpg)

| Same view, light bending switched off | How rays bend near the hole |
|---|---|
| ![Without lensing](docs/images/no-lensing.jpg) | ![Ray diagram](docs/images/figure-rays.png) |
| **Exact bend vs Einstein's 4M/b** | **Why one side of the disk is brighter** |
| ![Deflection chart](docs/images/figure-deflection.png) | ![Redshift chart](docs/images/figure-redshift.png) |

```mermaid
flowchart LR
  P[physics.js<br/>Schwarzschild math] --> R[renderer.js<br/>GPU ray tracer]
  P --> F[figures.js<br/>interactive charts]
  S[settings.js] --> R
  R --> Page[index.html]
  F --> Page
```

## Links

- [Instructions](docs/INSTRUCTIONS.md): set up, run, use
- [System design](docs/SYSTEM-DESIGN.md): how it works and why
- [File structure](docs/FILE-STRUCTURE.md): what's where

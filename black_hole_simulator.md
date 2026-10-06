PROJECT NAME: black_hole_simulator

META-INSTRUCTIONS:

<Read it all before acting. Ask about anything unclear, contradictory or
 underspecified — before starting and mid-build. Ask in the question widget
 (AskUserQuestion): related questions batched, concrete options, your
 recommendation first. Plain text only if the widget isn't available.>

<Don't expand scope. Anything not listed here is a proposal, including changes
 to this file — propose it, don't do it.>

<Prefer doing over describing: run the code, write the files, test it.>

<Always in scope, no proposal needed: when it goes on GitHub, a README that is
 easy to read at a glance — a line on what it is, then clear visuals
 (screenshots, a diagram or a chart), then links. Everything else goes in
 linked files: docs/INSTRUCTIONS.md (setup, run, use),
 docs/SYSTEM-DESIGN.md (see below) and docs/FILE-STRUCTURE.md (what's where). If what you're
 building is an application rather than a script, also a small unobtrusive feedback tab, and a settings
 button or tab (⌘, on the Mac) that gathers its preferences in one place.>

<If what you're building is an application, build it as a Mac app first; the
 website comes after, as its own step.>

<Name things the way a person would say them — "Goal Tracker", not
 goal_tracker — for the app, its windows, titles, files people open, repo
 descriptions and README headings. When you create the GitHub repo, name it
 with no "_" or "-": one word or joined words, e.g. GoalTracker.>

<Always in scope: a system design doc in the codebase, docs/SYSTEM-DESIGN.md,
 kept current as the build changes. Cover the architecture (with a Mermaid
 diagram), each component's job, the main flows, where data lives, the key
 design decisions and their trade-offs, how it's tested, and known limits.>

<Finish by listing every deliverable: path, what it is, how to check it works.>

<Git rules (no Claude attribution, never commit .claude/) are in
 ~/.claude/CLAUDE.md and apply on their own — nothing to repeat here.>

<Keep the changelog at the bottom current.>

CONTEXT:

create a complete black hole simulator with full graphics / detailed rendering.

DELIVERABLES:

create a website depitcting the graphics & math involved

OPEN QUESTIONS / ASSUMPTIONS:

<Agent fills in: what it guessed, what it decided without asking.>

Asked and answered (2026-10-06):
- Platform: website only. The DELIVERABLES field asks for a website, which overrides the "Mac app first" meta-instruction for this project.
- Physics: exact Schwarzschild (non-spinning). Kerr is out of scope.
- GitHub: first local only, then (on request) a private repo amalmehta/BlackHoleSimulator, later made public with GitHub Pages.

Decided without asking:
- Plain static site (HTML/CSS/JS, WebGL 2) with no build step or dependencies. KaTeX from cdnjs typesets the formulas.
- Geometric units G = c = M = 1. Disk from r = 6M (ISCO) to 24M, peak 5,500 K before redshift (a visual choice; real disks are far hotter).
- Ray tracing uses the Cartesian form a = -3Mh²x/r⁵ (exact orbit shape) with RK4.
- Disk colour: Planck × CIE 1931 → sRGB. Brightness ∝ (gT)⁴. Doppler and gravitational shift combined in g.
- Bloom and ACES tone mapping are artistic choices, adjustable in Settings.
- Dark theme only.
- Feedback tab keeps notes in the browser (download/copy). It sends nothing, because there's no backend and no recipient was specified.
- Plain scrolling scrolls the page. Zoom is pinch, ⌥/⌘-scroll or buttons, so the full-screen hero doesn't trap page scroll.
- Settings (⌘,) holds every preference. "Try it" buttons in the article flip single settings as shortcuts.

CHANGELOG:

- 2026-10-06 — created
- 2026-10-06 — built the website: live WebGL ray tracer, math article with interactive figures, settings, feedback tab, tests, README and docs
- 2026-10-06 — published: public GitHub repo with the site on GitHub Pages
- 2026-09-15 — added meta-instruction: built-out applications include a small feedback tab
- 2026-09-15 — added meta-instruction: no "Claude" attribution in commits, PRs, or branches
- 2026-09-16 — added meta-instruction: always include a README when adding to GitHub
- 2026-09-16 — changed meta-instruction: ask clarifying questions in the question widget
- 2026-09-17 — added meta-instructions: Claude never a contributor; never commit .claude/
- 2026-09-26 — compressed the meta-instructions and every field prompt; git rules moved to the global instruction file
- 2026-09-27 — added meta-instruction: applications are built as a Mac app first, then a website
- 2026-09-28 — folded inputs, instructions, constraints, deliverables and done criteria into one free-form CONTEXT
- 2026-09-28 — changed meta-instruction: a README on GitHub always includes a visual
- 2026-09-28 — added meta-instruction: name things like a person would, never snake_case
- 2026-09-28 — changed meta-instruction: README leads with visuals; instructions live in a linked guide
- 2026-09-28 — changed meta-instruction: README is visuals and links; details in docs/INSTRUCTIONS.md and docs/FILE-STRUCTURE.md
- 2026-09-29 — changed meta-instruction: GitHub repo names have no "_" or "-"
- 2026-10-02 — added a DELIVERABLES field after CONTEXT
- 2026-10-02 — added meta-instruction: every project has a system design doc at docs/SYSTEM-DESIGN.md
- 2026-10-05 — added meta-instruction: applications include a settings button or tab

# Claude Scratchpad

A GitHub Pages site that hosts small subsites.

Live at: https://cjs1218.github.io/Claud-scratchpad/

## Structure

```
index.html        Landing page listing all subsites
assets/style.css  Shared styles
hello/            Example subsite → /Claud-scratchpad/hello/
.nojekyll         Serve files as-is (no Jekyll build)
```

## Adding a subsite

1. Create a folder, e.g. `my-thing/`, with an `index.html` inside.
2. Add a link to it in the list in the root `index.html`.
3. Commit and push — it will be served at `/Claud-scratchpad/my-thing/`.

Use relative links (`../assets/style.css`, `../`) so pages work under the
`/Claud-scratchpad/` path.

## Enabling Pages

Settings → Pages → Build and deployment → Source: **Deploy from a branch**,
then pick the `main` branch and the `/ (root)` folder.

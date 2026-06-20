# DocPrivacy Tools

Privacy-first document & image tools micro-SaaS. All processing is 100% client-side — files never leave the user's browser.

## Tools

| Route | Tool | Library |
|---|---|---|
| `/compress-pdf` | Compress PDF | pdf-lib |
| `/merge-pdf` | Merge PDF | pdf-lib |
| `/jpg-to-pdf` | JPG/PNG/WebP to PDF | pdf-lib |
| `/pdf-to-jpg` | PDF to JPG images | pdfjs-dist |
| `/compress-image` | Compress JPG/PNG/WebP | browser-image-compression |
| `/edit-pdf` | Edit PDF (Word-like text editing + annotations) | pdfjs-dist + pdf-lib |
| `/unlock-pdf` | Unlock PDF (remove restrictions / open with password) | pdfjs-dist + pdf-lib |

## Run locally

```bash
cd web-document-tools
npm install
npm run dev
```

Opens at `http://localhost:4321`

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the static build locally
```

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repo.
2. In Cloudflare Pages — Create a project — connect your repo.
3. Set:
   - Framework preset: Astro
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Deploy. Cloudflare auto-deploys on every push to main.

## Before launch checklist

- [ ] Replace `https://docprivacy.tools` in `astro.config.mjs` with your real domain
- [ ] Add Cloudflare Web Analytics token in `src/layouts/Layout.astro` (search `YOUR_TOKEN`)
- [ ] Replace `<AdSlot />` components with real AdSense units
- [ ] Add a real OG image at `public/og-default.png` (1200x630)

## Adding more tools

1. Add `src/lib/your-tool.ts` — pure TS processing logic, no DOM at module level
2. Add `src/components/tools/YourTool.tsx` — React island (drag-drop, progress, download)
3. Add `src/pages/your-tool.astro` — import `ToolPage` + your React widget

The `ToolPage` component handles: hero, privacy banner, "How it works" steps, FAQ accordion, ad slots, and footer. You only define the content; the template renders everything else.

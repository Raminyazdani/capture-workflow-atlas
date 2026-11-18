# Capture Atlas

[Open the live atlas](https://capture-workflow-atlas.vercel.app/) · [Inspect the fragment QC review](https://capture-workflow-atlas.vercel.app/#fragments/fr-qc-review) · [Explore the regulatory study](https://capture-workflow-atlas.vercel.app/#study/study-start)

Capture Atlas is an interactive companion to [Capture Workflow](https://github.com/Raminyazdani/capture-workflow/tree/ed81238dd9d7316f50f0da648de05d8470f0836c). Open a stage to inspect its inputs, operations, settings, outputs and source. The overview summarizes the three public input routes. The detailed RNA, paired-peak and fragment maps expose their dependencies. The regulatory study map explains downstream research methods.

Drag cards to rearrange them. The browser saves positions separately for each map. **Fit** shows the whole route and **Reset** restores the default arrangement. The stage index searches names, parameters and actions. URLs identify the selected route and stage.

## Local development

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Build with `npm run build` and preview the output with `npm run preview`. Vercel serves the static files in `dist/` from the production branch `main`.

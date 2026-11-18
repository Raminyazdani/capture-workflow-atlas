# Capture Atlas

[Open the full map](https://capture-workflow-atlas.vercel.app/#full/en-manifest) · [Trace the ATAC-seq FRiP calculation](https://capture-workflow-atlas.vercel.app/#full/fr-qc~score-frip) · [Download the complete vector diagram](https://capture-workflow-atlas.vercel.app/full-workflow.svg)

Capture Atlas is an interactive companion to [Capture Workflow](https://github.com/Raminyazdani/capture-workflow/tree/ed81238dd9d7316f50f0da648de05d8470f0836c). Open a stage to inspect its inputs, operations, settings, outputs and source. The overview summarizes the three public input routes. The detailed RNA, paired-peak and fragment maps expose their dependencies. The regulatory study map explains downstream research methods.

The full map joins the Nextflow planner, RNA-seq count processing, two ATAC-seq input routes, joint WNN clustering, output publication and the study-specific regulatory extension. Select a numbered operation for its calculation, units, decision rules, inputs, outputs and source. The RNA-seq count-gate and ATAC-seq FRiP examples accept editable values. Dashed arrows mark alternatives and study handoffs.

Drag stage groups to rearrange them. The browser saves positions separately for each map and level of detail. **Fit** shows the whole route and **Reset** restores its starting positions. Use the phase shortcuts, the stage selector or the searchable index to navigate. URLs can identify an individual operation. The downloadable SVG uses the same graph data and links each operation to the live inspector.

## Local development

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Build with `npm run build` and preview the output with `npm run preview`. Vercel serves the static files in `dist/` from the production branch `main`.

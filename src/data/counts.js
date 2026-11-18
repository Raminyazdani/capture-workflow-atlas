// Stage IDs and parameter defaults come from the pinned scientific presets.
// The separate peak-count node represents an input file, not a Nextflow task.
const common = ['rna', 'paired'];
const paired = ['paired'];
const rnaPreset = 'config/presets/scientific_rna.json';
const pairedPreset = 'config/presets/scientific_paired.json';
const rnaBackend = 'backends/scientific/code/steps/rna_core.R';
const portable = 'code/scientific_helpers/portable_rna.R';
const pairedAdapter = 'backends/scientific/code/steps/paired_align.R';

function stage(id, title, subtitle, scope, kind, inputs, actions, settings, outputs, source, routes = common) {
  return {
    id, title, subtitle, scope, kind, routes, inputs, actions, outputs, source,
    parameters: settings.map(([name, value]) => ({ name, value })),
  };
}

export const countNodes = [
  stage('rna_load', 'Load RNA counts', 'Read a matrix for one capture', 'input', 'input',
    ['RNA-only route: 10x HDF5, Matrix Market with features and barcodes, or a Seurat RDS with a joined raw-count layer.',
     'Shared-peak route: one RNA Seurat RDS for each capture, tagged with its dataset/capture identity.'],
    ['Select gene-expression rows and validate nonnegative integer counts.',
     'Preserve the original barcode and feature ID. Prefix cell IDs with the capture identity so barcodes can recur in different captures.'],
    [['assay / counts_layer', 'RNA / counts'], ['feature_type', 'Gene Expression'], ['constructor filters', 'min_cells = 0, min_features = 0']],
    ['A Seurat object with a raw counts layer.', 'Feature map, original barcodes and capture-aware cell IDs.'], portable),

  stage('rna_capture_assemble', 'Assemble capture', 'Collect RNA files for one capture', 'capture', 'process',
    ['Loaded RNA objects and their feature maps from one capture.'],
    ['Pass through a single input. Multiple inputs require explicit disjoint-barcode concatenation.',
     'Check identical ordered features, matching feature maps, and unique barcodes. Compare assembled counts with the input columns.'],
    [['input_relationship', 'reject by default; set concat_disjoint for multiple inputs'], ['require_identical_features', 'true']],
    ['One capture-level RNA object with the original sparse counts.'], portable),

  stage('rna_qc', 'Measure RNA quality', 'Count molecules and detected genes', 'capture', 'qc',
    ['Assembled RNA counts from one capture.'],
    ['For each cell, measure total UMI counts, detected genes and the share of counts contributed by the most abundant genes.',
     'Summarize the distribution of each metric within the capture.'],
    [['percent_top_n', '20 genes'], ['summary quantiles', '0, 1, 25, 50, 75, 99 and 100%']],
    ['Per-cell nCount_RNA, nFeature_RNA and percent_top20.', 'Capture summary and metric dictionary.'],
    'backends/scientific/code/steps/inputs_qc.R'),

  stage('rna_complexity', 'Estimate complexity', 'Measure gene diversity relative to depth', 'capture', 'qc',
    ['Per-cell RNA counts and detected-gene counts.'],
    ['Calculate genes per UMI and log10(detected genes) divided by log10(UMIs) when the values have a valid logarithm.',
     'Check whether each complexity measure changes with RNA depth.'],
    [['association_method', 'Spearman correlation'], ['primary_column', 'complexity_log_ratio']],
    ['Per-cell complexity values, capture summaries and depth correlations.'],
    'backends/scientific/code/steps/inputs_qc.R'),

  stage('rna_mitochondrial', 'Mitochondrial fraction', 'Record an optional RNA quality metric', 'capture', 'qc',
    ['Per-cell counts and feature map.', 'An explicit list of mitochondrial gene IDs when available.'],
    ['With a validated gene list, compute 100 × mitochondrial RNA counts / total RNA counts.',
     'With the preset setting, record the measurement as unavailable. This stage records a metric for review.'],
    [['mode', 'unavailable by default; gene_ids enables computation'], ['gene_ids', 'empty in preset'], ['percent_column', 'percent.mt']],
    ['Mitochondrial fraction or NA, with the definition and status.'], portable),

  stage('rna_ribosomal', 'Ribosomal fraction', 'Measure ribosomal-protein mRNA', 'capture', 'qc',
    ['Per-cell counts and feature map.', 'An explicit list of ribosomal-protein gene IDs when available.'],
    ['Calculate the share of RNA counts from the declared ribosomal-protein genes.',
     'Leave the metric unavailable if the reference has no supplied definition.'],
    [['mode', 'unavailable by default; gene_ids enables computation'], ['gene_ids', 'empty in preset'], ['percent_column', 'percent_ribo']],
    ['Ribosomal-protein mRNA fraction or NA, with its definition and status.'], portable),

  stage('rna_doublets', 'Score RNA doublets', 'Flag cells with mixed RNA profiles', 'capture', 'qc',
    ['Capture-level counts, detected genes and UMI depth for each cell.'],
    ['Run scDblFinder on cells that meet both coverage requirements. A mixed profile may arise when two cells share one barcode.',
     'Record singlet or doublet calls for tested cells, and an explicit untested status below the coverage limits.'],
    [['min_features / min_umi', '50 genes / 100 UMIs to enter the test'], ['clusters', 'false in preset'], ['seed_policy', 'entity_sha256 with seed_base 42']],
    ['Per-cell doublet scores, calls and testing status.', 'Saved scDblFinder output for the capture.'], rnaBackend),

  stage('rna_filter', 'Filter RNA cells', 'Select the retained cell population', 'capture', 'qc',
    ['All prefilter cell metrics and RNA doublet calls for one capture.'],
    ['Compute lower depth and gene-count thresholds per capture from median and MAD on the log scale. Use the larger of each learned cutoff and its fixed minimum.',
     'Exclude invalid or zero-depth profiles. When singlet selection is enabled, require a tested singlet call. Record a reason for each exclusion.'],
    [['min_umi / min_features', '500 / 200 in the preset; 0 / 50 in the synthetic example'],
     ['lower_mads / sensitivity_mads', '3 for the primary cutoff, 4 for sensitivity'], ['require_singlet', 'true by default']],
    ['Retained RNA object for each capture, full QC ledger, measured cutoffs and exclusion counts.'], portable),

  stage('rna_merge', 'Merge the cohort', 'Gather retained cells from all captures', 'cohort', 'process',
    ['Retained capture objects belonging to the selected cohort.'],
    ['Check compatible genome build, feature namespace and feature order, plus unique cell identities across captures.',
     'Merge the raw RNA layers and retain the capture of origin for each cell.'],
    [['join_layers', 'true'], ['merge_data', 'false']],
    ['A cohort object with joined raw counts, cell metadata and preserved capture IDs.'], rnaBackend),

  stage('rna_normalize', 'Normalize expression', 'Adjust RNA profiles for library size', 'cohort', 'process',
    ['Merged cohort with raw RNA counts.'],
    ['Apply Seurat LogNormalize. Divide each count by its cell total, multiply by the scale factor and apply log1p.',
     'Store normalized expression alongside the raw counts.'],
    [['normalization.method', 'LogNormalize'], ['scale.factor', '10,000']],
    ['Normalized RNA expression for downstream modeling and a saved cohort checkpoint.'], rnaBackend),

  stage('rna_hvg', 'Choose variable genes', 'Select features for the RNA model', 'cohort', 'process',
    ['Normalized RNA cohort.'],
    ['Run Seurat FindVariableFeatures using variance-stabilizing selection.'],
    [['selection.method', 'vst'], ['nfeatures', '3,000 requested in the preset']],
    ['Selected variable-gene list and RNA_variable_features.csv.'], rnaBackend),

  stage('rna_scale', 'Scale variable genes', 'Center and scale the model features', 'cohort', 'process',
    ['Normalized cohort and selected variable-gene list.'],
    ['Apply Seurat ScaleData to the variable genes selected in this cohort.'],
    [['feature_source', 'variable'], ['assay', 'RNA']],
    ['Scaled RNA values ready for principal component analysis.'], rnaBackend),

  stage('rna_pca', 'Fit RNA PCA', 'Summarize variation in expression', 'cohort', 'process',
    ['Scaled RNA values from selected genes.'],
    ['Fit principal components and quantify their share of variance among the fitted components.',
     'Check correlation with UMI depth and detected genes. Record the genes with the largest absolute loadings.'],
    [['npcs', '50 requested in the preset; 8 in the synthetic example'],
     ['top_loadings', '15 per PC in the preset; 3 in the example'], ['seed.use', '42']],
    ['RNA PCA coordinates, loadings and per-component diagnostics.'], rnaBackend),

  stage('rna_neighbors', 'Build RNA neighbors', 'Connect cells in RNA component space', 'cohort', 'process',
    ['RNA PCA coordinates for the cohort.'],
    ['Find approximate nearest neighbors using Annoy and Euclidean distance in the selected PCs.',
     'Build the shared nearest-neighbor graph used for community detection.'],
    [['dimensions', 'PCs 1–30 in the preset; PCs 1–5 in the example'],
     ['k.param', '20 neighbors in the preset; 10 in the example'], ['prune.SNN', '1/15']],
    ['RNA nearest-neighbor and shared-neighbor graphs in the cohort object.'], rnaBackend),

  stage('rna_cluster', 'Cluster RNA cells', 'Save the expression-based partition', 'cohort', 'output',
    ['Cohort object with the RNA_snn graph.'],
    ['Run Louvain community detection across the review resolutions. Save the chosen partition as RNA_cluster.',
     'This is a terminal target for RNA-only analysis and the reusable RNA checkpoint for the paired counted-peak route.'],
    [['resolution', '0.4 by default; examples compare 0.4 and 0.6'],
     ['review_resolutions', '0.2, 0.4, 0.6'], ['algorithm / random.seed', '1 (Louvain) / 42']],
    ['Per-cell RNA cluster labels, counts by capture and a clustered Seurat object before UMAP.'], rnaPreset),

  stage('shared_peak_counts', 'Shared peak counts', 'Provide one peak matrix per capture', 'input', 'input',
    ['An RDS list per capture containing member and counts. Each counts object is a sparse dgCMatrix of peaks by raw barcodes.'],
    ['Use a shared ordered set of peak intervals across captures. Supply the matching raw RNA Seurat object alongside each peak-count matrix.',
     'The counted-peak route starts with these counts. Fragment-level QC and recounting belong to the fragment route.'],
    [['type / file role', 'peak_counts / peaks'], ['coordinates', 'chrom-start-end, 1-based closed intervals'],
     ['member', 'same dataset/capture ID in RNA and ATAC inputs']],
    ['Capture-tagged peak matrix and matching RNA identity for the alignment stage.'], 'docs/configuration.md', paired),

  stage('paired_align', 'Align RNA and ATAC', 'Match retained cells by identity', 'cohort', 'integration',
    ['RNA clustering checkpoint.', 'Raw paired RNA RDS and shared peak counts for each capture.'],
    ['Check the capture tag, match the complete raw barcode sets, and reorder ATAC columns to the retained RNA cell order. Raw barcodes may repeat across different captures.',
     'Join the aligned peak counts across captures and verify that the ATAC assay contains the exact original counts for retained cells.'],
    [['capture match', 'Exact dataset/capture member tag'], ['barcode matching', 'Exact within-capture sets; column order may differ'],
     ['feature matching', 'Identical ordered peak intervals across captures']],
    ['One paired object containing aligned RNA and ATAC assays.', 'Alignment audit and ATAC count depth per cell.'], pairedAdapter, paired),

  stage('atac_independent', 'Cluster ATAC profiles', 'Use accessibility alone on paired cells', 'cohort', 'output',
    ['Aligned paired object with counts in common peaks.'],
    ['Weight peak counts with TF-IDF, select frequently supported peaks and fit latent semantic indexing (LSI) using SVD.',
     'Report LSI associations with depth. Build an ATAC-only neighbor graph on the selected dimensions, cluster it, and generate an ATAC UMAP.'],
    [['TF-IDF / feature cutoff', 'Method 1, scale 10,000, cutoff q5'],
     ['SVD / graph dimensions', '50 fitted, 2–30 used in preset; 8 fitted, 2–5 used in example'],
     ['neighbors / resolution', 'k = 20 (10 in example); selected resolution 0.4']],
    ['ATAC cluster labels, ATAC UMAP, per-capture cluster counts and LSI depth diagnostics.'], pairedPreset, paired),

  stage('paired_wnn', 'Integrate with WNN', 'Weight RNA and ATAC for each cell', 'cohort', 'output',
    ['Aligned paired object with RNA PCs and peak counts.'],
    ['Fit an ATAC LSI on the aligned cells. In the preset, review LSI component 1 for association with ATAC depth and omit it if the absolute Spearman correlation reaches 0.3.',
     'Fit weighted nearest neighbors (WNN) using RNA and ATAC components. Estimate a modality weight for each cell, cluster the weighted graph and compute WNN and ATAC UMAPs.'],
    [['RNA / ATAC dimensions', 'Preset starts at 1–30 for both, then applies the ATAC depth review. Example uses 1–5 / 2–5 with pruning off.'],
     ['k.nn / resolution', '20 neighbors (10 in example) / 0.4'], ['batch_policy', 'no_batch_correction']],
    ['RNA and ATAC weights per cell, WNN labels, both UMAP embeddings and comparison tables by capture and RNA cluster.'],
    'backends/scientific/code/steps/atac_paired.R', paired),
];

export const countEdges = [
  ['rna_load', 'rna_capture_assemble'],
  ['rna_capture_assemble', 'rna_qc'],
  ['rna_qc', 'rna_complexity'],
  ['rna_complexity', 'rna_mitochondrial'],
  ['rna_mitochondrial', 'rna_ribosomal'],
  ['rna_ribosomal', 'rna_doublets'],
  ['rna_doublets', 'rna_filter'],
  ['rna_filter', 'rna_merge'],
  ['rna_merge', 'rna_normalize'],
  ['rna_normalize', 'rna_hvg'],
  ['rna_hvg', 'rna_scale'],
  ['rna_scale', 'rna_pca'],
  ['rna_pca', 'rna_neighbors'],
  ['rna_neighbors', 'rna_cluster'],
  ['rna_cluster', 'paired_align'],
  ['shared_peak_counts', 'paired_align'],
  ['paired_align', 'atac_independent'],
  ['paired_align', 'paired_wnn'],
];

import { countNodes, countEdges } from './counts.js';
import { fragmentNodes, fragmentEdges } from './fragments.js';
import { studyNodes, studyEdges } from './regulatory.js';
import { reviewNodes } from './studyReview.js';
import { buildRoutes } from './detailed.js';

export const revision = 'ed81238dd9d7316f50f0da648de05d8470f0836c';
export const pipeline = 'https://github.com/Raminyazdani/capture-workflow';
export const atlasRepository = 'https://github.com/Raminyazdani/capture-workflow-atlas';
const sourceUrl = path => pipeline + '/blob/' + revision + '/' + path;
export function stageSource(n) {
  return n.externalSource || (n.source ? sourceUrl(n.source) : null);
}

function summary(id, title, subtitle, kind, inputs, actions, settings, outputs, source, jump) {
  return {id, title, subtitle, kind, inputs, actions, parameters: settings.map(([name,value]) => ({name,value})), outputs, source, jump};
}
const manifest = summary('manifest','Study manifest','JSON configuration','input',
  ['A study manifest with datasets, capture IDs and paths to the input files.', 'A preset for the requested analysis route.'],
  ['Resolve the files and settings for each input, capture and cohort.', 'The Python runner creates a Nextflow task graph. Each task receives its resolved parameters and dependencies.'],
  [['Analysis target','Select RNA clusters, independent ATAC or paired WNN.'],['Overrides','Preset values are resolved with per-dataset, cohort, capture, input and run settings where they apply.'],['Reproducibility','The run records the seed, effective settings, input hashes and task trace.']],
  ['A resolved plan and an explicit set of tasks for the selected analysis.'], 'docs/configuration.md');

const overviewNodes = [
  manifest,
  summary('ov-rna','RNA counts','Gene expression','input',['10x HDF5, Matrix Market or a Seurat object with raw RNA counts.'],['Read raw expression counts and retain the original features and barcodes.'],[['Identity','Assign capture-aware nucleus IDs.']],['Capture-level RNA count objects.'],'config/presets/scientific_rna.json',['rna','rna_load']),
  summary('ov-peaks','Paired peak counts','RNA counts + shared peaks','input',['An RNA object and a peak-count matrix for each capture.'],['Run the RNA QC, modeling and clustering stages to obtain the RNA checkpoint.','Use ATAC counts measured in the same genomic regions across captures.'],[['Peak coordinates','Identical shared peak universe across the input matrices.']],['RNA and accessibility inputs ready for exact matching.'],'config/presets/scientific_paired.json',['paired','shared_peak_counts']),
  summary('ov-frag','Multiome fragments','RNA, fragments and reference','input',['10x multiome HDF5, a sorted BGZF fragment file, reference FASTA and matching annotation.'],['Run the RNA capture and cohort stages to obtain a partition for review.','Verify reference coordinates and align fragment barcodes with the capture.'],[['Reference','Audited assembly, genome contigs and annotation.']],['An RNA partition, indexed fragments, verified barcodes and a common QC peak set.'],'docs/FRAGMENTS.md',['fragments','fr-input']),
  summary('ov-rna-qc','QC and RNA model','Filter, normalize and reduce','qc',['Per-capture RNA count objects.'],['Assess feature counts and complexity, score likely doublets, then apply the configured filters.','Merge retained cells and calculate variable features, scaling and principal components.'],[['Filtering','The thresholds follow the capture configuration.'],['Model','The number of PCs and variable features is configurable.']],['A modeled RNA cohort for graph construction.'],'config/presets/scientific_rna.json',['rna','rna_qc']),
  summary('ov-align','Align modalities','Match capture and barcode','integration',['The modeled RNA cohort and per-capture ATAC counts.'],['Match cells by capture and original barcode, then put accessibility columns in RNA order.'],[['Identity checks','Reject ambiguous capture labels, duplicate barcodes and incompatible sets.']],['A matched cohort suitable for ATAC and WNN analysis.'],'config/presets/scientific_paired.json',['paired','paired_align']),
  summary('ov-review','Review and recount','QC gates and joint selection','review',['RNA partition, per-capture fragment QC, reference and cohort membership.'],['Review RNA labels and fragment thresholds. Select nuclei by the agreed doublet policy, then recount shared regions.'],[['Reviewed limits','Unique fragments, peak count, TSS enrichment, nucleosome signal and FRiP.'],['Doublet policy','RNA, AND or OR.']],['A reviewed matched population and a shared-region matrix.'],'docs/FRAGMENTS.md',['fragments','fr-qc-review']),
  summary('ov-rna-out','RNA clusters','Expression-based groups','output',['RNA principal components and a cell-neighbor graph.'],['Cluster nuclei at the selected resolution and save the RNA checkpoint.'],[['Resolution','The synthetic examples compare 0.4 and 0.6.']],['An analyzed Seurat object, cluster assignments and execution records.'],'examples/science/rna04.json',['rna','rna_cluster']),
  summary('ov-wnn-out','ATAC and WNN clusters','Two analysis endpoints','output',['Shared ATAC counts aligned to the same RNA cells.'],['Fit an independent ATAC representation. In the WNN branch, use RNA and ATAC neighborhoods to build joint clusters.'],[['Modalities','RNA PCA and ATAC LSI.']],['Separate ATAC and WNN checkpoints plus the retained RNA result.'],'docs/validation.md',['paired','paired_wnn']),
  summary('ov-refit-out','Reviewed paired fit','Refit RNA and accessibility','output',['Selected nuclei, RNA counts and recounted regions.'],['Refit RNA features and PCA in the selected cells, compute ATAC LSI, then build a weighted-neighbor graph.'],[['Release evidence','Fragment import and the selected-cell refit were exercised separately. The full reviewed fragment path has no end-to-end release test.']],['A paired WNN result on the reviewed population.'],'docs/FRAGMENTS.md',['fragments','fr-wnn']),
];
const overviewEdges = [
  ['manifest','ov-rna'], ['manifest','ov-peaks'], ['manifest','ov-frag'],
  ['ov-rna','ov-rna-qc'], ['ov-peaks','ov-align'], ['ov-frag','ov-review'],
  ['ov-rna-qc','ov-rna-out'], ['ov-align','ov-wnn-out'], ['ov-review','ov-refit-out'],
];
const rnaNodes = countNodes.filter(n=>n.routes.includes('rna'));
const ids = new Set(rnaNodes.map(n=>n.id));
const rnaEdges = countEdges.filter(([a,b])=>ids.has(a)&&ids.has(b));
// The fragment template inherits the RNA preset values. The smaller
// dimensions in the counted-input examples are specific to those examples.
const fragmentRnaOverrides = {
  rna_load: {
    inputs: ['One 10x multiome HDF5 per capture containing Gene Expression and Peaks. This RNA reader selects the Gene Expression rows.'],
  },
  rna_filter: {
    parameters: [
      {name: 'min_umi / min_features', value: '500 UMIs / 200 detected genes in the fragment preset'},
      {name: 'lower_mads / sensitivity_mads', value: '3 for the primary cutoff, 4 for sensitivity'},
      {name: 'require_singlet', value: 'true by default'},
    ],
  },
  rna_pca: {
    parameters: [
      {name: 'npcs', value: '50 requested for the RNA reference in the fragment preset'},
      {name: 'top_loadings', value: '15 per principal component'},
      {name: 'seed.use', value: '42'},
    ],
  },
  rna_neighbors: {
    parameters: [
      {name: 'dimensions', value: 'RNA PCs 1–30'},
      {name: 'k.param', value: '20 neighbors'},
      {name: 'prune.SNN', value: '1/15'},
    ],
  },
  rna_cluster: {
    actions: ['Run Louvain community detection at the configured review resolutions. Save the selected partition as RNA_cluster.', 'Pass the exact RNA partition to the cluster-label review. The accepted labels are carried into the later fit of the selected RNA and ATAC cells.'],
    parameters: [
      {name: 'resolution', value: '0.4 by default'},
      {name: 'review_resolutions', value: '0.2, 0.4, 0.6'},
      {name: 'algorithm / random.seed', value: '1 (Louvain) / 42'},
    ],
    source: 'config/presets/scientific_fragments.json',
  },
};
const fragmentRnaNodes = rnaNodes.map(n => ({
  ...n, ...fragmentRnaOverrides[n.id], routes: ['fragments'],
}));

export const routes = buildRoutes([
  {id:'overview', label:'Overview', title:'Workflow overview', description:'Three supported input routes and their analysis endpoints.', entry:'manifest', nodes:overviewNodes, edges:overviewEdges},
  {id:'rna', label:'RNA-seq', title:'RNA-seq from counts to clusters', description:'From raw counts through capture-level QC to an RNA clustering checkpoint.', entry:'rna_load', nodes:rnaNodes, edges:rnaEdges},
  {id:'paired', label:'RNA + ATAC-seq peaks', title:'RNA-seq and ATAC-seq from shared peaks', description:'RNA modeling and shared peaks meet at barcode alignment, then branch into ATAC and WNN.', entry:'rna_load', nodes:countNodes, edges:countEdges},
  {id:'fragments', label:'ATAC-seq fragments', title:'ATAC-seq from fragments to paired WNN', description:'Parallel RNA and fragment preparation join at QC, human review and paired refitting.', entry:'fr-input', nodes:[...fragmentNodes,...fragmentRnaNodes], edges:[
    ...fragmentEdges,...rnaEdges,['fr-input','rna_load'],['rna_capture_assemble','fr-prepare'],['rna_filter','fr-qc'],['rna_cluster','fr-rna-review']]},
  {id:'study', label:'Regulatory study', title:'Regulatory study extension', description:'The study’s downstream research methods. The public pipeline’s tested endpoints are the clustering stages.', entry:'study-start', nodes:[studyNodes[0],...reviewNodes,...studyNodes.slice(1)], edges:[
    ...studyEdges,['study-start','study-annotation'],['study-start','study-sensitivity'],['study-start','study-coordinates'],
    ...['study-activity','study-links','study-motifs','study-consensus','study-scores'].map(target=>['study-annotation',target]),
    ['study-coordinates','study-links'],
  ]},
]);
export const byRoute = Object.fromEntries(routes.map(r=>[r.id,r]));
export function kindGroup(kind) {
  if (['input','reference'].includes(kind)) return 'input';
  if (['qc','review','gate'].includes(kind)) return 'review';
  if (['output','checkpoint','result'].includes(kind)) return 'output';
  if (['integration','model'].includes(kind)) return 'integration';
  return 'process';
}
export const kindLabels = {input:'Input',review:'Quality & review',output:'Output',integration:'Model & integration',process:'Processing'};

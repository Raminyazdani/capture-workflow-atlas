// Historical study methods. These references document the methods used in
// the study. The original paired partitions and review tables are study data.
const wnn = 'https://satijalab.org/seurat/articles/weighted_nearest_neighbor_analysis';
const ari = 'https://mclust-org.github.io/mclust/reference/adjustedRandIndex.html';
const links = 'https://stuartlab.org/signac/reference/linkpeaks';

function review(id, title, subtitle, inputs, actions, parameters, outputs, externalSource) {
  return {id, title, subtitle, kind: 'review', inputs, actions,
    parameters: Object.entries(parameters).map(([name, value]) => ({name, value})), outputs, externalSource};
}

function step(key, title, summary, input, action, parameters, output, externalSource, after) {
  return {key, title, summary, inputs: [input], actions: [action],
    parameters: Object.entries(parameters).map(([name, value]) => ({name, value})),
    outputs: [output], externalSource, ...(after ? {after} : {})};
}

export const reviewNodes = [
  review('study-annotation', 'Review WNN cell classes', 'Interpret the joint clusters using RNA-seq markers in each capture.',
    ['Primary WNN cluster assignments, matched RNA-seq expression, marker panels and capture IDs.'],
    ['Compare marker expression in each joint cluster, then check the evidence within each capture. Record a broad class where several markers support it. Keep uncertain identities unresolved.'],
    {'Grouping': 'WNN cluster and capture', 'Label resolution': 'Broad cell class'},
    ['A reviewed cell-class label per nucleus for the targeted and network analyses.'], wnn),
  review('study-sensitivity', 'Test clustering sensitivity', 'Compare changes in LSI dimensions and doublet selection with the primary analysis.',
    ['Primary ATAC-seq and WNN partitions, alternative LSI settings, RNA and ATAC doublet calls, and capture-aware nucleus IDs.'],
    ['In fixed-cell scenarios, vary the settings for the independent ATAC or WNN graph. Separately, change which doublet calls exclude a nucleus. Compare each partition with its corresponding baseline on shared nuclei.'],
    {'Comparison measures': 'Membership size, cluster count and adjusted Rand index (ARI)'},
    ['A study scenario table showing how membership and cluster agreement respond to each change.'], ari),
  review('study-coordinates', 'Compare gene start definitions', 'Check how the gene annotation sets the peak search window.',
    ['Selected transcript and whole-gene coordinates on the ATAC-seq reference assembly, target genes and shared peak intervals.'],
    ['Derive a strand-aware start from each gene definition. Repeat the same nearby-peak search for both start sites and identify peaks whose eligibility changes.'],
    {'Coordinate definitions': 'Selected transcript and whole gene', 'Search setting': 'The same maximum peak distance for both definitions'},
    ['Two sets of candidate peak–gene pairs annotated with their genomic search origin.'], links),
];

export const reviewSteps = {
  'study-annotation': [
    step('join', 'Group nuclei by WNN cluster', 'Recover the RNA-seq profile corresponding to each joint assignment.',
      'Per-nucleus WNN cluster ID, RNA-seq expression and capture identity.',
      'Match by capture-aware nucleus ID. Group RNA profiles by the primary WNN assignment and retain capture identity for the review.',
      {'Grouping key': 'WNN cluster'}, 'RNA profiles aligned to the joint clusters.', wnn),
    step('markers', 'Inspect RNA-seq marker panels', 'Use multiple genes to assess the identity of each cluster.',
      'Clustered RNA profiles and broad cell-class marker panels.',
      'Review concordant expression of several markers per class, including markers of glutamatergic and GABAergic neurons. Evaluate the pattern within each capture.',
      {'Resolution': 'Broad neuronal and non-neuronal classes', 'Evidence': 'Multiple markers and capture-level support'},
      'A marker-based assessment for each WNN cluster.', wnn),
    step('assign', 'Record reviewed broad labels', 'Carry the reviewed biological interpretation to each nucleus.',
      'WNN cluster membership and marker assessments by capture.',
      'Attach the supported broad label to the nuclei in each reviewed group. Assign unresolved identity where the evidence is insufficient. Keep the WNN cluster ID alongside the label.',
      {'Ambiguous identity': 'Retain as unresolved'}, 'An aligned nucleus-to-cluster and broad-class table.', wnn),
  ],
  'study-sensitivity': [
    step('baseline', 'Identify the baseline partitions', 'Keep independent ATAC-seq and paired WNN comparisons separate.',
      'Independent fragment-derived ATAC-seq LSI coordinates, reviewed depth effects and primary paired WNN assignments.',
      'The study excluded the depth-associated first LSI component, found neighbors in the independent ATAC representation and clustered those nuclei. Save that partition and the primary WNN partition with their own nucleus IDs for subsequent comparisons.',
      {'Reference population': 'Independent ATAC nuclei or primary paired nuclei'}, 'Two baseline partitions with explicit nucleus IDs.', ari),
    step('fixed', 'Vary LSI settings on fixed nuclei', 'Measure the change associated with a different component range.',
      'An unchanged nucleus set, ATAC LSI coordinates, and paired RNA PCs for WNN scenarios.',
      'Change the accessibility components included in neighbor finding. Rebuild the corresponding independent ATAC or joint WNN partition, keeping the nucleus IDs fixed within each comparison.',
      {'Scenario factor': 'ATAC-seq LSI component range'}, 'Alternative partitions with the same nucleus IDs as their baseline.', wnn, ['baseline']),
    step('membership', 'Vary doublet exclusion policy', 'Track changes caused by admitting or removing nuclei.',
      'Paired quality-gate results and per-nucleus RNA and ATAC doublet calls.',
      'Compare exclusion when both assays call a doublet with exclusion when either assay calls a doublet. Re-evaluate the paired cohort and its clustering for each policy. Record the change in cohort size.',
      {'Policy contrast': 'Both calls versus either call'}, 'A membership list and paired partition for each doublet policy.', wnn, ['baseline']),
    step('agreement', 'Calculate shared-nucleus agreement', 'Compare which pairs of nuclei remain clustered together.',
      'An alternative and its matching primary partition with capture-aware nucleus IDs.',
      'Intersect the two nucleus lists and align their cluster labels by ID. Calculate the adjusted Rand index on that intersection. Read the shared population size, cohort sizes and cluster counts alongside the score.',
      {'ARI interpretation': '1 means identical partitions up to renaming. Chance agreement has expected ARI 0.'},
      'A stability summary that reports agreement and the population used to measure it.', ari, ['fixed', 'membership']),
  ],
  'study-coordinates': [
    step('models', 'Match gene models to target IDs', 'Use comparable annotations for each focused gene.',
      'Target gene IDs, selected transcript coordinates and whole-gene intervals with strand.',
      'Resolve the same target under both definitions on the ATAC reference assembly. Keep the contig, interval and strand associated with each definition.',
      {'Coordinate unit': 'Genomic base pairs on the shared reference'}, 'Two identified models per assessable target.', links),
    step('starts', 'Locate strand-aware start sites', 'Set a search origin for each annotation choice.',
      'Matched transcript and whole-gene models with genomic strand.',
      'Use the low-coordinate end on the positive strand and the high-coordinate end on the negative strand. Retain both origins even when their coordinates coincide.',
      {'Model contrast': 'Selected-transcript start versus whole-gene start'}, 'Two labeled transcription start site coordinates for each eligible target.', links),
    step('window', 'Compare eligible nearby peaks', 'Identify boundary changes before interpreting the association scores.',
      'The two start sites, shared ATAC-seq peak intervals and a common maximum search distance.',
      'Apply the same search distance around each origin. Record peaks shared by both searches and those eligible under only one definition. Compare the corresponding link results downstream.',
      {'Fixed across searches': 'Peak universe and maximum distance'}, 'Model-specific candidate sets with any boundary-sensitive peaks identified.', links),
  ],
};

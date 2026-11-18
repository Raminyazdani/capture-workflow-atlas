import {rnaSteps} from './rnaSteps.js';
import {fragmentSteps} from './fragmentSteps.js';
import {engineNodes, studySteps} from './contextSteps.js';
import {reviewSteps} from './studyReview.js';

const operations = {...rnaSteps, ...fragmentSteps, ...studySteps, ...reviewSteps};
const assayNames = {
  rna_load: 'Read RNA-seq counts',
  rna_qc: 'Measure RNA-seq quality',
  rna_filter: 'Apply RNA-seq retention gates',
  rna_cluster: 'Cluster RNA-seq profiles',
  shared_peak_counts: 'Read shared ATAC-seq peak counts',
  atac_independent: 'Cluster ATAC-seq profiles',
  'fr-input': 'Read RNA-seq and ATAC-seq inputs',
  'fr-qc': 'Measure ATAC-seq quality',
  'fr-qc-review': 'Review ATAC-seq cutoffs',
};

function enrich(stage) {
  const title = assayNames[stage.id] || stage.title;
  const steps = (stage.walkthrough || operations[stage.id] || []).map((step,index) => ({
    ...step,
    id: stage.id + '~' + step.key,
    ownerId: stage.id, ownerTitle: title, stepIndex: index,
    subtitle: step.summary || step.subtitle,
    kind: step.kind || stage.kind, scope: step.scope || stage.scope,
    inputs: step.inputs || [], actions: step.actions || [], outputs: step.outputs || [],
    parameters: step.parameters || [], source: step.source || stage.source,
    externalSource: step.externalSource || (!step.source ? stage.externalSource : undefined),
  }));
  return {...stage, title, steps};
}

function engineGroup(id,title,subtitle,members) {
  const first=members[0], last=members.at(-1);
  return {...first,id,title,subtitle,kind:id==='en-manifest'?'input':'output',
    inputs:first.inputs,outputs:last.outputs,
    actions:id==='en-manifest'
      ? ['The JSON manifest selects a target and the captures to analyze. The runner resolves input files, validates their contracts and prepares Nextflow tasks.',
         'RNA-seq starts with a count matrix. ATAC-seq starts with aligned fragment records or previously counted peaks. FASTQ alignment and upstream cell calling precede these inputs.']
      : ['The runner checks task artifacts, publishes the selected outputs and records what executed or was reused. Each chosen endpoint can be collected independently.'],
    walkthrough:members.map(n=>({...n,key:n.id,summary:n.subtitle}))};
}

function indexRoute(route) {
  const nodes = route.nodes.map(enrich);
  const items = nodes.flatMap(n => [n,...n.steps]);
  const lookup = new Map(items.map(n => [n.id,n]));
  if (lookup.size !== items.length || !lookup.has(route.entry) ||
      route.edges.some(([a,b])=>!lookup.has(a)||!lookup.has(b))) {
    throw new Error('Invalid graph in '+route.id);
  }
  return {...route,nodes,items,lookup,operationCount:items.length-nodes.length};
}

function combineEdges(edges) {
  return [...new Map(edges.map(e => [e[0]+'|'+e[1], e])).values()];
}

export function buildRoutes(maps) {
  const [overview,rna,paired,fragment,study] = maps;
  const afterRun = engineNodes.findIndex(n=>n.id==='en-artifact');
  const setup = engineGroup('en-manifest','Start the Nextflow run','Study JSON, input files and target',engineNodes.slice(0,afterRun));
  const publish = engineGroup('en-artifact','Verify and publish outputs','Artifacts, traces and run receipt',engineNodes.slice(afterRun));
  const fullCountNodes=paired.nodes.map(n=>n.id==='rna_load'?{...n,
    inputs:[...n.inputs,'Fragment route: select the RNA expression rows in the paired 10x multiome HDF5.'],
    outputs:[...n.outputs,'The paired routes also require ATAC-seq peak counts or corresponding fragment data.']}:n);
  const fullNodes = [setup,...fullCountNodes,...fragment.nodes.filter(n=>n.id.startsWith('fr-')),...study.nodes,publish];
  const choices = [
    ['en-manifest','rna_load','RNA-seq input route'],
    ['en-manifest','shared_peak_counts','Precounted ATAC-seq input'],
    ['en-manifest','fr-input','Fragment-backed multiome input'],
    ...['rna_cluster','atac_independent','paired_wnn','fr-frip','fr-qc','fr-wnn'].map(id=>[id,'en-artifact','Selected release endpoint']),
    ['fr-wnn','study-start','Study handoff with the paired data, original fragments and annotation'],
    ['fr-shared','study-sensitivity','Study handoff with the independent ATAC-seq representation'],
  ];
  const all = {id:'full',label:'Full map',title:'End-to-end workflow',entry:'en-manifest',
    description:'Follow one input route. Solid lines show stage dependencies. Dashed lines mark route choices, output collection or the study handoff.',
    nodes:fullNodes,edges:combineEdges([...paired.edges,...fragment.edges,...study.edges,...choices])};
  return [all,overview,rna,paired,fragment,study].map(indexRoute);
}

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, CheckCheck, ChevronLeft, ChevronRight, Database, Dna, FileCode2, FileJson, FlaskConical, GitBranch, Layers3, ListTree, Map as MapIcon, MousePointer2, Network, PanelRight, Search, Settings2, ShieldCheck, SlidersHorizontal, Workflow, X} from 'lucide-react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import FlowCanvas from './FlowCanvas.jsx';
import QcExample from './QcExample.jsx';
import {atlasRepository, byRoute, kindGroup, kindLabels, pipeline, revision, routes, stageSource} from './data/atlas.js';
import './site.css';

const routeIcon={full:MapIcon,overview:Workflow, rna:Activity, paired:Layers3, fragments:Dna, study:Network};
const kindIcon={input:Database,process:Settings2,review:ShieldCheck,output:Layers3,integration:Network};
const openAttributes={target:'_blank',rel:'noreferrer'};
const hashFor=(r,id)=>'#'+encodeURIComponent(r)+'/'+encodeURIComponent(id);
function readLocation(){
  const [routeId,stageId]=window.location.hash.slice(1).split('/');
  const route=byRoute[routeId]||routes[0];
  return {routeId:route.id,stageId:route.lookup.has(stageId)?stageId:route.entry};
}
function Modal({children,onClose,label,className=''}) {
  const ref=useRef(null);
  useEffect(()=>{
    const dialog=ref.current;
    dialog.showModal();
    dialog.querySelector('[data-initial-focus]')?.focus();
    return ()=>dialog.close();
  },[]);
  return <dialog className={'modal '+className} ref={ref} aria-label={label}
    onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}>
    <div className="modal-inner">{children}</div>
  </dialog>;
}
function Kind({kind,scope}) {
  const k=kindGroup(kind);
  return <div className="pills"><span className={'kind '+k}><i/>{kindLabels[k]}</span>{scope&&<span className="scope">{scope} scope</span>}</div>;
}
function DetailList({title,icon:Icon,items}) {
  if(!items?.length)return null;
  return <section className="detail-section"><h4><Icon size={15}/>{title}</h4><ul>{items.map((s,i)=><li key={i}>{s}</li>)}</ul></section>;
}
function Inspector({route,stage,onPick,onGo,onClose}) {
  const [tab,setTab]=useState('details');
  const scroll=useRef(null);
  useEffect(()=>{setTab('details');if(scroll.current)scroll.current.scrollTop=0;},[route.id,stage.id]);
  const k=kindGroup(stage.kind);
  const Icon=stage.id==='manifest'?FileJson:kindIcon[k];
  const source=stageSource(stage);
  const owner=stage.ownerId?route.lookup.get(stage.ownerId):stage;
  const siblings=owner.steps;
  const previous=stage.ownerId?siblings[stage.stepIndex-1]:null;
  const following=stage.ownerId?siblings[stage.stepIndex+1]:null;
  const connections=(out)=>route.edges.filter(e=>e[out?0:1]===owner.id).map(e=>({...route.lookup.get(e[out?1:0]),via:e[2]}));
  const incoming=connections(false),next=connections(true);
  const groupLinks=(title,arr)=>arr.length>0&&<section className="detail-section"><h4><GitBranch size={15}/>{title}</h4>{arr.map(n=><button className="linked-stage" key={n.id} onClick={()=>onPick(n.id)}><i className={'dot '+kindGroup(n.kind)}/><span>{n.title}{n.via&&<small>{n.via}</small>}</span><ChevronRight size={14}/></button>)}</section>;
  const upstreamOperations=stage.after?.map(key=>siblings.find(s=>s.key===key)).filter(Boolean)||[];
  return <aside className="inspector" aria-label="Stage inspector">
    <div className="panel-heading"><span><PanelRight size={16}/>Stage inspector</span>{onClose&&<button className="icon-btn" aria-label="Close stage details" onClick={onClose}><X size={18}/></button>}</div>
    <div className="inspector-lead">{stage.ownerId?<button className="parent-link" onClick={()=>onPick(owner.id)}><ChevronLeft size={13}/>{owner.title}</button>:<div className={'inspector-identity '+k}><Icon size={22}/></div>}<Kind kind={stage.kind} scope={stage.scope}/><h3>{stage.title}</h3><p>{stage.subtitle}</p></div>
    <div className="detail-tabs" aria-label="Inspector sections">{[['details','Details'],['settings','Settings'],['links','Connections']].map(([v,name])=><button key={v} aria-pressed={tab===v} onClick={()=>{setTab(v);scroll.current?.scrollTo(0,0);}}>{name}</button>)}</div>
    <div className="inspector-scroll" ref={scroll}>
      {tab==='details'&&<><QcExample key={stage.id} stage={stage}/>
       <DetailList title="Inputs" icon={ArrowDownToLine} items={stage.inputs}/><DetailList title="What happens" icon={Workflow} items={stage.actions}/>
       {stage.id==='en-manifest'&&groupLinks('Choose an input path',next)}
       {!stage.ownerId&&siblings.length>0&&<section className="detail-section"><h4><ListTree size={15}/>Operations in this stage</h4><div className="step-directory">{siblings.map((n,i)=><button key={n.id} onClick={()=>onPick(n.id)}><small>{String(i+1).padStart(2,'0')}</small><span>{n.title}</span><ChevronRight size={13}/></button>)}</div></section>}
       {stage.ownerId&&stage.parameters.length>0&&<section className="detail-section"><h4><SlidersHorizontal size={15}/>Values and rules</h4><dl className="params">{stage.parameters.map(({name,value},i)=><div key={i}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></section>}
       <DetailList title="Outputs" icon={CheckCheck} items={stage.outputs}/>
       {stage.stages?.length>0&&<section className="detail-section"><h4><FileCode2 size={15}/>Native stages</h4><div className="code-chips">{stage.stages.map(s=><code key={s}>{s}</code>)}</div></section>}</>}
      {tab==='settings'&&<section className="detail-section"><h4><SlidersHorizontal size={15}/>{stage.ownerId?'Operation settings':'Stage parameters'}</h4>{!stage.parameters.length&&<p className="edge-note">This operation uses the inputs and rules listed under Details.</p>}<dl className="params">{stage.parameters.map(({name,value},i)=><div key={i}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></section>}
      {tab==='links'&&<>{stage.ownerId&&<p className="edge-note">Part of <b>{owner.title}</b>. The stage connections below show where its data come from and where the result goes.</p>}{groupLinks('Earlier operations used here',upstreamOperations)}{incoming.length===0&&<p className="edge-note">This is a starting point for this map.</p>}{groupLinks('Stage receives from',incoming)}{groupLinks('Stage feeds into',next)}{!next.length&&<p className="edge-note">This stage is an endpoint on this map.</p>}</>}
      {stage.jump&&<button className="drill" onClick={()=>onGo(...stage.jump)}>Explore stage in detail<ArrowRight size={15}/></button>}
    </div>
    {stage.ownerId&&<div className="step-pager" aria-label="Operation reading order"><button disabled={!previous} onClick={()=>onPick(previous.id)} aria-label="Previous operation"><ChevronLeft size={16}/>Previous</button><span>{stage.stepIndex+1} / {siblings.length}</span><button disabled={!following} onClick={()=>onPick(following.id)} aria-label="Next operation">Next<ChevronRight size={16}/></button></div>}
    {source&&<a className="source-row" href={source} {...openAttributes}><BookOpen size={14}/>{stage.externalSource?'Method documentation':'View pinned source'}<ArrowUpRight size={15}/></a>}
  </aside>;
}
function Index({initialRoute,initialSearch,onClose,onGo}) {
  const [filter,setFilter]=useState(initialRoute);
  const [query,setQuery]=useState(initialSearch||'');
  const low=query.trim().toLowerCase();
  const records=routes.filter(r=>filter==='all'||r.id===filter).map(route=>{
    const nodes=(low?route.items:route.nodes).filter(n=>!low||[n.id,n.title,n.subtitle,n.ownerTitle,...(n.stages||[]),
      ...n.parameters.flatMap(p=>[p.name,p.value]),...n.inputs,...n.actions,...n.outputs].join(' ').toLowerCase().includes(low));
    if(low) nodes.sort((a,b)=>Number(b.title.toLowerCase().includes(low))-Number(a.title.toLowerCase().includes(low)));
    return {route,nodes};
  }).filter(r=>r.nodes.length);
  return <Modal label="Stage index" className="index-modal" onClose={onClose}>
    <div className="modal-head"><div><div className="overline">WORKSPACE</div><h2>Stage index</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close stage index"><X/></button></div>
    <div className="query-row"><Search size={18}/><input data-initial-focus placeholder="Find a stage, operation or QC metric…" aria-label="Find a stage or parameter" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Filter route" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All maps</option>{routes.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
    <div className="index-results">{records.map(({route,nodes})=><section key={route.id}><h3>{route.title}<small>{nodes.length}</small></h3>{nodes.map(n=><button key={n.id} onClick={()=>{onGo(route.id,n.id);onClose();}}><i className={'dot '+kindGroup(n.kind)}/><span>{n.title}<small>{n.ownerTitle?n.ownerTitle+' · ':''}{n.subtitle}</small></span><ChevronRight size={16}/></button>)}</section>)}{!records.length&&<p className="no-results">No matches. Try FRiP, mitochondrial, median or TF-IDF.</p>}</div>
  </Modal>;
}
const jumps = [
  ['en-manifest','Start'],['rna_qc','RNA-seq QC'],['fr-qc','ATAC-seq QC'],
  ['atac_independent','ATAC-seq clusters'],['fr-wnn','WNN'],['study-consensus','SCENIC+'],['en-artifact','Run outputs'],
];
function App(){
  const [loc,setLoc]=useState(readLocation);
  const [index,setIndex]=useState(null);
  const [mobileInfo,setMobileInfo]=useState(false);
  const [focus,setFocus]=useState(()=>window.location.hash?{id:loc.stageId,serial:1}:null);
  const [about,setAbout]=useState(false);
  const [showOperations,setShowOperations]=useState(true);
  const route=byRoute[loc.routeId],stage=route.lookup.get(loc.stageId)||route.nodes[0];
  const go=useCallback((r,id,focusNode=true)=>{
    const target=byRoute[r]?.lookup.get(id); if(!target)return;
    if(target.ownerId)setShowOperations(true);
    const hash=hashFor(r,id);
    if(window.location.hash!==hash)history.pushState(null,'',hash);
    setLoc({routeId:r,stageId:id});
    if(focusNode)setFocus(v=>({id,serial:(v?.serial||0)+1}));
    else setFocus(null);
  },[]);
  useEffect(()=>{
    const locate=()=>{const v=readLocation();setLoc(v);if(byRoute[v.routeId].lookup.get(v.stageId)?.ownerId)setShowOperations(true);setFocus(f=>({id:v.stageId,serial:(f?.serial||0)+1}));};
    const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setAbout(false);setMobileInfo(false);setIndex('all');}};
    window.addEventListener('hashchange',locate); window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('hashchange',locate);window.removeEventListener('keydown',key);};
  },[]);
  useEffect(()=>{
    const mq=matchMedia('(max-width: 870px)');const resized=()=>{if(!mq.matches)setMobileInfo(false);};
    mq.addEventListener('change',resized);return()=>mq.removeEventListener('change',resized);
  },[]);
  function openSelection(id){
    go(route.id,id,false);
    if(matchMedia('(max-width: 870px)').matches)setMobileInfo(true);
  }
  function inspectRoute(r,id){setMobileInfo(false);go(r,id);}
  function jumpIndex(r,id){go(r,id);if(matchMedia('(max-width: 870px)').matches)setMobileInfo(true);}
  const inspectorProps={route,stage,onPick:id=>go(route.id,id),onGo:inspectRoute};
  const expanded=showOperations && route.operationCount>0;
  function selectDensity(value){
    if(!value && stage.ownerId)go(route.id,stage.ownerId);
    else setFocus(f=>({id:stage.id,serial:(f?.serial||0)+1}));
    setShowOperations(value);
  }
  return <>
    <header className="masthead"><div className="mast-inner">
      <a href={hashFor('full','en-manifest')} className="brand" onClick={e=>{e.preventDefault();go('full','en-manifest',false);}}><img src="/atlas.svg" alt=""/><span>Capture <b>Atlas</b></span></a>
      <nav className="primary-nav" aria-label="Workspace"><button className="active" onClick={()=>{go('full','en-manifest',false);setIndex(null);}}>Explorer</button><button onClick={()=>setIndex('all')}>Stage index</button></nav>
      <div className="mast-right"><button className="about-link" onClick={()=>setAbout(true)}><BookOpen size={15}/>Guide</button><a className="repo-link" href={pipeline} {...openAttributes}><GitBranch size={15}/>GitHub<ArrowUpRight size={13}/></a></div>
    </div></header>
    <main className="shell"><section className="hero"><div><div className="project-label"><span className="project-line"/> CAPTURE WORKFLOW</div><h1>RNA-seq &amp; ATAC-seq workflow<span>.</span></h1><p>Follow expression counts and chromatin fragments through quality control, joint clustering and regulatory analysis.</p></div>
      <a className="revision" href={pipeline+'/tree/'+revision} {...openAttributes}><span className="revision-icon"><GitBranch size={19}/></span><span><small>Pipeline revision</small><code>main <i>/</i> ed81238</code></span><ArrowUpRight size={14}/></a></section>
    <div className="map-navigation"><div className="route-tabs" aria-label="Choose a workflow map">{routes.map(r=>{const Icon=routeIcon[r.id];return <button key={r.id} aria-pressed={r.id===route.id} onClick={()=>{setMobileInfo(false);go(r.id,r.entry,false);}}><Icon size={16}/>{r.label}</button>;})}</div>
      <button className="search-trigger" onClick={()=>setIndex('all')}><Search size={16}/><span>Find stage</span><kbd>Ctrl K</kbd></button></div>
    <div className="workspace"><section className="map-panel" aria-label="Interactive dependency map"><div className="panel-heading map-heading"><span><Workflow size={17}/>{route.title}</span><small>{route.nodes.length} stages{route.operationCount>0&&<> <b>·</b> {route.operationCount} operations</>}</small><button className="mobile-info" aria-label="Inspect selected stage" onClick={()=>setMobileInfo(true)}><PanelRight size={17}/></button></div>
      {route.operationCount>0&&<div className="graph-toolbar"><div className="density" aria-label="Level of detail"><button aria-pressed={!expanded} onClick={()=>selectDensity(false)}>Stages</button><button aria-pressed={expanded} onClick={()=>selectDensity(true)}>All operations</button></div>
        <label className="jump-select">Go to stage<select aria-label="Go to stage" value={stage.ownerId||stage.id} onChange={e=>go(route.id,e.target.value)}>{route.nodes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label></div>}
      {route.id==='full'&&<nav className="phase-jumps" aria-label="Jump to analysis phase">{jumps.map(([id,name])=><button key={id} onClick={()=>go('full',id)} aria-pressed={(stage.ownerId||stage.id)===id}>{name}</button>)}<a className="export-map" href="/full-workflow.svg" download="Capture-Atlas-Full-Map.svg" title="Download the complete vector map"><ArrowDownToLine size={13}/>Save map</a></nav>}
      {route.id==='study'&&<div className="method-note"><FlaskConical size={15}/>{route.description}</div>}
      <div className="canvas-box"><FlowCanvas routeId={route.id} expanded={expanded} nodes={route.nodes} edges={route.edges} selectedId={stage.id} onSelect={openSelection} focusRequest={focus}/></div>
      <div className="map-legend"><div>{[['input','Input'],['process','Process'],['review','QC / review'],['integration','Integration'],['output','Output']].map(([v,s])=><span key={v}><i className={'dot '+v}/>{s}</span>)}{route.id==='full'&&<span className="dash-sample">Route choice / handoff</span>}</div><button onClick={()=>setAbout(true)} aria-label="Map controls and guide"><MousePointer2 size={14}/>Map controls</button></div></section>
      <div className="desktop-inspector"><Inspector {...inspectorProps}/></div></div>
    <footer><span><span className="live-dot"/>Capture Workflow <b>·</b> MIT license</span><a href={atlasRepository} {...openAttributes}>Atlas source<ArrowUpRight size={12}/></a></footer>
    </main>
    {index&&<Index initialRoute={index} onClose={()=>setIndex(null)} onGo={jumpIndex}/>}
    {mobileInfo&&<Modal className="mobile-sheet" label="Selected stage" onClose={()=>setMobileInfo(false)}><Inspector {...inspectorProps} onClose={()=>setMobileInfo(false)}/></Modal>}
    {about&&<Modal className="guide" label="Explorer guide" onClose={()=>setAbout(false)}><div className="modal-head"><h2>Explorer guide</h2><button className="icon-btn" onClick={()=>setAbout(false)} aria-label="Close guide"><X/></button></div>
      <p>The full map joins the Nextflow run, RNA-seq, ATAC-seq, WNN and the study’s regulatory methods. Solid arrows connect stages. Dashed arrows identify input alternatives, optional endpoints and the handoff to study-specific analyses. A run follows its selected preset.</p>
      <p>In All operations, select a numbered item to inspect the calculation, parameters, inputs, outputs and source. The numbers guide reading within a stage. Independent QC measurements can share the same input. Stage view keeps the connections visible at a smaller scale.</p>
      <dl className="guide-list"><div><dt>Move through a map</dt><dd>Drag empty space to pan. Scroll or pinch to zoom. Use Fit to see the complete graph.</dd></div><div><dt>Rearrange stages</dt><dd>Drag a card. Your arrangement is saved in this browser for that map. Reset layout restores its starting positions.</dd></div><div><dt>Follow dependencies</dt><dd>Open Connections in the stage inspector. Select an incoming or outgoing stage to focus it on the canvas.</dd></div><div><dt>Keyboard access</dt><dd>Open the stage index with Ctrl K or ⌘ K. Use Tab and Enter to choose a stage or control. Escape closes a dialog.</dd></div></dl><a href={pipeline+'/tree/'+revision} {...openAttributes}>Read the pinned workflow source <ArrowUpRight size={14}/></a></Modal>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);

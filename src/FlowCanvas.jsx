import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Handle, MarkerType, MiniMap, Position, ReactFlow } from '@xyflow/react';
import { Graph, layout } from '@dagrejs/dagre';
import {
  Activity, Boxes, ChartNoAxesColumn, CheckCheck, ChevronRight, CircleDot, Combine, Database,
  Dna, FileCog, FileInput, FileJson, Filter, Fingerprint, Focus, GitBranch,
  GripHorizontal, Layers, ListChecks, Minus, Plus, RotateCcw, ScanLine,
  Settings2, ShieldCheck, SlidersHorizontal, Table2, Workflow,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './map.css';

const WIDTH = 232;
const HEIGHT = 100;
const OPEN_WIDTH = 304;
const GROUP_HEAD = 94;
const ROW_HEIGHT = 40;
const GROUP_PAD = 6;
const MIN_ZOOM = 0.005;
const MAX_ZOOM = 1.9;
const STORAGE = 'capture-atlas.node-positions.v1.';
const overviewRows = [
  ['manifest'],
  ['ov-rna', 'ov-peaks', 'ov-frag'],
  ['ov-rna-qc', 'ov-align', 'ov-review'],
  ['ov-rna-out', 'ov-wnn-out', 'ov-refit-out'],
];
const families = {
  input: { label: 'Input', color: '#2e7b71', fill: '#d1ebe2', icon: FileInput },
  reference: { label: 'Reference', color: '#2e7b71', fill: '#d1ebe2', icon: Database },
  process: { label: 'Processing', color: '#4a6595', fill: '#dbe4f7', icon: SlidersHorizontal },
  integration: { label: 'Integration', color: '#7058a3', fill: '#e7dcf3', icon: Combine },
  qc: { label: 'Quality control', color: '#9a702e', fill: '#f6e7c9', icon: ScanLine },
  review: { label: 'Review', color: '#9a702e', fill: '#f6e7c9', icon: ListChecks },
  output: { label: 'Output', color: '#8b5c83', fill: '#eedce9', icon: Boxes },
  config: { label: 'Configuration', color: '#2e7b71', fill: '#d1ebe2', icon: FileJson },
};
const icons = {
  activity: Activity, boxes: Boxes, chart: ChartNoAxesColumn, checkcheck: CheckCheck,
  circledot: CircleDot, combine: Combine, database: Database, dna: Dna, filecog: FileCog,
  fileinput: FileInput, filejson: FileJson, filter: Filter, fingerprint: Fingerprint,
  gitbranch: GitBranch, layers: Layers, listchecks: ListChecks, scanline: ScanLine,
  settings2: Settings2, shieldcheck: ShieldCheck, slidershorizontal: SlidersHorizontal,
  table2: Table2, workflow: Workflow,
};
const overviewIcons = {
  manifest: FileJson, 'ov-rna': Dna, 'ov-peaks': Table2, 'ov-frag': Layers,
  'ov-rna-qc': Activity, 'ov-align': Fingerprint, 'ov-review': ListChecks,
  'ov-rna-out': CircleDot, 'ov-wnn-out': GitBranch, 'ov-refit-out': Boxes,
};

function familyFor(stage) {
  if (stage.id === 'manifest') return families.config;
  return families[stage.kind] ?? families.process;
}

function storedPositions(route) {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE + route));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, p]) =>
      p && Number.isFinite(p.x) && Number.isFinite(p.y)));
  } catch {
    return {};
  }
}

function savePositions(route, positions) {
  try {
    if (Object.keys(positions).length) localStorage.setItem(STORAGE + route, JSON.stringify(positions));
    else localStorage.removeItem(STORAGE + route);
  } catch {
    // The diagram also works when browser storage is unavailable.
  }
}

function stageDimensions(stage, expanded) {
  const rows = expanded ? stage.steps?.length || 0 : 0;
  return { width: expanded ? OPEN_WIDTH : WIDTH, height: rows ? GROUP_HEAD + GROUP_PAD * 2 + rows * ROW_HEIGHT + 2 : HEIGHT };
}

function defaultPositions(routeId, stages, links, dimensions, horizontal) {
  if (routeId === 'overview' && stages.every(stage => overviewRows.flat().includes(stage.id))) {
    return Object.fromEntries(overviewRows.flatMap((row, rowIndex) =>
      row.map((id, col) => [id, { x: ((3 - row.length) / 2 + col) * 286, y: rowIndex * 138 }])));
  }
  const graph = new Graph();
  graph.setGraph({ rankdir: horizontal ? 'LR' : 'TB', nodesep: 45, ranksep: horizontal ? 100 : 66, marginx: 12, marginy: 12 });
  graph.setDefaultEdgeLabel(() => ({}));
  stages.forEach(stage => graph.setNode(stage.id, { ...dimensions.get(stage.id) }));
  links.forEach(([a, b]) => {
    if (graph.hasNode(a) && graph.hasNode(b)) graph.setEdge(a, b);
  });
  layout(graph);
  const positions = Object.fromEntries(stages.map(({ id }) => {
    const point = graph.node(id);
    const { width, height } = dimensions.get(id);
    return [id, { x: point.x - width / 2, y: point.y - height / 2 }];
  }));
  // Dagre places file inputs next to their eventual consumer, which can be
  // many stages away. Keep the early intake choices visible at the entrance.
  if (horizontal && ['en-manifest', 'fr-input', 'shared_peak_counts', 'rna_load'].every(id => positions[id])) {
    const mid = positions.rna_load.y + dimensions.get('rna_load').height / 2;
    const inputX = positions['en-manifest'].x + dimensions.get('en-manifest').width + 100;
    positions['en-manifest'].y = mid - dimensions.get('en-manifest').height / 2;
    positions['fr-input'] = {x:inputX, y:mid - 24 - dimensions.get('fr-input').height};
    positions.shared_peak_counts = {x:inputX, y:mid + 24};
  }
  return positions;
}

const StageCard = memo(function StageCard({ data, selected }) {
  const { stage, incoming, outgoing, horizontal, expanded, selectedStep, select } = data;
  const rows = expanded ? stage.steps || [] : [];
  const open = rows.length > 0;
  const family = familyFor(stage);
  const Icon = icons[String(stage.icon || '').toLowerCase().replace(/[^a-z0-9]/g, '')]
    ?? overviewIcons[stage.id] ?? family.icon;
  return (
    <div className={'atlas-stage' + (selected ? ' atlas-stage--active' : '') + (open ? ' atlas-stage--group' : '')}
      style={{ '--stage-color': family.color, '--stage-tint': family.fill }}>
      {incoming && <Handle type="target" position={horizontal ? Position.Left : Position.Top} isConnectable={false} />}
      <div className="atlas-stage__heading">
        <div className="atlas-stage__meta">
          <span className="atlas-stage__icon"><Icon size={16} strokeWidth={1.75} /></span>
          <span>{family.label}</span>
          <GripHorizontal className="atlas-stage__grip" size={15} strokeWidth={1.6} />
        </div>
        {open ? <button type="button" className="atlas-stage__name atlas-stage__title-button nodrag nopan"
          title={stage.title} onKeyDown={event => event.stopPropagation()}
          onClick={event => {event.stopPropagation();select(stage.id);}}>
          {stage.title}
        </button> : <div className="atlas-stage__name" title={stage.title}>{stage.title}</div>}
        <div className="atlas-stage__description">{stage.subtitle}</div>
      </div>
      {open && <div className="atlas-stage__operations" role="group" aria-label={stage.title + ' operations'}>
        {rows.map((step, index) => <button type="button" key={step.id}
          className={'atlas-step nodrag nopan' + (step.id === selectedStep ? ' atlas-step--selected' : '')}
          aria-pressed={step.id === selectedStep} data-operation={step.id}
          title={step.title + (step.subtitle ? ' — ' + step.subtitle : '')}
          onKeyDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); select(step.id); }}>
          <span className="atlas-step__index" aria-hidden="true">{index + 1}</span>
          <span className="atlas-step__title">{step.title}</span>
          <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8}/>
        </button>)}
      </div>}
      {outgoing && <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} isConnectable={false} />}
    </div>
  );
});
const nodeTypes = { stage: StageCard };
const arrow = { type: MarkerType.ArrowClosed, width: 12, height: 12 };

function CanvasForRoute({ routeId, nodes: stages, edges: links, selectedId, onSelect, focusRequest, expanded=false }) {
  const host = useRef(null);
  const [instance, setInstance] = useState(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const horizontal = routeId === 'full';
  const storageKey = expanded ? routeId + '.operations' : routeId;
  const dimensions = useMemo(() => new Map(stages.map(s => [s.id, stageDimensions(s, expanded)])), [stages, expanded]);
  const owners = useMemo(() => new Map(stages.flatMap(stage =>
    (stage.steps || []).map((step, index) => [step.id, { id: stage.id, index }]))), [stages]);
  const selectedParent = owners.get(selectedId)?.id ?? selectedId;
  const defaults = useMemo(() => defaultPositions(routeId, stages, links, dimensions, horizontal), [routeId, stages, links, dimensions, horizontal]);
  const [positions, setPositions] = useState(() => storedPositions(storageKey));
  const positionsRef = useRef(positions);
  const changedView = useRef(false);
  const lastFocus = useRef(null);
  const layoutTimer = useRef(null);
  const incoming = useMemo(() => new Set(links.map(([, b]) => b)), [links]);
  const outgoing = useMemo(() => new Set(links.map(([a]) => a)), [links]);

  const selectRef = useRef(onSelect);
  useLayoutEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  const select = useCallback(id => selectRef.current(id), []);
  const graphNodes = useMemo(() => stages.map(stage => {
    const bounds = dimensions.get(stage.id);
    const current = stage.id === selectedParent;
    return {
      id: stage.id, type: 'stage', position: positions[stage.id] ?? defaults[stage.id],
      selected: current, initialWidth: bounds.width, initialHeight: bounds.height,
      measured: bounds, style: bounds,
      data: { stage, incoming: incoming.has(stage.id), outgoing: outgoing.has(stage.id), horizontal, expanded,
        selectedStep: current ? selectedId : null, select },
      ariaRole: expanded && stage.steps?.length ? 'group' : 'button',
      ariaLabel: stage.title + ', ' + familyFor(stage).label,
    };
  }), [stages, positions, defaults, dimensions, selectedId, selectedParent, incoming, outgoing, expanded, horizontal, select]);

  const graphEdges = useMemo(() => links.map(([source, target, relation]) => {
    const active = source === selectedParent || target === selectedParent;
    const label = typeof relation === 'string' ? relation : (relation?.label || relation?.kind || '');
    const handoff = /study|handoff|research/i.test(label);
    const conditional = Boolean(label) && !handoff;
    const color = handoff ? '#9171aa' : conditional ? '#a18551' : active ? '#64877d' : '#9badb1';
    return {
      id: source + '::' + target, source, target, type: 'smoothstep',
      pathOptions: { borderRadius: 9 }, style: { stroke: color, strokeWidth: active ? 1.95 : 1.5,
        strokeDasharray: handoff ? '7 4' : conditional ? '3 4' : undefined },
      ariaLabel: label ? source + ' to ' + target + ', ' + label : source + ' to ' + target,
      domAttributes: label ? {'data-relation':label} : undefined,
      selectable: false, focusable: false, markerEnd: { ...arrow, color },
    };
  }), [links, selectedParent]);

  useLayoutEffect(() => {
    const update = () => {
      const { width, height } = host.current.getBoundingClientRect();
      setBox(old => old.width === width && old.height === height ? old : { width, height });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(host.current);
    return () => obs.disconnect();
  }, []);

  function anchor(id) {
    return positionsRef.current[id] ?? defaults[id];
  }

  function showAll(duration = 0) {
    if (!stages.length || !instance || !box.width || !box.height) return;
    const coords = stages.map(stage => ({...anchor(stage.id), ...dimensions.get(stage.id)}));
    const x0 = Math.min(...coords.map(p => p.x));
    const x1 = Math.max(...coords.map(p => p.x + p.width));
    const y0 = Math.min(...coords.map(p => p.y));
    const y1 = Math.max(...coords.map(p => p.y + p.height));
    const side = box.width < 520 ? 12 : 26;
    const top = 23;
    const bottom = box.width > 660 ? 100 : box.width > 465 ? 76 : 58;
    const scale = Math.max(MIN_ZOOM, Math.min(1.15, (box.width - side * 2) / (x1 - x0),
      (box.height - top - bottom) / (y1 - y0)));
    void instance.setViewport({
      x: (box.width - scale * (x1 - x0)) / 2 - x0 * scale,
      y: top + (box.height - top - bottom - scale * (y1 - y0)) / 2 - y0 * scale, zoom: scale,
    }, { duration });
  }

  function showEntry(duration = 0) {
    if (!instance || !box.width || !box.height) return;
    if (routeId === 'overview' && box.width >= 545) {
      showAll(duration);
      return;
    }
    const first = (horizontal ? stages.find(stage => stage.id === 'en-manifest') : null)
      ?? stages.find(stage => !incoming.has(stage.id)) ?? stages[0];
    if (!first) return;
    const p = anchor(first.id);
    const size = dimensions.get(first.id);
    const wide = horizontal && box.width > 580;
    if (wide && !Object.keys(positionsRef.current).length) {
      const entryIds = [first.id, 'fr-input', 'shared_peak_counts'].filter(id => dimensions.has(id));
      const nodes = entryIds.map(id => ({ ...anchor(id), ...dimensions.get(id) }));
      const x0 = Math.min(...nodes.map(n => n.x));
      const y0 = Math.min(...nodes.map(n => n.y));
      const w = Math.max(...nodes.map(n => n.x+n.width)) - x0;
      const h = Math.max(...nodes.map(n => n.y+n.height)) - y0;
      const z = Math.max(.75, Math.min(1.07, (box.width-56)/w, (box.height-68)/h));
      void instance.setViewport({ x:32-x0*z, y:18-y0*z, zoom:z }, {duration});
      return;
    }
    const scale = box.width < 470 ? 0.93 : 1;
    const x = wide ? 32 - p.x * scale : box.width / 2 - (p.x + size.width / 2) * scale;
    const y = horizontal ? 18 : Math.min(45, box.height * .075);
    void instance.setViewport({ x, y: y - p.y * scale, zoom: scale }, { duration });
  }

  useLayoutEffect(() => {
    if (!changedView.current) showEntry();
  }, [instance, box.width, box.height, defaults]);

  useEffect(() => {
    if (!instance || !box.width || !box.height || !focusRequest?.id) return;
    const op = owners.get(focusRequest.id);
    const stageId = op?.id ?? focusRequest.id;
    const target = anchor(stageId);
    if (!target) return;
    const requestKey = focusRequest.id + ':' + focusRequest.serial;
    if (lastFocus.current === requestKey) return;
    lastFocus.current = requestKey;
    changedView.current = true;
    const size = dimensions.get(stageId);
    if (horizontal && stageId === 'en-manifest' && !op) {
      showEntry(230);
      return;
    }
    if (expanded && !op) {
      const scale = Math.max(.78, Math.min(1.10, (box.height - 55) / size.height, (box.width-28) / size.width));
      void instance.setViewport({x:(box.width-size.width*scale)/2-target.x*scale, y:16-target.y*scale, zoom:scale}, {duration:230});
      return;
    }
    const scale = Math.min(1.3, Math.max(box.width > 530 ? 1.06 : .98, instance.getZoom()));
    const pointY = expanded && op ? 1 + GROUP_HEAD + GROUP_PAD + (op.index + 0.5) * ROW_HEIGHT : size.height / 2;
    void instance.setCenter(target.x + size.width / 2, target.y + pointY, { zoom: scale, duration: 230 });
  }, [focusRequest, instance, box.width, box.height, defaults, owners, dimensions, expanded]);

  useEffect(() => () => window.clearTimeout(layoutTimer.current), []);

  const handleChanges = useCallback(changes => {
    const moves = changes.getByType('position').filter(change => change.position);
    if (!moves.length) return;
    const next = { ...positionsRef.current };
    moves.forEach(change => { next[change.id] = change.position; });
    positionsRef.current = next;
    setPositions(next);
    changedView.current = true;
    if (moves.some(change => !change.dragging)) savePositions(storageKey, next);
  }, [storageKey]);

  function restore() {
    window.clearTimeout(layoutTimer.current);
    positionsRef.current = {};
    setPositions({});
    savePositions(storageKey, {});
    changedView.current = false;
    layoutTimer.current = window.setTimeout(() => showEntry(180), 0);
  }

  function selectWithKeyboard(event) {
    const element = event.target.closest('.react-flow__node');
    if (!element || !['Enter', ' '].includes(event.key)) return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(element.dataset.id);
  }

  return (
    <div className="atlas-canvas" ref={host} onKeyDownCapture={selectWithKeyboard}
      role="region" aria-label="Interactive workflow map">
      <ReactFlow nodes={graphNodes} edges={graphEdges} nodeTypes={nodeTypes}
        minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} onInit={setInstance}
        onNodesChange={handleChanges} onNodeClick={(_event, node) => onSelect(node.id)}
        onNodeDragStop={() => savePositions(storageKey, positionsRef.current)}
        onMoveStart={event => { if (event) changedView.current = true; }}
        onMove={(_event, viewport) => setZoom(viewport.zoom)}
        deleteKeyCode={null} multiSelectionKeyCode={null} selectionKeyCode={null}
        selectNodesOnDrag={false} nodesConnectable={false} edgesFocusable={false}
        nodeDragThreshold={4} zoomOnDoubleClick={false} zoomOnPinch panOnDrag
        attributionPosition="bottom-right">
        <Background variant={BackgroundVariant.Dots} color="#b7c5be" gap={18} size={1} />
        <MiniMap pannable zoomable ariaLabel="Workflow minimap" className="atlas-minimap"
          nodeColor={node => familyFor(node.data.stage).fill}
          nodeStrokeColor={node => node.selected ? familyFor(node.data.stage).color : '#b8c5c2'}
          nodeStrokeWidth={3} nodeBorderRadius={8} maskColor="rgba(223,232,227,0.58)"
          maskStrokeColor="#9aaea3" maskStrokeWidth={1.3} />
      </ReactFlow>
      <div className="atlas-canvas__tools" role="toolbar" aria-label="Map view controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= MIN_ZOOM + .005}
          onClick={() => { changedView.current = true; void instance?.zoomOut({ duration: 140 }); }}><Minus size={16} /></button>
        <output aria-label="Zoom level">{zoom < .02 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%</output>
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= MAX_ZOOM - .005}
          onClick={() => { changedView.current = true; void instance?.zoomIn({ duration: 140 }); }}><Plus size={16} /></button>
        <span className="atlas-canvas__separator" />
        <button type="button" aria-label="Fit entire route" title="Fit entire route"
          onClick={() => { changedView.current = true; showAll(200); }}><Focus size={17} /></button>
        <button type="button" aria-label="Reset node positions" title="Reset node positions" onClick={restore}><RotateCcw size={15} /></button>
      </div>
    </div>
  );
}

export default function FlowCanvas(props) {
  return <CanvasForRoute key={props.routeId + (props.expanded ? ':operations' : ':stages')} {...props} />;
}

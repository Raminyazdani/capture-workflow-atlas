import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Handle, MarkerType, MiniMap, Position, ReactFlow } from '@xyflow/react';
import { Graph, layout } from '@dagrejs/dagre';
import {
  Activity, Boxes, ChartNoAxesColumn, CheckCheck, CircleDot, Combine, Database,
  Dna, FileCog, FileInput, FileJson, Filter, Fingerprint, Focus, GitBranch,
  GripHorizontal, Layers, ListChecks, Minus, Plus, RotateCcw, ScanLine,
  Settings2, ShieldCheck, SlidersHorizontal, Table2, Workflow,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './map.css';

const WIDTH = 232;
const HEIGHT = 100;
const MIN_ZOOM = 0.07;
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

function defaultPositions(routeId, stages, links) {
  if (routeId === 'overview' && stages.every(stage => overviewRows.flat().includes(stage.id))) {
    return Object.fromEntries(overviewRows.flatMap((row, rowIndex) =>
      row.map((id, col) => [id, { x: ((3 - row.length) / 2 + col) * 286, y: rowIndex * 138 }])));
  }
  const graph = new Graph();
  graph.setGraph({ rankdir: 'TB', nodesep: 45, ranksep: 66, marginx: 12, marginy: 12 });
  graph.setDefaultEdgeLabel(() => ({}));
  stages.forEach(stage => graph.setNode(stage.id, { width: WIDTH, height: HEIGHT }));
  links.forEach(([a, b]) => {
    if (graph.hasNode(a) && graph.hasNode(b)) graph.setEdge(a, b);
  });
  layout(graph);
  return Object.fromEntries(stages.map(({ id }) => {
    const point = graph.node(id);
    return [id, { x: point.x - WIDTH / 2, y: point.y - HEIGHT / 2 }];
  }));
}

const StageCard = memo(function StageCard({ data, selected }) {
  const { stage, incoming, outgoing } = data;
  const family = familyFor(stage);
  const Icon = icons[String(stage.icon || '').toLowerCase().replace(/[^a-z0-9]/g, '')]
    ?? overviewIcons[stage.id] ?? family.icon;
  return (
    <div className={'atlas-stage' + (selected ? ' atlas-stage--active' : '')}
      style={{ '--stage-color': family.color, '--stage-tint': family.fill }}>
      {incoming && <Handle type="target" position={Position.Top} isConnectable={false} />}
      <div className="atlas-stage__meta">
        <span className="atlas-stage__icon"><Icon size={16} strokeWidth={1.75} /></span>
        <span>{family.label}</span>
        <GripHorizontal className="atlas-stage__grip" size={15} strokeWidth={1.6} />
      </div>
      <div className="atlas-stage__name">{stage.title}</div>
      <div className="atlas-stage__description">{stage.subtitle}</div>
      {outgoing && <Handle type="source" position={Position.Bottom} isConnectable={false} />}
    </div>
  );
});
const nodeTypes = { stage: StageCard };
const arrow = { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9badb1' };
const activeArrow = { ...arrow, color: '#64877d' };

function CanvasForRoute({ routeId, nodes: stages, edges: links, selectedId, onSelect, focusRequest }) {
  const host = useRef(null);
  const [instance, setInstance] = useState(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const defaults = useMemo(() => defaultPositions(routeId, stages, links), [routeId, stages, links]);
  const [positions, setPositions] = useState(() => storedPositions(routeId));
  const positionsRef = useRef(positions);
  const changedView = useRef(false);
  const lastFocus = useRef(null);
  const layoutTimer = useRef(null);
  const incoming = useMemo(() => new Set(links.map(([, b]) => b)), [links]);
  const outgoing = useMemo(() => new Set(links.map(([a]) => a)), [links]);

  const graphNodes = useMemo(() => stages.map(stage => ({
    id: stage.id, type: 'stage', position: positions[stage.id] ?? defaults[stage.id],
    selected: stage.id === selectedId, initialWidth: WIDTH, initialHeight: HEIGHT,
    style: { width: WIDTH, height: HEIGHT },
    data: { stage, incoming: incoming.has(stage.id), outgoing: outgoing.has(stage.id) },
    ariaRole: 'button', ariaLabel: stage.title + ', ' + familyFor(stage).label,
  })), [stages, positions, defaults, selectedId, incoming, outgoing]);

  const graphEdges = useMemo(() => links.map(([source, target]) => {
    const active = source === selectedId || target === selectedId;
    return {
      id: source + '::' + target, source, target, type: 'smoothstep',
      pathOptions: { borderRadius: 9 }, className: active ? 'atlas-edge--active' : '',
      selectable: false, focusable: false, markerEnd: active ? activeArrow : arrow,
    };
  }), [links, selectedId]);

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
    const coords = stages.map(stage => anchor(stage.id));
    const x0 = Math.min(...coords.map(p => p.x));
    const x1 = Math.max(...coords.map(p => p.x + WIDTH));
    const y0 = Math.min(...coords.map(p => p.y));
    const y1 = Math.max(...coords.map(p => p.y + HEIGHT));
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
    const first = stages.find(stage => !incoming.has(stage.id)) ?? stages[0];
    if (!first) return;
    const p = anchor(first.id);
    const scale = box.width < 470 ? 0.93 : 1;
    void instance.setViewport({ x: box.width / 2 - (p.x + WIDTH / 2) * scale,
      y: Math.min(45, box.height * .075) - p.y * scale, zoom: scale }, { duration });
  }

  useLayoutEffect(() => {
    if (!changedView.current) showEntry();
  }, [instance, box.width, box.height, defaults]);

  useEffect(() => {
    if (!instance || !box.width || !box.height || !focusRequest?.id) return;
    const target = anchor(focusRequest.id);
    if (!target) return;
    const requestKey = focusRequest.id + ':' + focusRequest.serial;
    if (lastFocus.current === requestKey) return;
    lastFocus.current = requestKey;
    changedView.current = true;
    const scale = Math.min(1.3, Math.max(box.width > 530 ? 1.06 : .98, instance.getZoom()));
    void instance.setCenter(target.x + WIDTH / 2, target.y + HEIGHT / 2, { zoom: scale, duration: 260 });
  }, [focusRequest, instance, box.width, box.height, defaults]);

  useEffect(() => () => window.clearTimeout(layoutTimer.current), []);

  const handleChanges = useCallback(changes => {
    const moves = changes.getByType('position').filter(change => change.position);
    if (!moves.length) return;
    const next = { ...positionsRef.current };
    moves.forEach(change => { next[change.id] = change.position; });
    positionsRef.current = next;
    setPositions(next);
    changedView.current = true;
    if (moves.some(change => !change.dragging)) savePositions(routeId, next);
  }, [routeId]);

  function restore() {
    window.clearTimeout(layoutTimer.current);
    positionsRef.current = {};
    setPositions({});
    savePositions(routeId, {});
    changedView.current = false;
    layoutTimer.current = window.setTimeout(() => showEntry(180), 0);
  }

  function selectWithKeyboard(event) {
    const element = event.target.closest('.react-flow__node');
    if (!element || !['Enter', ' '].includes(event.key)) return;
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
        onNodeDragStop={() => savePositions(routeId, positionsRef.current)}
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
        <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
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
  return <CanvasForRoute key={props.routeId} {...props} />;
}

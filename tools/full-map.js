import {Graph,layout} from '@dagrejs/dagre';
import {byRoute,kindGroup,kindLabels} from '../src/data/atlas.js';

const home='https://capture-workflow-atlas.vercel.app/';
const palette={input:'#19756d',process:'#416497',review:'#915f22',integration:'#6651a0',output:'#865378'};
const escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const width=380;

function wrap(text,limit){
  const lines=[];
  for(const word of text.split(/\s+/)){
    const last=lines.length-1;
    if(last<0||lines[last].length+word.length+1>limit)lines.push(word);
    else lines[last]+=' '+word;
  }
  return lines;
}
function writeLines(lines,x,y,size,color,bold=false){
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${bold?650:400}">`+
    lines.map((line,i)=>`<tspan x="${x}" dy="${i?size*1.4:0}">${escape(line)}</tspan>`).join('')+'</text>';
}
function renderGroup(n){
  const tint=palette[kindGroup(n.kind)];
  const body=[];
  const link=id=>home+'#full/'+encodeURIComponent(id);
  let y=26;
  body.push(writeLines([kindLabels[kindGroup(n.kind)].toUpperCase()],17,y,11,tint,true));
  const title=wrap(n.title,33);
  body.push(`<a href="${link(n.id)}">${writeLines(title,17,y+30,19,'#233847',true)}</a>`);
  y+=39+Math.max(0,title.length-1)*27;
  const sub=wrap(n.subtitle,49);
  body.push(writeLines(sub,17,y+12,13,'#586778'));
  y+=sub.length*18+15;
  n.steps.forEach((s,i)=>{
    const opTitle=wrap(s.title,43),description=wrap(s.subtitle,53);
    const row=18+opTitle.length*20+description.length*17;
    const detail=[s.subtitle,...s.inputs,...s.actions,...s.parameters.map(p=>p.name+' — '+p.value),...s.outputs].join('\n');
    body.push(`<a href="${link(s.id)}"><title>${escape(detail)}</title><rect x="1" y="${y}" width="${width-2}" height="${row}" fill="${i%2?'#fff':'#f5f8f8'}"/>`+
      writeLines([String(i+1).padStart(2,'0')],13,y+21,11,tint,true)+
      writeLines(opTitle,43,y+21,14,'#243846',true)+
      writeLines(description,43,y+22+opTitle.length*20,12,'#526373')+'</a>');
    y+=row;
  });
  const height=Math.ceil(y+8);
  return {width,height,markup:`<rect width="${width}" height="${height}" rx="10" fill="white" stroke="${tint}" stroke-width="1.7"/>${body.join('')}`};
}

export function fullMapSvg(){
  const route=byRoute.full;
  const graph=new Graph();
  graph.setGraph({rankdir:'TB',ranksep:83,nodesep:66,marginx:30,marginy:22});
  graph.setDefaultEdgeLabel(()=>({}));
  const boxes=new Map(route.nodes.map(n=>[n.id,renderGroup(n)]));
  for(const [id,b] of boxes)graph.setNode(id,{width:b.width,height:b.height});
  for(const [a,b] of route.edges)graph.setEdge(a,b);
  layout(graph);
  const {width:w,height:h}=graph.graph();
  const edges=route.edges.map(([a,b,relation])=>{
    const points=graph.edge(a,b).points.map(p=>p.x+','+p.y).join(' ');
    const isStudy=/study handoff/i.test(relation||'');
    const variant=isStudy?'study':relation?'choice':'edge';
    return `<polyline points="${points}" fill="none" stroke="${variant==='study'?'#83669a':variant==='choice'?'#9a855b':'#889a98'}" stroke-width="2"${relation?' stroke-dasharray="8 5"':''} marker-end="url(#${variant})"><title>${escape(relation||'Stage dependency')}</title></polyline>`;
  }).join('');
  const nodes=route.nodes.map(n=>{
    const p=graph.node(n.id),b=boxes.get(n.id);
    return `<g transform="translate(${p.x-b.width/2} ${p.y-b.height/2})">${b.markup}</g>`;
  }).join('');
  const markers=[['edge','#889a98'],['choice','#9a855b'],['study','#83669a']].map(([id,c])=>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${c}"/></marker>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h+144)}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h+144)}" font-family="Arial, sans-serif"><title>RNA-seq and ATAC-seq full workflow map</title><desc>Stage arrows show dependencies. Dashed arrows show route choices or research handoffs. Click any operation to open the interactive atlas.</desc><defs>${markers}</defs><rect width="100%" height="100%" fill="#f3f7f5"/><rect width="100%" height="130" fill="#fff"/>`+
    writeLines(['RNA-seq and ATAC-seq · Full workflow map'],32,45,30,'#213642',true)+
    writeLines([`${route.nodes.length} stages and ${route.operationCount} operations. Choose one input route. The study extension continues beyond the public WNN endpoint.`],34,78,16,'#465e6a')+
    writeLines(['Solid arrows connect stages. Dashed arrows mark alternatives and handoffs. Click a stage or operation for its inputs, rules and outputs.'],34,106,15,'#465e6a')+
    `<g transform="translate(0 143)">${edges}${nodes}</g></svg>`;
}

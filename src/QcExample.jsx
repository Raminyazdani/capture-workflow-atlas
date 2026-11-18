import React, {useState} from 'react';
import {Calculator} from 'lucide-react';

function Quantity({label,value,set,step=1,max}) {
  return <label>{label}<input type="number" min="0" max={max} step={step} value={value}
    onChange={e=>set(e.target.value)}/></label>;
}
function numeric(text) {
  return text.trim()==='' ? NaN : Number(text);
}
function Frip() {
  const [overlap,setOverlap]=useState('160');
  const [total,setTotal]=useState('1000');
  const [threshold,setThreshold]=useState('0.15');
  const n=numeric(overlap), d=numeric(total), cut=numeric(threshold);
  let message;
  if(!Number.isInteger(n)||!Number.isInteger(d)||n<0||d<0||!Number.isFinite(cut)||cut<0||cut>1)
    message='Enter nonnegative whole fragment counts and a cutoff between 0 and 1.';
  else if(n>d) message='Invalid counts. Overlapping fragment records cannot exceed total records.';
  else if(d===0) message='FRiP is unavailable (NA). A missing value fails the reviewed ATAC-seq quality gate.';
  else message=`${n} ÷ ${d} = ${(n/d).toFixed(4)}. ${n/d>=cut?'Passes':'Fails'} the FRiP criterion at ${cut}. Other ATAC-seq gates are evaluated separately.`;
  return <><p>For one barcode, count each fragment record once if it intersects any common peak. Change the counts or the example reviewed cutoff.</p>
    <div className="qc-fields"><Quantity label="Records in peaks" value={overlap} set={setOverlap}/><Quantity label="All fragment records" value={total} set={setTotal}/><Quantity label="Minimum FRiP" step="0.01" max="1" value={threshold} set={setThreshold}/></div>
    <output aria-live="polite">{message}</output></>;
}
function RnaCutoff() {
  const [umi,setUmi]=useState('640');
  const [floor,setFloor]=useState('500');
  const [factor,setFactor]=useState('3');
  // Illustrative summaries on the log10 scale, after dropping nonpositive depth.
  const median=3.10, mad=.10;
  const observed=numeric(umi), fixed=numeric(floor), k=numeric(factor);
  const adaptive=10**(median-k*mad);
  const nearest=Math.round(adaptive);
  const tolerance=3.552713678800501e-15;
  const snapped=Math.abs(adaptive-nearest)<=tolerance*Math.max(1,Math.abs(adaptive))?nearest:adaptive;
  const threshold=Math.max(fixed,snapped);
  let message='Enter finite, nonnegative values and a whole UMI count.';
  if(Number.isInteger(observed)&&observed>=0&&Number.isFinite(fixed)&&fixed>=0&&Number.isFinite(k)&&k>=0)
    message=`UMI floor = max(${fixed}, 10^(${median.toFixed(2)} − ${k} × ${mad.toFixed(2)})) = ${threshold.toFixed(2)}. ${observed>0&&observed>=threshold?'Passes':'Fails'} this count gate. Feature count and the singlet policy are separate checks.`;
  return <><p>Suppose one capture has a median log10 UMI count of 3.10 and a scaled MAD of 0.10. The filter takes the larger of the adaptive cutoff and the fixed minimum.</p>
    <div className="qc-fields"><Quantity label="Nucleus UMIs" value={umi} set={setUmi}/><Quantity label="Fixed minimum" value={floor} set={setFloor}/><Quantity label="MAD multiplier" step="0.1" value={factor} set={setFactor}/></div>
    <output aria-live="polite">{message}</output></>;
}
export default function QcExample({stage}) {
  const parent=stage.ownerId||stage.id;
  const frip=(parent==='fr-qc'&&(!stage.ownerId||/frip|fraction in peaks/i.test(stage.title)))||(!stage.ownerId&&parent==='fr-qc-review');
  const rna=parent==='rna_filter'&&(!stage.ownerId||/floor|threshold|cutoff|gate/i.test(stage.title));
  if(!frip&&!rna)return null;
  return <details className="qc-example"><summary><Calculator size={15}/>{frip?'Try a FRiP calculation':'Try the RNA-seq count gate'}</summary>
    {frip?<Frip/>:<RnaCutoff/>}</details>;
}

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dld = JSON.parse(fs.readFileSync(path.join(root, 'data/dld-transactions.json'), 'utf8'));
const accuracyPayload = JSON.parse(fs.readFileSync(path.join(root, 'data/accuracy-data.json'), 'utf8'));
const accuracy = Array.isArray(accuracyPayload) ? accuracyPayload : (accuracyPayload.records || accuracyPayload.data || []);
const types = ['apartment', 'villa', 'townhouse'];
const MIN_N = 5;
const PRIOR_N = 20;
const CUTOFF = '2026-07-09';
const finite = value => Number.isFinite(Number(value));
const positive = value => finite(value) && Number(value) > 0;
const text = value => String(value || '').trim();
const norm = value => text(value).toLowerCase();
const project = row => [row.masterProject, row.project].find(value => text(value)) || '';
const ppsm = row => positive(row.pricePerSqm) ? Number(row.pricePerSqm) : positive(row.actualSalePrice) && positive(row.area) ? Number(row.actualSalePrice) / Number(row.area) : null;
const dateValue = row => new Date(row.saleDate || row.instanceDate).getTime();
const dateText = row => new Date(dateValue(row)).toISOString().slice(0, 10);
const median = values => { const x = values.filter(Number.isFinite).sort((a,b)=>a-b); if (!x.length) return null; const i=Math.floor(x.length/2); return x.length%2?x[i]:(x[i-1]+x[i])/2; };
const quantile = (values, q) => { const x=values.filter(Number.isFinite).sort((a,b)=>a-b); if(!x.length)return null; const p=(x.length-1)*q,l=Math.floor(p),u=Math.ceil(p);return x[l]+(x[u]-x[l])*(p-l); };
const round = (value, d=4) => Number.isFinite(value) ? Number(value.toFixed(d)) : null;
const key = row => `${norm(row.propertyType)}||${norm(row.district)}||${norm(project(row))}`;
const districtKey = row => `${norm(row.propertyType)}||${norm(row.district)}`;

function buildGroups(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => types.includes(row.propertyType) && text(row.district) && text(project(row)) && positive(ppsm(row)))) {
    const groupKey=key(row);
    if (!groups.has(groupKey)) groups.set(groupKey,{propertyType:row.propertyType,district:row.district,project:project(row),rows:[]});
    groups.get(groupKey).rows.push(row);
  }
  return groups;
}

function buildDiagnostics() {
  const groups=buildGroups(dld.filter(row=>dateText(row)<CUTOFF));
  const peers=new Map();
  for(const row of dld.filter(row=>types.includes(row.propertyType)&&text(row.district)&&positive(ppsm(row)))){
    const k=districtKey(row); if(!peers.has(k))peers.set(k,[]); peers.get(k).push(row);
  }
  const rows=[];
  for(const [groupKey,group] of groups){
    if(group.rows.length<MIN_N)continue;
    const peerRows=(peers.get(districtKey(group.rows[0]))||[]).filter(row=>key(row)!==groupKey&&dateText(row)<CUTOFF);
    if(peerRows.length<MIN_N)continue;
    const projectPpsm=group.rows.map(ppsm), peerPpsm=peerRows.map(ppsm);
    const projectMedian=median(projectPpsm), peerMedian=median(peerPpsm);
    const relative=projectMedian/peerMedian;
    rows.push({
      propertyType:group.propertyType,district:group.district,project:group.project,transactions:group.rows.length,peerTransactions:peerRows.length,
      projectMedianPpsm:projectMedian,peerMedianPpsm:peerMedian,relativeIndex:relative,
      projectMedianArea:median(group.rows.map(row=>Number(row.area))),peerMedianArea:median(peerRows.map(row=>Number(row.area))),
      projectMedianRooms:median(group.rows.map(row=>Number(row.rooms))),peerMedianRooms:median(peerRows.map(row=>Number(row.rooms))),
      projectMedianDate:dateText({saleDate:new Date(median(group.rows.map(dateValue))).toISOString()}),peerMedianDate:dateText({saleDate:new Date(median(peerRows.map(dateValue))).toISOString()}),
      projectDispersion:quantile(projectPpsm,.75)/quantile(projectPpsm,.25),peerDispersion:quantile(peerPpsm,.75)/quantile(peerPpsm,.25),
      candidateMultiplier:Math.max(.95,Math.min(1.05,1+(relative-1)*(group.rows.length/(group.rows.length+PRIOR_N))))
    });
  }
  return rows;
}

function correlation(x,y){
  const pairs=x.map((v,i)=>[v,y[i]]).filter(pair=>pair.every(Number.isFinite)); if(pairs.length<2)return null;
  const mx=median(pairs.map(p=>p[0])), my=median(pairs.map(p=>p[1]));
  const ax=pairs.map(p=>p[0]), ay=pairs.map(p=>p[1]);
  const mean=(z)=>z.reduce((a,b)=>a+b,0)/z.length; const ux=mean(ax),uy=mean(ay);
  const num=ax.reduce((s,v,i)=>s+(v-ux)*(ay[i]-uy),0), den=Math.sqrt(ax.reduce((s,v)=>s+(v-ux)**2,0)*ay.reduce((s,v)=>s+(v-uy)**2,0));
  return den ? round(num/den,4) : null;
}

function holdoutResidualDiagnostics(candidates){
  const lookup=new Map(candidates.map(row=>[`${norm(row.propertyType)}||${norm(row.district)}||${norm(row.project)}`,row]));
  const rows=accuracy.filter(row=>types.includes(row.propertyType)&&text(row.district)&&text(project(row))&&dateText(row)>=CUTOFF&&positive(row.actualSalePrice)&&positive(row.aqarValuation)).map(row=>{
    const candidate=lookup.get(key(row));
    return candidate ? {candidateMultiplier:candidate.candidateMultiplier, relativeIndex:candidate.relativeIndex, baselineResidual:Number(row.actualSalePrice)/Number(row.aqarValuation), absBaselineError:Math.abs(Number(row.aqarValuation)-Number(row.actualSalePrice))/Number(row.actualSalePrice)} : null;
  }).filter(Boolean);
  return {matchedRows:rows.length,correlationCandidateVsActualToBaseline:correlation(rows.map(r=>Math.log(r.candidateMultiplier)),rows.map(r=>Math.log(r.baselineResidual))),correlationRelativeIndexVsActualToBaseline:correlation(rows.map(r=>Math.log(r.relativeIndex)),rows.map(r=>Math.log(r.baselineResidual))),medianActualToBaseline:median(rows.map(r=>r.baselineResidual)),medianAbsoluteBaselineError:median(rows.map(r=>r.absBaselineError)),candidateMultiplierDistribution:{p25:quantile(rows.map(r=>r.candidateMultiplier),.25),median:median(rows.map(r=>r.candidateMultiplier),),p75:quantile(rows.map(r=>r.candidateMultiplier,.75))}};
}

const diagnostics=buildDiagnostics();
const byType=Object.fromEntries(types.map(type=>{
  const rows=diagnostics.filter(row=>row.propertyType===type);
  const timeGap=rows.map(row=>Math.abs(new Date(row.projectMedianDate)-new Date(row.peerMedianDate))/86400000);
  const areaRatio=rows.map(row=>row.projectMedianArea/row.peerMedianArea);
  const roomGap=rows.map(row=>Math.abs(row.projectMedianRooms-row.peerMedianRooms));
  return [type,{cohorts:rows.length,highDispersion:rows.filter(row=>row.projectDispersion>2).length,medianAbsoluteDateGapDays:median(timeGap),p90AbsoluteDateGapDays:quantile(timeGap,.9),medianAreaRatio:median(areaRatio),p90AbsoluteRoomGap:quantile(roomGap,.9),candidateAtBounds:rows.filter(row=>row.candidateMultiplier===.95||row.candidateMultiplier===1.05).length,examples:rows.sort((a,b)=>b.relativeIndex-a.relativeIndex).slice(0,3)}];
}));
const report={generatedAt:new Date().toISOString(),cutoff:CUTOFF,trainingDldRows:dld.filter(row=>dateText(row)<CUTOFF).length,diagnosticsByType:byType,holdoutResidualDiagnostics:holdoutResidualDiagnostics(diagnostics),notes:['This diagnostic uses observed DLD and verified Accuracy values only.','Date, area, and room differences are diagnostic confounders; they are not used to invent missing BUA/Plot/Renovation values.','No official artifact or production evaluator is modified.']};
const output=process.argv[2]||path.join(root,'docs/v2.1-project-estimator-diagnostics.json'); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));

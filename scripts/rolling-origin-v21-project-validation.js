#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dld = JSON.parse(fs.readFileSync(path.join(root, 'data/dld-transactions.json'), 'utf8'));
const accuracyPayload = JSON.parse(fs.readFileSync(path.join(root, 'data/accuracy-data.json'), 'utf8'));
const accuracy = Array.isArray(accuracyPayload) ? accuracyPayload : (accuracyPayload.records || accuracyPayload.data || []);
const types = ['apartment', 'villa', 'townhouse'];
const options = { minimumProjectTransactions: 8, minimumPeerTransactions: 5, shrinkagePriorTransactions: 20, candidateMin: 0.95, candidateMax: 1.05, neutralIndexBand: 0.05, timeNormalize: true, matchSizeAndRooms: true, excludeHighDispersion: true };
const windows = [
  { id: 'origin-1', trainEndExclusive: '2026-04-01', testStart: '2026-04-28', testEndExclusive: '2026-06-01' },
  { id: 'origin-2', trainEndExclusive: '2026-05-01', testStart: '2026-05-01', testEndExclusive: '2026-06-01' },
  { id: 'origin-3', trainEndExclusive: '2026-06-01', testStart: '2026-06-01', testEndExclusive: '2026-07-01' },
  { id: 'origin-4', trainEndExclusive: '2026-07-01', testStart: '2026-07-01', testEndExclusive: '2026-07-27' }
];
const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const text = value => String(value || '').trim();
const norm = value => text(value).toLowerCase();
const projectName = row => [row.masterProject, row.project].find(present)?.toString().trim() || '';
const pricePerSqm = row => positive(row.pricePerSqm) ? Number(row.pricePerSqm) : positive(row.actualSalePrice) && positive(row.area) ? Number(row.actualSalePrice) / Number(row.area) : positive(row.actualSalePrice) && positive(row.procedureArea) ? Number(row.actualSalePrice) / Number(row.procedureArea) : null;
const dateValue = row => new Date(row.saleDate || row.instanceDate).getTime();
const dateText = row => { const value = dateValue(row); return Number.isFinite(value) ? new Date(value).toISOString().slice(0, 10) : ''; };
const median = values => { const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b); if(!sorted.length)return null; const i=Math.floor(sorted.length/2); return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2; };
const quantile = (values,q) => { const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b); if(!sorted.length)return null; const p=(sorted.length-1)*q,l=Math.floor(p),u=Math.ceil(p); return sorted[l]+(sorted[u]-sorted[l])*(p-l); };
const round = (value,d=4) => Number.isFinite(value) ? Number(value.toFixed(d)) : null;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const key = row => `${norm(row.propertyType)}||${norm(row.district)}||${norm(projectName(row))}`;
const districtKey = row => `${norm(row.propertyType)}||${norm(row.district)}`;

function buildTrendModels(rows) {
  const groups = new Map();
  for (const row of rows) { const date=dateValue(row), price=pricePerSqm(row); if(!types.includes(row.propertyType)||!text(row.district)||!Number.isFinite(date)||!positive(price))continue; const k=districtKey(row); if(!groups.has(k))groups.set(k,[]); groups.get(k).push({date,price}); }
  const models = new Map();
  for (const [k, points] of groups) { const ref=Math.max(...points.map(p=>p.date)), x=points.map(p=>(p.date-ref)/86400000), y=points.map(p=>Math.log(p.price)), mx=x.reduce((a,b)=>a+b,0)/x.length, my=y.reduce((a,b)=>a+b,0)/y.length, den=x.reduce((s,v)=>s+(v-mx)**2,0), slope=den?x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/den:0; models.set(k,{referenceDate:ref,slope:clamp(slope,-0.01,0.01)}); }
  return models;
}
function adjustedPrice(row, model) { const base=pricePerSqm(row); if(!positive(base)||!options.timeNormalize||!model||!Number.isFinite(dateValue(row)))return base; const days=(dateValue(row)-model.referenceDate)/86400000; return base*Math.exp(-model.slope*days); }
function selectPeers(projectRows, peers) {
  if(!options.matchSizeAndRooms)return peers;
  const targetArea=median(projectRows.map(r=>Number(r.area)).filter(positive)); const targetRooms=median(projectRows.map(r=>Number(r.rooms)).filter(Number.isFinite));
  const areaFilter=rows=>Number.isFinite(targetArea)?rows.filter(r=>positive(r.area)&&Number(r.area)>=targetArea*.75&&Number(r.area)<=targetArea*1.25):rows;
  const roomAndArea=areaFilter(Number.isFinite(targetRooms)?peers.filter(r=>Number(r.rooms)===targetRooms):[]);
  if(roomAndArea.length>=options.minimumPeerTransactions)return roomAndArea;
  const areaOnly=areaFilter(peers); return areaOnly.length>=options.minimumPeerTransactions?areaOnly:peers;
}
function buildCandidates(rows) {
  const valid=rows.filter(r=>types.includes(r.propertyType)&&text(r.district)&&text(projectName(r))&&positive(pricePerSqm(r))&&Number.isFinite(dateValue(r)));
  const models=buildTrendModels(rows), districts=new Map(), projects=new Map();
  for(const row of valid){const dk=districtKey(row);if(!districts.has(dk))districts.set(dk,[]);districts.get(dk).push(row);const pk=key(row);if(!projects.has(pk))projects.set(pk,{propertyType:row.propertyType,district:row.district,project:projectName(row),rows:[]});projects.get(pk).rows.push(row);}
  const out=[];
  for(const [pk,cohort] of projects){if(cohort.rows.length<options.minimumProjectTransactions)continue;const peers=selectPeers(cohort.rows,(districts.get(districtKey(cohort.rows[0]))||[]).filter(r=>key(r)!==pk));if(peers.length<options.minimumPeerTransactions)continue;const model=models.get(districtKey(cohort.rows[0])), projectValues=cohort.rows.map(r=>adjustedPrice(r,model)).filter(Number.isFinite), peerValues=peers.map(r=>adjustedPrice(r,model)).filter(Number.isFinite), pMedian=median(projectValues), peerMedian=median(peerValues), p25=quantile(projectValues,.25),p75=quantile(projectValues,.75),peerP25=quantile(peerValues,.25),peerP75=quantile(peerValues,.75), dispersion=p25>0?p75/p25:null, peerDispersion=peerP25>0?peerP75/peerP25:null, high=(Number.isFinite(dispersion)&&dispersion>2)||(Number.isFinite(peerDispersion)&&peerDispersion>2);if(!(pMedian>0&&peerMedian>0)|| (options.excludeHighDispersion&&high))continue;const relative=pMedian/peerMedian, shrinkage=cohort.rows.length/(cohort.rows.length+options.shrinkagePriorTransactions), raw=Math.abs(relative-1)<=options.neutralIndexBand?1:1+(relative-1)*shrinkage,multiplier=clamp(raw,options.candidateMin,options.candidateMax);out.push({key:pk,propertyType:cohort.propertyType,district:cohort.district,project:cohort.project,transactions:cohort.rows.length,peerTransactions:peers.length,relativeIndex:relative,multiplier,highDispersion:high});}
  return out;
}
function metrics(rows, prediction) { const valid=rows.filter(r=>positive(r.actualSalePrice)&&positive(r[prediction])); if(!valid.length)return{records:0,maePct:null,biasPct:null,p90AbsPct:null,within15Pct:null};const errors=valid.map(r=>(Number(r[prediction])-Number(r.actualSalePrice))/Number(r.actualSalePrice)*100),abs=errors.map(Math.abs);return{records:valid.length,maePct:round(abs.reduce((a,b)=>a+b,0)/abs.length,3),biasPct:round(errors.reduce((a,b)=>a+b,0)/errors.length,3),p90AbsPct:round(quantile(abs,.9),3),within15Pct:round(abs.filter(v=>v<=15).length/abs.length*100,3)}; }
function distribution(values) { return { count: values.length, min: round(Math.min(...values),4), p10: round(quantile(values,.1),4), p25: round(quantile(values,.25),4), median: round(median(values),4), p75: round(quantile(values,.75),4), p90: round(quantile(values,.9),4), max: round(Math.max(...values),4), positivePct: round(values.filter(v=>v>1.000001).length/values.length*100,3), negativePct: round(values.filter(v=>v<0.999999).length/values.length*100,3), neutralPct: round(values.filter(v=>Math.abs(v-1)<=0.000001).length/values.length*100,3) }; }
function runWindow(window) {
  const train=dld.filter(r=>dateText(r)<window.trainEndExclusive), test=accuracy.filter(r=>types.includes(r.propertyType)&&text(r.district)&&text(projectName(r))&&dateText(r)>=window.testStart&&dateText(r)<window.testEndExclusive&&positive(r.actualSalePrice)&&positive(r.aqarValuation));
  const candidates=buildCandidates(train), map=new Map(candidates.map(c=>[c.key,c]));
  const scored=test.map(r=>{const c=map.get(key(r)),base=Number(r.aqarValuation);return{...r,baselinePrediction:base,shadowPrediction:c?base*c.multiplier:base,matched:Boolean(c),multiplier:c?.multiplier||1};});
  const byType=Object.fromEntries(types.map(type=>{const rows=scored.filter(r=>r.propertyType===type),matched=rows.filter(r=>r.matched);return[type,{testRecords:rows.length,matchedRecords:matched.length,coveragePct:rows.length?round(matched.length/rows.length*100,3):0,fallbackUnchangedRecords:rows.length-matched.length,baseline:metrics(rows,'baselinePrediction'),shadow:metrics(rows,'shadowPrediction'),multiplierDistribution:distribution(candidates.filter(c=>c.propertyType===type).map(c=>c.multiplier))}]}));
  return { ...window,trainDldRecords:train.length,testAccuracyRecords:scored.length,candidateCohorts:candidates.length,candidates,byType,aggregate:{testRecords:scored.length,matchedRecords:scored.filter(r=>r.matched).length,coveragePct:scored.length?round(scored.filter(r=>r.matched).length/scored.length*100,3):0,baseline:metrics(scored,'baselinePrediction'),shadow:metrics(scored,'shadowPrediction') } };
}
function stability(windowsResults) {
  const pairwise=[];
  for(let i=1;i<windowsResults.length;i++){const previous=new Map(windowsResults[i-1].candidates.map(c=>[c.key,c])),current=windowsResults[i].candidates.filter(c=>previous.has(c.key));const changes=current.map(c=>c.multiplier-previous.get(c.key).multiplier),signStable=current.length?current.filter(c=>Math.sign(c.multiplier-1)===Math.sign(previous.get(c.key).multiplier-1)).length/current.length*100:null;pairwise.push({from:windowsResults[i-1].id,to:windowsResults[i].id,commonCohorts:current.length,medianAbsMultiplierChange:round(median(changes.map(Math.abs)),4),p90AbsMultiplierChange:round(quantile(changes.map(Math.abs),.9),4),signStabilityPct:round(signStable,3),sameMultiplierPct:round(current.length?changes.filter(v=>Math.abs(v)<=.000001).length/current.length*100:null,3)});}
  const allKeys=[...new Set(windowsResults.flatMap(w=>w.candidates.map(c=>c.key)))];
  const trajectories=allKeys.map(k=>{const values=windowsResults.map(w=>w.candidates.find(c=>c.key===k)?.multiplier).filter(Number.isFinite);return{key:k,windowsSeen:values.length,median:round(median(values),4),min:round(Math.min(...values),4),max:round(Math.max(...values),4),range:round(Math.max(...values)-Math.min(...values),4)};}).filter(r=>r.windowsSeen>=2).sort((a,b)=>b.range-a.range);
  return{pairwise,cohortsSeenAtLeast2:trajectories.length,stableWithin0_01Pct:trajectories.length?round(trajectories.filter(r=>r.range<=.01).length/trajectories.length*100,3):null,trajectoriesWithLargestRange:trajectories.slice(0,20)};
}
const results=windows.map(runWindow);
const report={generatedAt:new Date().toISOString(),scope:'isolated-v2.1-project-multiplier-rolling-origin-validation',options,windows,results:results.map(r=>({...r,candidates: r.candidates.map(c=>({...c,multiplier:round(c.multiplier)}))})),stability:stability(results),notes:['Each window trains only on DLD transactions before its trainEndExclusive and tests only on later verified Accuracy records.','The official aqarValuation is used as the baseline prediction; shadow changes are not written back to Accuracy.','The project signal is peer-relative and does not prove causality; it remains vulnerable to unobserved quality and transaction mix.','No production evaluator, calibration config, weights, fallback policy, raw DLD file, or historical result is modified.']};
const output=process.argv[2]||path.join(root,'docs/v2.1-project-multiplier-rolling-origin.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,windows:results.map(r=>({id:r.id,trainDldRecords:r.trainDldRecords,testAccuracyRecords:r.testAccuracyRecords,candidateCohorts:r.candidateCohorts,coveragePct:r.aggregate.coveragePct,baseline:r.aggregate.baseline,shadow:r.aggregate.shadow})),stability:report.stability},null,2));

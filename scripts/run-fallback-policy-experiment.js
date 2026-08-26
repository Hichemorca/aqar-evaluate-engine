const fs = require('fs');
const path = require('path');
const { applyAllFilters } = require('./cleaning-pipeline');
const { comparableKey, buildComparableGroups } = require('../shared/comparable-diagnostics');
const calibrationDefaults = require('../shared/aqar-calibration-defaults');
const calibrationEngine = require('../shared/calibration-engine');

const root = path.resolve(__dirname, '..');
const accuracy=JSON.parse(fs.readFileSync(path.join(root,'data/accuracy-data.json'),'utf8'));
const activeCalibration=JSON.parse(fs.readFileSync(path.join(root,'data/active-calibration.json'),'utf8'));
const cleaningReport=JSON.parse(fs.readFileSync(path.join(root,'data/dld-cleaning-report.json'),'utf8'));
const consultancyData=JSON.parse(fs.readFileSync(path.join(root,'data/consultancy-data.json'),'utf8'));
const rows=applyAllFilters(JSON.parse(fs.readFileSync(path.join(root,'data/dld-transactions.json'),'utf8')));
const groups=buildComparableGroups(rows);
const records=accuracy.records;

function weightedMedian(peers){
  const sorted=peers.map(r=>({price:Number(r.pricePerSqm||r.actualSalePrice/Math.max(1,Number(r.area))),date:r.saleDate})).filter(r=>Number.isFinite(r.price)).sort((a,b)=>a.price-b.price);
  if(!sorted.length)return null;
  const now=new Date(accuracy.metadata.lastUpdated);
  const weights=sorted.map(r=>{const d=new Date(r.date);const age=Number.isNaN(d.getTime())?90:(now-d)/86400000;return Math.max(.15,1-age/180);});
  const total=weights.reduce((a,b)=>a+b,0);let cum=0;
  for(let i=0;i<sorted.length;i++){cum+=weights[i];if(cum>=total/2)return sorted[i].price;}
  return sorted[sorted.length-1].price;
}
function peerRecords(record,level){const key=comparableKey(record,level);return key&&groups[level]?.[key]?groups[level][key].filter(p=>p.propertyRef!==record.propertyRef):[];}
function counts(record){return Object.fromEntries(['project_size','project','district_size','district'].map(level=>[level,peerRecords(record,level).length]));}
function currentLevel(record){return record.diagnostics?.selectedLevel||record.comparableDiagnostics?.selectedLevel||null;}
function selectFallbackLevel(record, c, policy={}){
  const minProject=record.propertyType==='retail'?2:5;
  const districtSizeMinimum=policy.districtSizeMinimum ?? 5;
  const xlarge=record.propertyType==='land' && (record.diagnostics?.sizeCategory==='land_xlarge'||record.comparableDiagnostics?.sizeCategory==='land_xlarge');
  if(c.project_size>=3)return 'project_size';
  if(c.project>=minProject)return 'project';
  if(policy.blockLandXlargeEntireFallback && xlarge)return null;
  if(c.district_size>=districtSizeMinimum){
    if(policy.blockLandXlargeDistrictSize && xlarge)return null;
    return 'district_size';
  }
  if(c.district>=5){
    if(policy.blockDistrictFallbackFor5to9 && c.district_size >= 5 && c.district_size < 10)return null;
    return 'district';
  }
  return null;
}
function chooseLevel(record, policy){return selectFallbackLevel(record, counts(record), policy);}
function getProximityMultiplier(gisScore){
  if(gisScore===null||gisScore===undefined)return 1;
  const gis=activeCalibration.gis||{};const multiplier=1+Number(gisScore)*Number(gis.proximityFactorPerScore??-0.0156);
  return Math.min(Number(gis.proximityMaximumMultiplier??1.01),Math.max(Number(gis.proximityMinimumMultiplier??0.98),multiplier));
}
function calculateViewMultiplier(viewTypes,propertyType){
  if(!Array.isArray(viewTypes)||viewTypes.length===0||viewTypes.includes('unknown')||viewTypes.includes('internal'))return 1;
  const sales=calibrationDefaults.getPropertyConfig(activeCalibration,propertyType)?.coefficients?.sales||{};const factors=sales.viewFactors||{};
  const impacts=viewTypes.map(view=>Number(factors[view]||1)).sort((a,b)=>b-a);let total=1;
  impacts.forEach((impact,index)=>{total=index===0?impact:total+(impact-1)*Number(sales.viewSecondaryFactor??0.5);});
  return Math.max(Number(sales.viewMinimumMultiplier??0.8),Math.min(Number(sales.viewMaximumMultiplier??1.25),total));
}
function combinedValue(record,candidateLevel){
  const oldLevel=currentLevel(record);if(!candidateLevel||!oldLevel||!Number(record.area))return null;
  const candidateMedian=weightedMedian(peerRecords(record,candidateLevel));if(!candidateMedian)return null;
  let valuation=Math.round(candidateMedian)*Number(record.area);
  const districtRates=consultancyData.capRates?.[record.district]||consultancyData.capRates?.default;
  if(districtRates){const typeKey=record.propertyType==='townhouse'?'villa':record.propertyType;const marketCapRate=districtRates[typeKey]||districtRates.apartment||7;valuation=Math.round(valuation*(7/marketCapRate));}
  const vacancyRates=consultancyData.vacancyRates?.[record.district]||consultancyData.vacancyRates?.default;
  if(vacancyRates){const typeKey=record.propertyType==='townhouse'?'villa':record.propertyType;const vacancyRate=vacancyRates[typeKey]||vacancyRates.apartment||10;valuation=Math.round(valuation*(1-(vacancyRate-10)/100));}
  if(Array.isArray(record.viewTypes)&&record.viewTypes.length>0)valuation=Math.round(valuation*calculateViewMultiplier(record.viewTypes,record.propertyType));
  if(record.hasGis&&record.gisScore!==null&&record.gisScore!==undefined)valuation=Math.round(valuation*getProximityMultiplier(record.gisScore));
  const propertyConfig=calibrationDefaults.getPropertyConfig(activeCalibration,record.propertyType);
  const methods=calibrationEngine.buildMethodResults({salesValue:valuation,marketValue:valuation,annualRent:record.annualRent,annualExpenses:record.annualExpenses,vacancyRatePercent:record.vacancyRatePercent,capRatePercent:record.capRatePercent,area:record.area,landValue:record.landValue,constructionCost:record.constructionCost,yearBuilt:record.yearBuilt,currentYear:2026,condition:record.condition||'good'},propertyConfig);
  const combined=calibrationEngine.combineMethodResults(methods,propertyConfig,activeCalibration.configId||'base-22.1');return combined.status==='APPLIED'?combined.value:null;
}
function metric(items){
 if(!items.length)return {count:0};
 const errors=items.map(x=>Math.abs(Number(x.error))).sort((a,b)=>a-b);const signed=items.map(x=>Number(x.error));
 return {count:items.length,coveragePct:Number((items.length/records.length*100).toFixed(2)),accuracy:Number((items.reduce((s,x)=>s+100-Math.abs(Number(x.error)),0)/items.length).toFixed(2)),avgAbsoluteError:Number((errors.reduce((a,b)=>a+b,0)/errors.length).toFixed(2)),medianAbsoluteError:Number(errors[Math.floor((errors.length-1)*.5)].toFixed(2)),p90AbsoluteError:Number(errors[Math.floor((errors.length-1)*.9)].toFixed(2)),bias:Number((signed.reduce((a,b)=>a+b,0)/signed.length).toFixed(2)),within15:Number((items.filter(x=>Math.abs(Number(x.error))<=15).length/items.length*100).toFixed(2))};
}
function by(items,key){const out={};for(const x of items){const k=x[key]||'unknown';(out[k]??=[]).push(x);}return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,metric(v)]));}
function run(policy){
 const outputs=[];const unscoredRecords=[];
 for(const record of records){const old=Number(record.aqarValuation);const oldLevel=currentLevel(record);const next=chooseLevel(record,policy);if(!next){unscoredRecords.push({propertyRef:record.propertyRef,propertyType:record.propertyType,sizeCategory:record.diagnostics?.sizeCategory||record.comparableDiagnostics?.sizeCategory||null,oldLevel});continue;}const value=combinedValue(record,next);if(value===null){unscoredRecords.push({propertyRef:record.propertyRef,propertyType:record.propertyType,sizeCategory:record.diagnostics?.sizeCategory||record.comparableDiagnostics?.sizeCategory||null,oldLevel});continue;}outputs.push({propertyRef:record.propertyRef,propertyType:record.propertyType,district:record.district,area:record.area,oldLevel,newLevel:next,oldValue:old,newValue:Math.round(value),error:Number(((value-Number(record.actualSalePrice))/Math.max(1,Number(record.actualSalePrice))*100).toFixed(2)),actualSalePrice:record.actualSalePrice,oldError:record.aqarVsActual,comparableCount:counts(record)[next]});}
 const changedRecords=outputs.filter(x=>x.newLevel!==x.oldLevel||Math.abs(x.newValue-x.oldValue)>0.5);
 const transitions={}; for(const x of changedRecords){const k=`${x.oldLevel||'unscored'}->${x.newLevel||'unscored'}`; transitions[k]=(transitions[k]||0)+1;}
 const unscoredByType={};const unscoredBySize={};for(const x of unscoredRecords){unscoredByType[x.propertyType]=(unscoredByType[x.propertyType]||0)+1;const k=x.sizeCategory||'unknown';unscoredBySize[k]=(unscoredBySize[k]||0)+1;}
 return {policy,counts:{baseline:records.length,scored:outputs.length,unscored:unscoredRecords.length,changed:changedRecords.length},unscoredByType,unscoredBySize,overall:metric(outputs),byPropertyType:by(outputs,'propertyType'),byLevel:by(outputs,'newLevel'),changed:{count:changedRecords.length,metrics:metric(changedRecords),byPropertyType:by(changedRecords,'propertyType'),transitions},changedRecords:changedRecords.sort((a,b)=>Math.abs(b.error)-Math.abs(a.error)).slice(0,50)};
}
function runExperiment(){
 return {generatedAt:new Date().toISOString(),source:{accuracyScope:accuracy.metadata.accuracyScope,calibrationConfigId:accuracy.metadata.calibrationConfigId,lastUpdated:accuracy.metadata.lastUpdated,asOf:accuracy.metadata.lastUpdated,records:records.length,dldCleaningChecksum:cleaningReport.sourceChecksum,eligibleDldRecords:cleaningReport.eligible,rejectedDldRecords:cleaningReport.rejected},scenarios:{baseline:metric(records.map(r=>({error:r.aqarVsActual}))),districtSizeMinimum10:run({districtSizeMinimum:10,blockLandXlargeDistrictSize:false}),districtSizeMinimum10AndBlockLandXlarge:run({districtSizeMinimum:10,blockLandXlargeDistrictSize:true}),districtSizeMinimum10AndStrictLandXlarge:run({districtSizeMinimum:10,blockLandXlargeDistrictSize:true,blockLandXlargeEntireFallback:true}),districtSizeMinimum10NoWideFallback:run({districtSizeMinimum:10,blockLandXlargeDistrictSize:false,blockDistrictFallbackFor5to9:true})}};
}
if(require.main===module){const outputPath=process.argv[2]||path.join('/tmp','aqar-fallback-policy-holdout.json');const result=runExperiment();fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}
module.exports={chooseLevel,selectFallbackLevel,counts,run,runExperiment};

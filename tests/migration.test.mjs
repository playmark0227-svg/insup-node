import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const code=readFileSync(new URL('../google-apps-script/Migrate.gs',import.meta.url),'utf8');
const plain=v=>JSON.parse(JSON.stringify(v));
function harness(){
  const store=new Map(), writes=[], api=[];
  const sourceId='1AnyvEoUtgUSTnuuJjIjA80XGHw_DaL9fSUoNCrYZ36s';
  const properties={title:'original',locale:'ja_JP',timeZone:'Asia/Tokyo',autoRecalc:'ON_CHANGE'};
  const source={properties,sheets:[
    {properties:{sheetId:0,title:'台帳',index:0,sheetType:'GRID',gridProperties:{rowCount:2,columnCount:3}},data:[{rowData:[{values:[{userEnteredValue:{stringValue:'候補者'}},{userEnteredValue:{formulaValue:"='集計'!A1"},userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'0'}}},{userEnteredValue:{stringValue:'=literal'}}]},{values:[{userEnteredValue:{numberValue:8},dataValidation:{condition:{type:'CUSTOM_FORMULA',values:[{userEnteredValue:"='集計'!A1>0"}]},strict:true}}]}]}],conditionalFormats:[{ranges:[{sheetId:0,startRowIndex:0,endRowIndex:1}],booleanRule:{condition:{type:'CUSTOM_FORMULA',values:[{userEnteredValue:"='集計'!A1>0"}]},format:{backgroundColor:{red:1}}}}]},
    {properties:{sheetId:7,title:'集計',index:1,hidden:true,sheetType:'GRID',gridProperties:{rowCount:2,columnCount:3}},data:[{rowData:[{values:[{userEnteredValue:{numberValue:8}}]}]}]}
  ],namedRanges:[{name:'人数',namedRangeId:'source-name',range:{sheetId:7,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:1}}]};
  const target={properties:{...properties,title:'new target'},sheets:[{properties:{sheetId:99,title:'シート1',index:0,sheetType:'GRID',gridProperties:{rowCount:2,columnCount:3}}}],namedRanges:[]};
  const books={[sourceId]:source,'private-target':target};
  let active=null, nextId=100;
  function nativeSheet(book,sheet){return {
    getSheetId:()=>sheet.properties.sheetId,getName:()=>sheet.properties.title,
    getLastRow:()=>sheet.data?.some(g=>g.rowData?.some(r=>r.values?.some(c=>c.userEnteredValue)))?1:0,
    getLastColumn:()=>sheet.data?.some(g=>g.rowData?.some(r=>r.values?.some(c=>c.userEnteredValue)))?1:0,
    getImages:()=>[],getDrawings:()=>[],getCharts:()=>sheet.charts||[],getFormUrl:()=>null,
    setName(name){assert.notEqual(book,source);sheet.properties.title=name;return this;},
    showSheet(){assert.notEqual(book,source);delete sheet.properties.hidden;return this;},
    hideSheet(){assert.notEqual(book,source);sheet.properties.hidden=true;return this;},
    copyTo(dest){assert.equal(book,source);assert.equal(dest,nativeTarget);const copy=plain(sheet);const old=copy.properties.sheetId;copy.properties.sheetId=nextId++;copy.properties.title='Copy of '+sheet.properties.title;copy.properties.index=target.sheets.length;delete copy.properties.hidden;
      const remap=v=>{if(Array.isArray(v))v.forEach(remap);else if(v&&typeof v==='object'){for(const k of Object.keys(v)){if(k==='sheetId'&&v[k]===old)v[k]=copy.properties.sheetId;else if(k==='formulaValue')v[k]='=#REF!';else remap(v[k]);}}};remap(copy);target.sheets.push(copy);return nativeSheet(target,copy);}
  };}
  function nativeBook(book,id){return {getId:()=>id,getName:()=>book.properties.title,getOwner:()=>({getEmail:()=> 'owner@example.test'}),getSheets:()=>book.sheets.map(s=>nativeSheet(book,s)),getSheetById:sid=>{const s=book.sheets.find(s=>s.properties.sheetId===sid);return s?nativeSheet(book,s):null;},setActiveSheet:sheet=>{active=sheet.getSheetId();},moveActiveSheet:index=>{const old=book.sheets.findIndex(s=>s.properties.sheetId===active);const [sheet]=book.sheets.splice(old,1);book.sheets.splice(index-1,0,sheet);book.sheets.forEach((s,i)=>s.properties.index=i);},deleteSheet:sheet=>{assert.notEqual(book,source);book.sheets=book.sheets.filter(s=>s.properties.sheetId!==sheet.getSheetId());book.sheets.forEach((s,i)=>s.properties.index=i);}};}
  const nativeTarget=nativeBook(target,'private-target');
  const ctx=vm.createContext({Date,JSON,Error,encodeURIComponent,Session:{getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},SpreadsheetApp:{getActiveSpreadsheet:()=>nativeTarget,openById:id=>nativeBook(books[id],id),getUi:()=>({alert(){},ButtonSet:{OK:'OK'}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>store.get(k)||null,setProperty:(k,v)=>{store.set(k,v);}})},Utilities:{sleep(){},getUuid:()=> 'random-id',computeDigest:(_,s)=>[...createHash('sha256').update(s).digest()],DigestAlgorithm:{SHA_256:'SHA-256'},Charset:{UTF_8:'utf8'}},ScriptApp:{getOAuthToken:()=> 'TEST_TOKEN'},UrlFetchApp:{fetch(url,opts){api.push({url,method:opts.method});const u=new URL(url);const segment=decodeURIComponent(u.pathname.split('/').at(-1));const id=segment.replace(/:batchUpdate$/,'');const book=books[id];assert.ok(book,'known book');if(opts.method==='get'){
       let out=plain(book);const range=u.searchParams.get('ranges');if(range){const title=range.slice(1,-1).replace(/''/g,"'");out.sheets=out.sheets.filter(s=>s.properties.title===title);}else out.sheets=out.sheets.map(({data,...rest})=>rest);
       return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(out)};
     }
     assert.notEqual(id,sourceId,'no source writes');writes.push(JSON.parse(opts.payload));for(const request of JSON.parse(opts.payload).requests){
       if(request.updateSpreadsheetProperties)Object.assign(book.properties,request.updateSpreadsheetProperties.properties);
       else if(request.addNamedRange)book.namedRanges.push({...request.addNamedRange.namedRange,namedRangeId:'target-name'});
       else if(request.updateNamedRange)Object.assign(book.namedRanges.find(r=>r.namedRangeId===request.updateNamedRange.namedRange.namedRangeId),request.updateNamedRange.namedRange);
       else if(request.updateCells){const a=request.updateCells,s=book.sheets.find(s=>s.properties.sheetId===a.start.sheetId);assert.equal(a.fields,'userEnteredValue');a.rows[0].values.forEach((v,c)=>s.data[0].rowData[a.start.rowIndex].values[a.start.columnIndex+c].userEnteredValue=v.userEnteredValue);}
       else if(request.deleteConditionalFormatRule){const a=request.deleteConditionalFormatRule;book.sheets.find(s=>s.properties.sheetId===a.sheetId).conditionalFormats.splice(a.index,1);}
       else if(request.addConditionalFormatRule){const a=request.addConditionalFormatRule,s=book.sheets.find(s=>s.properties.sheetId===a.rule.ranges[0].sheetId);s.conditionalFormats??=[];s.conditionalFormats.splice(a.index,0,a.rule);}
       else if(request.setDataValidation){const a=request.setDataValidation,s=book.sheets.find(s=>s.properties.sheetId===a.range.sheetId);s.data[0].rowData[a.range.startRowIndex].values[a.range.startColumnIndex].dataValidation=a.rule;}
       else assert.fail('unhandled request '+Object.keys(request));
     }return {getResponseCode:()=>200,getContentText:()=> '{}'};
   }}});
  vm.runInContext(code,ctx);
  const srcBook=ctx.nmReadBook_(sourceId);
  const state={version:1,owner:'owner@example.test',sourceId,targetId:'private-target',blankId:99,blankTitle:'シート1',phase:'baseline',cursor:0,map:{},manifestHash:ctx.nmHash_(ctx.nmBookDefinition_(srcBook)),sheets:source.sheets.map(s=>({id:s.properties.sheetId,title:s.properties.title,hidden:!!s.properties.hidden,rows:2,columns:3}))};
  return {ctx,source,target,sourceId,state,store,writes,api,nativeTarget};
}

test('full migration preserves source bytes, target constants and formulas, names, order, hidden tabs and formatting',()=>{
 const h=harness(), before=JSON.stringify(h.source);
 for(let i=0;h.state.phase!=='VERIFIED'&&i<30;i++){h.ctx.nmStep_(h.state);h.ctx.nmSave_(h.state);}
 assert.equal(h.state.phase,'VERIFIED');assert.equal(JSON.stringify(h.source),before);assert.equal(h.target.sheets.length,2);
 assert.deepEqual(h.target.sheets.map(s=>s.properties.title),['台帳','集計']);assert.equal(h.target.sheets[1].properties.hidden,true);
 assert.equal(h.target.sheets[0].data[0].rowData[0].values[1].userEnteredValue.formulaValue,"='集計'!A1");
 assert.equal(h.target.sheets[0].data[0].rowData[0].values[2].userEnteredValue.stringValue,'=literal');
 assert.equal(h.target.namedRanges[0].range.sheetId,h.target.sheets[1].properties.sheetId);
 assert.ok(h.api.filter(a=>a.method==='post').every(a=>!a.url.includes(h.sourceId)));
 assert.ok([...h.store.values()].every(v=>!v.includes('候補者')&&!v.includes('formulaValue')),'no business cells in persisted progress');
});
test('any source API write is refused before network access',()=>{const h=harness(),n=h.api.length;assert.throws(()=>h.ctx.nmRequest_('post',h.sourceId,':batchUpdate',{}),/元ブック/);assert.equal(h.api.length,n);});
test('source cannot be used as destination even with forged state',()=>{const h=harness();assert.throws(()=>h.ctx.nmWrite_({...h.state,targetId:h.sourceId},[]),/移行先|元ブック/);assert.equal(h.writes.length,0);});
test('source edit after baseline stops before copying that tab',()=>{const h=harness();h.ctx.nmStep_(h.state);h.ctx.nmStep_(h.state);h.source.sheets[0].data[0].rowData[0].values[0].userEnteredValue.stringValue='edited';assert.throws(()=>h.ctx.nmStep_(h.state),/移行開始後/);assert.equal(h.target.sheets.length,1);});
test('unexpected destination tab blocks replay instead of producing duplicate copies',()=>{const h=harness();h.target.sheets.push({properties:{sheetId:543,title:'orphan'}});assert.throws(()=>h.ctx.nmStep_(h.state),/未記録/);assert.equal(h.writes.length,0);});
test('destination manual edit after copy is never overwritten',()=>{const h=harness();while(h.state.phase!=='references')h.ctx.nmStep_(h.state);h.target.sheets[1].data[0].rowData[0].values[0].userEnteredValue.stringValue='edited';h.ctx.nmStep_(h.state);assert.throws(()=>h.ctx.nmStep_(h.state),/上書きせず/);assert.equal(h.target.sheets[1].data[0].rowData[0].values[0].userEnteredValue.stringValue,'edited');});
test('format, validation and literal differences affect fingerprints; recalculation outputs do not',()=>{const {ctx,source}=harness(),base=plain(source.sheets[0]),ids={'0':'台帳','7':'集計'},hash=s=>ctx.nmHash_(ctx.nmSheetDefinition_(s,ids));const original=hash(base);base.data[0].rowData[0].values[1].effectiveValue={numberValue:99};assert.equal(hash(base),original);base.data[0].rowData[0].values[1].userEnteredFormat.numberFormat.pattern='0.00';assert.notEqual(hash(base),original);});
test('formula repair targets only formula runs and preserves literal = strings',()=>{const {ctx,source}=harness();const requests=plain(ctx.nmFormulaRequests_(source.sheets[0],123));assert.equal(requests.length,1);assert.equal(requests[0].updateCells.start.columnIndex,1);assert.equal(requests[0].updateCells.rows[0].values.length,1);assert.equal(requests[0].updateCells.fields,'userEnteredValue');});
test('sheet ID zero is remapped correctly and unmapped references reject',()=>{const {ctx}=harness();assert.deepEqual(plain(ctx.nmRemap_({range:{sheetId:0}}, {'0':99})),{range:{sheetId:99}});assert.throws(()=>ctx.nmRemap_({sheetId:8},{'0':99}),/対応/);});
test('new formula errors prevent verification, existing same errors are retained',()=>{const {ctx}=harness();const error={data:[{rowData:[{values:[{effectiveValue:{errorValue:{type:'REF'}}}]}]}]};assert.throws(()=>ctx.nmAssertNoNewFormulaErrors_({},error,'tab'),/計算エラー/);assert.doesNotThrow(()=>ctx.nmAssertNoNewFormulaErrors_(error,error,'tab'));});
test('unsupported features stop before any native copy',()=>{const h=harness();h.source.sheets[0].tables=[{tableId:'table'}];h.state.manifestHash=h.ctx.nmHash_(h.ctx.nmBookDefinition_(h.ctx.nmReadBook_(h.sourceId)));assert.throws(()=>h.ctx.nmStep_(h.state),/自動検証/);assert.equal(h.target.sheets.length,1);assert.equal(h.writes.length,0);});
test('empty target validation refuses notes and formatting-only content',()=>{const h=harness();h.target.sheets[0].data=[{rowData:[{values:[{note:'do not replace'}]}]}];assert.throws(()=>h.ctx.nmAssertEmptyTarget_(h.ctx.nmReadBook_('private-target'),h.nativeTarget),/上書きせず/);});

test('replays after a saved native-copy checkpoint never create a second copy',()=>{const h=harness();h.ctx.nmStep_(h.state);h.ctx.nmStep_(h.state);h.ctx.nmStep_(h.state);assert.equal(h.state.phase,'copy');assert.equal(h.state.cursor,1);h.state.cursor=0;const count=h.target.sheets.length;h.ctx.nmStep_(h.state);assert.equal(h.state.cursor,1);assert.equal(h.target.sheets.length,count);});
test('replays with missing copy fingerprint stop without another native copy',()=>{const h=harness();h.ctx.nmStep_(h.state);h.ctx.nmStep_(h.state);h.ctx.nmStep_(h.state);h.state.cursor=0;h.store.delete('NODE_MIGRATION_V1_targetCopy_0');const count=h.target.sheets.length;assert.throws(()=>h.ctx.nmStep_(h.state),/二重コピーせず/);assert.equal(h.target.sheets.length,count);});
test('repair checkpoint is reusable after execution interruption',()=>{const h=harness();while(h.state.phase!=='repair')h.ctx.nmStep_(h.state);h.ctx.nmStep_(h.state);h.state.cursor=0;const count=h.writes.length;h.ctx.nmStep_(h.state);assert.equal(h.state.cursor,1);assert.equal(h.writes.length,count);});

test('public migration functions are blocked by known source comment preservation gap before any network or writes',()=>{const h=harness(),reads=h.api.length;assert.throws(()=>h.ctx.startNodeMigration(),/コメント/);assert.throws(()=>h.ctx.continueNodeMigration(),/コメント/);assert.equal(h.api.length,reads);assert.equal(h.writes.length,0);assert.equal(h.store.size,0);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// The shared harness itself has no production data. Import just its fixture
// definitions so this suite does not register the entire Apps Script suite twice.
const codePath=fileURLToPath(new URL('../google-apps-script/Code.gs',import.meta.url));
const harnessSource=readFileSync(new URL('./apps-script.test.mjs',import.meta.url),'utf8').split('\ntest(')[0]
 .replace(/const CODE_PATH = [^\n]+;/,`const CODE_PATH = ${JSON.stringify(codePath)};`)+'\nexport {baseHarness,seedMatchingRows};';
const {baseHarness,seedMatchingRows}=await import('data:text/javascript;base64,'+Buffer.from(harnessSource).toString('base64'));
const fragment=()=>readFileSync(new URL('../google-apps-script/FirestoreMigration.fragment.gs',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const marker='ONLY_SYNTHETIC_STREAM_CONTENT_';
const stable=value=>value instanceof Date?JSON.stringify(value.toISOString()):value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
const rowPath=(sheetId,row)=>`tables/${sheetId}/rows/${String(row).padStart(8,'0')}`;
function fixture(){
 const h=baseHarness({now:'2026-11-06T01:00:00.000Z'});seedMatchingRows(h);vm.runInContext(fragment(),h.context);
 h.spreadsheet.getSheetByName('_NODE_operations').values.push(['synthetic-existing-operation-000001','ND-001','updateRecord','synthetic-payload-hash','{}','2026-11-05T00:00:00.000Z']);
 h.properties.NODE_FIRESTORE_MIGRATION_TARGET=JSON.stringify({projectId:'insup-node-stream-fixture'});h.writes.length=0;h.sheetReads.length=0;h.spreadsheet.reads.length=0;h.logs.length=0;
 h.properties.NODE_PEPPER='P'.repeat(43);
 return h;
}
function syntheticSheet(h,count=18){
 const sheet=h.spreadsheet.insertSheet("架空の原稿 '保存検証'");
 sheet.values=Array.from({length:count},(_,index)=>[`${marker}${index+1}`,index+.25,index%2===0,index%31===0?new Date('2025-12-31T15:00:00.000Z'):'',`文字列😀${index+1}`]);
 sheet.formulas=Array.from({length:count},(_,index)=>index%13===0?['','','','',`=A${index+1}&"-架空"`]:[]);
 sheet.rawCells['2,1']={userEnteredValue:{stringValue:sheet.values[1][0]},effectiveValue:{stringValue:sheet.values[1][0]},formattedValue:sheet.values[1][0],note:'架空のセルメモ😀',chipRuns:[{startIndex:0,chip:{richLinkProperties:{uri:'https://example.test/fictional-only',mimeType:'application/vnd.google-apps.document'}}}]};
 sheet.rawCells['3,2']={userEnteredValue:{numberValue:sheet.values[2][1]},effectiveValue:{numberValue:sheet.values[2][1]},formattedValue:'2.2500',userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:'0.0000'}},dataValidation:{condition:{type:'NUMBER_GREATER',values:[{userEnteredValue:'0'}]},strict:true,showCustomUi:true}};
 sheet.getRange(Math.min(7,count),1,1,sheet.getMaxColumns()).addDeveloperMetadata('SYNTHETIC_ROW_META','保存する架空の管理情報','PROJECT');
 sheet.addDeveloperMetadata('SYNTHETIC_TABLE_META','表の架空情報','DOCUMENT');
 const Metadata=h.spreadsheet.metadata[0].constructor;h.spreadsheet.metadata.push(new Metadata(h.spreadsheet,null,null,'SYNTHETIC_BOOK_META',null,'PROJECT'));
 h.writes.length=0;return sheet;
}
function sourceSnapshot(h){return stable(h.spreadsheet.sheets.map(sheet=>({id:sheet.id,values:sheet.values,formulas:sheet.formulas,rawCells:sheet.rawCells,validations:sheet.validations,formats:sheet.formats})));}
function metadataAt(h,sheet,row){return Object.fromEntries(h.spreadsheet.metadata.filter(meta=>meta.sheet===sheet&&meta.row===row).map(meta=>[meta.key,{value:meta.value,metadataId:meta.id,visibility:meta.visibility}]));}
function cellAt(sheet,row,column){
 const key=`${row},${column}`;if(Object.hasOwn(sheet.rawCells,key))return plain(sheet.rawCells[key]);
 const value=sheet.values[row-1]?.[column-1]??'',formula=sheet.formulas[row-1]?.[column-1],format=sheet.formats[key];
 const entered=formula?{formulaValue:formula}:value instanceof Date?{numberValue:(value.getTime()+9*3600*1000)/86400000+25569}:typeof value==='number'?{numberValue:value}:typeof value==='boolean'?{boolValue:value}:value!==''?{stringValue:value}:{};
 return {userEnteredValue:entered,formattedValue:String(value),...(sheet.validations[key]?{dataValidation:plain(sheet.validations[key])}:{}),...(format?{userEnteredFormat:plain(format)}:{})};
}
function* expectedRowDocuments(h){
 for(const sheet of [...h.spreadsheet.sheets].sort((a,b)=>a.id-b.id)){
  const rows=h.spreadsheet.metadata.filter(meta=>meta.sheet===sheet&&meta.row).map(meta=>meta.row),end=Math.max(sheet.getLastRow(),...rows),width=Math.max(1,sheet.getLastColumn());
  for(let row=1;row<=end;row++){
   const values=Array.from({length:width},(_,index)=>{const value=sheet.values[row-1]?.[index];return value instanceof Date?{$nodeDate:value.toISOString()}:value===undefined||value===null?'':value;});
   const formulas=Array.from({length:width},(_,index)=>String(sheet.formulas[row-1]?.[index]||'')),cells=Array.from({length:width},(_,index)=>cellAt(sheet,row,index+1)),metadata=metadataAt(h,sheet,row);
   if(!values.some(value=>value!=='')&&!formulas.some(Boolean)&&!cells.some(cell=>Object.keys(cell).length)&&!Object.keys(metadata).length)continue;
   yield {path:rowPath(sheet.id,row),data:{row,hasMetadata:!!Object.keys(metadata).length,payload:stable({values,formulas,cells,metadata})}};
  }
 }
}
function scanPages(h,context,visit){
 let cursor={tableIndex:0,row:1},pages=0,count=0,maxBytes=0,maxRows=0;const cursors=new Set(),counts={rowDocumentCount:0,recordIdCount:0,operationCount:0};
 while(true){
  const key=stable(cursor);assert.equal(cursors.has(key),false,'a page must advance its cursor');cursors.add(key);
  const page=plain(h.context.firestoreMigrationSourcePage_(context,cursor));pages++;assert.ok(pages<10000,'bounded traversal must finish');
  assert.ok(Array.isArray(page.documents));assert.ok(page.documents.length<=64,'a page cannot retain more than 64 row documents');
  assert.equal(page.countsDelta.rowDocumentCount,page.documents.length);for(const key of Object.keys(counts)){assert.ok(Number.isSafeInteger(page.countsDelta[key])&&page.countsDelta[key]>=0);counts[key]+=page.countsDelta[key];}
  const size=Buffer.byteLength(JSON.stringify(page.documents));maxBytes=Math.max(maxBytes,size);assert.ok(size<=4*1024*1024,'a page cannot retain more than its byte budget');
  assert.ok(page.readStats.rowsRead<=64,'each value/formula/grid window must be bounded');maxRows=Math.max(maxRows,page.readStats.rowsRead);
  for(const document of page.documents){assert.match(document.path,/^tables\/\d+\/rows\/\d{8}$/);visit?.(document);count++;}
  if(page.done)return {pages,count,maxBytes,maxRows,counts,last:page};
  assert.ok(page.nextCursor&&typeof page.nextCursor==='object');cursor=page.nextCursor;
 }
}
function assertBoundedReads(h){
 for(const read of h.spreadsheet.reads)if(['getValues','getFormulas'].includes(read.method))assert.ok(read.rows<=64,`${read.method} read ${read.rows} rows`);
 for(const read of h.sheetReads)for(const range of read.options.ranges||[]){const match=range.match(/!(?:[A-Z]+)(\d+):(?:[A-Z]+)(\d+)$/);assert.ok(match,range);assert.ok(Number(match[2])-Number(match[1])+1<=64,range);}
}
function assertCatalogOnlyContext(h,context){
 const apiHandles=new Set([h.spreadsheet,...h.spreadsheet.sheets]),seen=new Set(),stack=[context];
 while(stack.length){const value=stack.pop();if(typeof value==='string'){assert.equal(value.includes(marker),false,'source payloads must not accumulate in the catalog context');continue;}if(!value||typeof value!=='object'||apiHandles.has(value)||seen.has(value))continue;seen.add(value);for(const child of Object.values(value))stack.push(child);}
}

test('the small synthetic reference preserves the complete original row schema independently of streaming',()=>{
 const h=fixture();syntheticSheet(h);const original=plain(h.context.firestoreMigrationSource_(h.context.config_()).documents.filter(document=>document.path.includes('/rows/')));
 assert.deepEqual([...expectedRowDocuments(h)],original);
});

test('streamed source pages preserve the classic small-fixture documents byte for byte, including notes/chips/date/formula/metadata',()=>{
 const h=fixture(),sheet=syntheticSheet(h),before=sourceSnapshot(h),classic=h.context.firestoreMigrationSource_(h.context.config_()),expected=plain(classic.documents.filter(document=>document.path.includes('/rows/')));
 h.sheetReads.length=0;h.spreadsheet.reads.length=0;const context=h.context.firestoreMigrationContext_(h.context.config_()),actual=[];
 const result=scanPages(h,context,document=>actual.push(document));assert.deepEqual(actual,expected);assertBoundedReads(h);assert.ok(result.pages>=1);
 const payload=JSON.parse(actual.find(document=>document.path===rowPath(sheet.id,2)).data.payload);assert.equal(payload.cells[0].note,'架空のセルメモ😀');assert.ok(payload.cells[0].chipRuns.length);
 assert.ok(actual.some(document=>document.data.payload.includes('$nodeDate')));assert.ok(actual.some(document=>document.data.payload.includes('formulaValue')));assert.ok(actual.some(document=>document.data.hasMetadata));
 assert.equal(sourceSnapshot(h),before);assert.deepEqual(h.writes,[]);
});

test('21 tables and more than 13,501 synthetic rows traverse with constant-size pages and independent full-output hash equality',()=>{
 const h=fixture(),sheet=syntheticSheet(h,13550);sheet.values.forEach((row,index)=>{for(let column=6;column<=26;column++)row.push(column%3===0?index+column/100:column%3===1?index%2===0:`架空値${index}:${column}`);});for(let index=0;index<16;index++){const extra=h.spreadsheet.insertSheet(`架空の補助表${index+1}`);extra.values=[[`架空見出し${index+1}`],[index+1]];}
 assert.equal(h.spreadsheet.getSheets().length,21);
 sheet.getRange(13560,1,1,sheet.getMaxColumns()).addDeveloperMetadata('SYNTHETIC_TAIL_META','値の後の管理情報も保持','DOCUMENT');
 sheet.maxRows=13560;
 const before=sourceSnapshot(h),properties=structuredClone(h.properties);h.writes.length=0;h.sheetReads.length=0;h.spreadsheet.reads.length=0;
 h.context.firestoreMigrationSource_=()=>{throw Error('FORBIDDEN_FULL_SOURCE_COLLECTOR');};
 const context=h.context.firestoreMigrationContext_(h.context.config_());assert.equal(context.tables.length,21);assert.equal(Object.hasOwn(context,'documents'),false);assertCatalogOnlyContext(h,context);
 const actualHash=createHash('sha256'),expectedHash=createHash('sha256');let expectedCount=0,lastPath='';
 const result=scanPages(h,context,document=>{actualHash.update(stable(document)+'\n');assert.notEqual(document.path,lastPath);lastPath=document.path;});assertCatalogOnlyContext(h,context);
 for(const document of expectedRowDocuments(h)){expectedHash.update(stable(document)+'\n');expectedCount++;}
 assert.ok(result.count>13501);assert.equal(result.count,expectedCount);assert.equal(actualHash.digest('hex'),expectedHash.digest('hex'));assert.ok(result.pages>200);assertBoundedReads(h);
 assert.equal(result.counts.recordIdCount,h.spreadsheet.metadata.filter(meta=>meta.key==='NODE_RECORD_ID').length);assert.equal(result.counts.operationCount,1);
 assert.equal(sourceSnapshot(h),before);assert.deepEqual(h.properties,properties);assert.deepEqual(h.writes,[]);assert.doesNotMatch(JSON.stringify(h.logs),new RegExp(marker));
});

test('page replay is deterministic and a metadata-only tail remains part of the stream',()=>{
 const h=fixture(),sheet=syntheticSheet(h,70);sheet.getRange(120,1,1,sheet.getMaxColumns()).addDeveloperMetadata('SYNTHETIC_TAIL','後方管理ID','PROJECT');h.writes.length=0;
 const context=h.context.firestoreMigrationContext_(h.context.config_()),cursor={tableIndex:0,row:1};
 const first=plain(h.context.firestoreMigrationSourcePage_(context,cursor)),again=plain(h.context.firestoreMigrationSourcePage_(context,cursor));assert.deepEqual(again,first);
 let tail;scanPages(h,context,document=>{if(document.path===rowPath(sheet.id,120))tail=document;});assert.ok(tail?.data.hasMetadata);assert.match(tail.data.payload,/後方管理ID/);
});

test('invalid persisted page cursors fail before reading or modifying source data',()=>{
 const h=fixture();syntheticSheet(h);const context=h.context.firestoreMigrationContext_(h.context.config_()),before=sourceSnapshot(h);
 for(const cursor of [{tableIndex:-1,row:1},{tableIndex:0,row:0},{tableIndex:0,row:'1'},{tableIndex:999999,row:1}])assert.throws(()=>h.context.firestoreMigrationSourcePage_(context,cursor));
 assert.equal(sourceSnapshot(h),before);assert.deepEqual(h.writes,[]);
});

test('the page byte budget carries an oversized window forward without losing large but valid rows',()=>{
 const h=fixture(),sheet=syntheticSheet(h,20);for(let row=1;row<=20;row++){sheet.values[row-1]=[`${marker}${row}`];sheet.formulas[row-1]=[];sheet.rawCells[`${row},1`]={userEnteredValue:{stringValue:sheet.values[row-1][0]},note:'架空の長いメモ'.repeat(20000)};}
 const context=h.context.firestoreMigrationContext_(h.context.config_()),expected=[...expectedRowDocuments(h)],actual=[];const result=scanPages(h,context,document=>actual.push(document));
 assert.deepEqual(actual,expected);assert.ok(result.maxBytes<=4*1024*1024);assert.ok(result.pages>h.spreadsheet.sheets.length,'byte-budget clipping must retain the next unread row');
});

function pageCore(page){const {readStats,...core}=plain(page);return core;}
function rawRequests(h,sheet){
 return h.sheetReads.flatMap(read=>(read.options.ranges||[]).flatMap(range=>{
  const match=range.match(/^'(.+)'!A(\d+):[A-Z]+(\d+)$/);
  return match&&match[1].replace(/''/g,"'")===sheet.name?[{start:Number(match[2]),end:Number(match[3]),rows:Number(match[3])-Number(match[2])+1}]:[];
 }));
}

test('adaptive raw reads reduce small-row RPCs while cold and warm pages preserve their exact core',()=>{
 const h=fixture(),sheet=syntheticSheet(h,128),context=h.context.firestoreMigrationContext_(h.context.config_()),tableIndex=context.tables.findIndex(info=>info.id===sheet.id),cursor={tableIndex,row:1};
 h.sheetReads.length=0;const cold=plain(h.context.firestoreMigrationSourcePage_(context,cursor)),coldReads=rawRequests(h,sheet);
 h.sheetReads.length=0;const warm=plain(h.context.firestoreMigrationSourcePage_(context,cursor)),warmReads=rawRequests(h,sheet);
 assert.deepEqual(coldReads.map(read=>read.rows),[8,32,24]);assert.deepEqual(warmReads.map(read=>read.rows),[32,32]);
 assert.equal(cold.readStats.gridRequests,3);assert.equal(warm.readStats.gridRequests,2);assert.deepEqual(pageCore(warm),pageCore(cold));
 const expected=[...expectedRowDocuments(h)].filter(document=>document.path.startsWith(`tables/${sheet.id}/rows/`)).slice(0,64);
 assert.deepEqual(cold.documents,expected);assert.deepEqual(cold.nextCursor,{tableIndex,row:65});assertCatalogOnlyContext(h,context);assert.deepEqual(h.writes,[]);
});

test('adaptive raw reads halve an abrupt oversized window and grow again after large rows without changing source facts',()=>{
 const h=fixture(),sheet=syntheticSheet(h,96);
 for(let row=1;row<=96;row++){sheet.values[row-1]=[`${marker}${row}`];sheet.formulas[row-1]=[];delete sheet.rawCells[`${row},1`];delete sheet.rawCells[`${row},2`];
  if(row>=9&&row<=24)sheet.rawCells[`${row},1`]={userEnteredValue:{stringValue:sheet.values[row-1][0]},note:'x'.repeat(280000)};
 }
 const before=sourceSnapshot(h),expected=[...expectedRowDocuments(h)],context=h.context.firestoreMigrationContext_(h.context.config_()),tableIndex=context.tables.findIndex(info=>info.id===sheet.id),cursor={tableIndex,row:1};
 h.sheetReads.length=0;h.spreadsheet.reads.length=0;
 const cold=plain(h.context.firestoreMigrationSourcePage_(context,cursor)),requests=rawRequests(h,sheet),valueReads=h.spreadsheet.reads.filter(read=>read.sheetId===sheet.id&&read.method==='getValues');
 assert.deepEqual(requests.slice(0,4).map(read=>[read.start,read.rows]),[[1,8],[9,32],[9,16],[9,8]]);
 assert.equal(valueReads.some(read=>read.row===9&&read.rows>8),false,'rejected raw windows must not fetch values/formulas');
 assert.ok(context.readStats.maxRawResponseBytes<=4*1024*1024);assert.ok(Buffer.byteLength(JSON.stringify(cold.documents))<=4*1024*1024);
 const warm=plain(h.context.firestoreMigrationSourcePage_(context,cursor));assert.deepEqual(pageCore(warm),pageCore(cold));
 const actual=[],result=scanPages(h,context,document=>actual.push(document));assert.deepEqual(actual,expected);assert.ok(result.maxBytes<=4*1024*1024);
 assert.ok(rawRequests(h,sheet).some(read=>read.start>24&&read.rows>1),'small chunks after a long row must allow the next request to grow');
 assertCatalogOnlyContext(h,context);assert.equal(sourceSnapshot(h),before);assert.deepEqual(h.writes,[]);
});

function installTarget(h){
 const documents=new Map(),metrics={commitBatches:0,maxCommitWrites:0,maxCommitBytes:0,batchGets:0,maxBatchGet:0,listReads:0},version={value:0};
 const name=(config,path)=>`projects/${config.projectId}/databases/${config.databaseId}/documents/${path}`;
 h.context.firestoreReset_=()=>{};h.context.firestoreClose_=()=>{};
 h.context.firestoreEncodeFields_=plain;h.context.firestoreDecodeFields_=plain;h.context.firestoreDocumentName_=name;
 h.context.firestoreConfig_=()=>JSON.parse(h.properties.NODE_FIRESTORE_CONFIG);
 h.context.firestoreOpenBook_=()=>{const config=JSON.parse(h.properties.NODE_FIRESTORE_CONFIG),manifest=documents.get(name(config,`nodeWorkbooks/${config.workbookId}`));return {_firestoreManifest:plain(manifest.fields)};};
 h.context.firestoreRequest_=(method,path,body,config)=>{
  assert.ok(config,'migration must use its explicitly selected target');
  if(method==='post'&&path===':commit'){
   metrics.commitBatches++;metrics.maxCommitWrites=Math.max(metrics.maxCommitWrites,body.writes.length);metrics.maxCommitBytes=Math.max(metrics.maxCommitBytes,Buffer.byteLength(JSON.stringify(body)));
   for(const write of body.writes){const old=documents.get(write.update.name);if(write.currentDocument?.exists===false&&old||write.currentDocument?.updateTime!==undefined&&write.currentDocument.updateTime!==old?.updateTime)throw Object.assign(Error('CONFLICT'),{nodeCode:'CONFLICT'});}
   const updateTime=String(++version.value);for(const write of body.writes)documents.set(write.update.name,{name:write.update.name,fields:plain(write.update.fields),updateTime});
   return {writeResults:body.writes.map(()=>({updateTime}))};
  }
  if(method==='post'&&path===':batchGet'){
   metrics.batchGets++;metrics.maxBatchGet=Math.max(metrics.maxBatchGet,body.documents.length);
   return body.documents.map(document=>documents.has(document)?{found:plain(documents.get(document)),readTime:'2026-11-06T01:00:00.000Z'}:{missing:document,readTime:'2026-11-06T01:00:00.000Z'});
  }
  if(method==='get'&&path.includes('?')){
   metrics.listReads++;const [prefix,query]=path.split('?'),params=new URLSearchParams(query),size=Number(params.get('pageSize')||64),offset=Number(params.get('pageToken')||0),full=name(config,prefix);
   assert.ok(size<=64,'target listing must also remain bounded');const names=[...documents.keys()].filter(key=>key.startsWith(full+'/')&&!key.slice(full.length+1).includes('/')).sort();
   return {documents:names.slice(offset,offset+size).map(key=>plain(documents.get(key))),...(offset+size<names.length?{nextPageToken:String(offset+size)}:{})};
  }
  if(method==='get')return documents.has(name(config,path))?plain(documents.get(name(config,path))):null;
  throw Error(`Unsupported synthetic migration RPC ${method} ${path}`);
 };
 return {documents,metrics};
}
function finish(h,name){
 let result;for(let attempt=0;attempt<2000;attempt++){
  result=h.context[name]();
  for(const key of ['NODE_FIRESTORE_PREVIEW_V2','NODE_FIRESTORE_MIGRATION_STATE'])if(h.properties[key]){assert.ok(Buffer.byteLength(h.properties[key])<=9000,`${key} exceeds a Script Property value`);assert.equal(h.properties[key].includes(marker),false,'checkpoints may not retain private source payloads');}
  if(result.more!==true)return result;
 }throw Error(`${name} did not finish its bounded resume loop`);
}

test('a simulated slow GAS clock yields preview before its page-count limit and resumes to the identical source root',()=>{
 const h=fixture();syntheticSheet(h,1536);const original=sourceSnapshot(h),expected=plain(finish(h,'previewNodeFirestoreMigration'));
 delete h.properties.NODE_FIRESTORE_PREVIEW_V2;
 const gridGet=h.context.Sheets.Spreadsheets.get,metadataSearch=h.context.Sheets.Spreadsheets.DeveloperMetadata.search;
 h.context.Sheets.Spreadsheets.DeveloperMetadata.search=(...args)=>{const result=metadataSearch(...args);h.clock.milliseconds+=9000;return result;};
 h.context.Sheets.Spreadsheets.get=(...args)=>{const result=gridGet(...args);if(args[1]?.ranges)h.clock.milliseconds+=1000;return result;};
 const first=plain(h.context.previewNodeFirestoreMigration()),checkpoint=JSON.parse(h.properties.NODE_FIRESTORE_PREVIEW_V2);
 assert.equal(first.more,true);assert.ok(checkpoint.scan.pageCount>0&&checkpoint.scan.pageCount<16,'the elapsed-time budget must stop before the independent page-count ceiling');
 assert.ok(first.readStats.elapsedMs>=28000&&first.readStats.elapsedMs<=31000,'only the bounded in-flight page may finish after the deadline');
 assert.equal(checkpoint.scan.done,false);assert.ok(Buffer.byteLength(h.properties.NODE_FIRESTORE_PREVIEW_V2)<=9000);assert.equal(h.properties.NODE_FIRESTORE_PREVIEW_V2.includes(marker),false);
 const completed=plain(finish(h,'previewNodeFirestoreMigration'));assert.equal(completed.more,false);assert.equal(completed.sourceHash,expected.sourceHash);assert.deepEqual(completed.counts,expected.counts);
 assert.equal(sourceSnapshot(h),original);assert.deepEqual(h.writes,[]);assert.doesNotMatch(JSON.stringify(h.logs),new RegExp(marker));
});

test('every owner migration entrance avoids the classic collector and keeps checkpoints and target batches bounded',()=>{
 const h=fixture();syntheticSheet(h,130);const original=sourceSnapshot(h),target=installTarget(h);let collectorCalls=0;
 h.context.firestoreMigrationSource_=()=>{collectorCalls++;throw Error('FORBIDDEN_FULL_SOURCE_COLLECTOR');};
 const preview=finish(h,'previewNodeFirestoreMigration');assert.ok(preview.sourceHash);assert.deepEqual([...target.documents],[]);
 h.properties.NODE_FIRESTORE_MIGRATION_CONFIRM=`PREPARE:${preview.sourceHash}`;finish(h,'prepareNodeFirestoreMigration');
 const imported=finish(h,'importNodeFirestoreMigration');assert.equal(imported.phase,'ready');assert.equal(h.properties.NODE_STORAGE_PROVIDER,undefined);
 const verified=finish(h,'verifyNodeFirestoreMigration');assert.equal(verified.verified,true);
 h.properties.NODE_FIRESTORE_MIGRATION_CONFIRM=`ACTIVATE:${preview.sourceHash}`;const active=finish(h,'activateNodeFirestoreMigration');assert.equal(active.active,true);
 assert.equal(h.properties.NODE_STORAGE_PROVIDER,'firestore');assert.equal(collectorCalls,0);assert.ok(target.metrics.maxCommitWrites<=80);assert.ok(target.metrics.maxCommitBytes<=8*1024*1024);assert.ok(target.metrics.maxBatchGet<=64);
 assert.equal(sourceSnapshot(h),original);assert.deepEqual(h.writes,[]);assert.doesNotMatch(JSON.stringify(h.logs),new RegExp(marker));
});

test('canceling a prepared streamed migration also avoids collecting source rows or changing the original',()=>{
 const h=fixture();syntheticSheet(h,70);const before=sourceSnapshot(h),target=installTarget(h);h.context.firestoreMigrationSource_=()=>{throw Error('FORBIDDEN_FULL_SOURCE_COLLECTOR');};
 const preview=finish(h,'previewNodeFirestoreMigration');h.properties.NODE_FIRESTORE_MIGRATION_CONFIRM=`PREPARE:${preview.sourceHash}`;finish(h,'prepareNodeFirestoreMigration');const saved=[...target.documents];
 h.properties.NODE_FIRESTORE_MIGRATION_CONFIRM=`CANCEL:${preview.sourceHash}`;assert.equal(finish(h,'cancelNodeFirestoreMigration').canceled,true);assert.deepEqual([...target.documents],saved);assert.equal(h.properties.NODE_STORAGE_PROVIDER,undefined);assert.equal(sourceSnapshot(h),before);assert.deepEqual(h.writes,[]);
});

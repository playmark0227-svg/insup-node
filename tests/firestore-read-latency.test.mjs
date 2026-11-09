import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const facadePath=fileURLToPath(new URL('../google-apps-script/Firestore.fragment.gs',import.meta.url));
const helper=readFileSync(new URL('./firestore-storage.test.mjs',import.meta.url),'utf8').split('\ntest(')[0].replace("readFileSync(new URL('../google-apps-script/Firestore.fragment.gs',import.meta.url),'utf8')",`readFileSync(${JSON.stringify(facadePath)},'utf8')`)+'\nexport {fixture,copy,fail};';
const {fixture,copy,fail}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
const batches=f=>f.calls.filter(call=>call.url.endsWith(':batchGet')&&call.body.documents.length>1);
const queries=f=>f.calls.filter(call=>call.url.endsWith(':runQuery'));
function transformBatch(f,transform){const original=f.c.UrlFetchApp.fetch;f.c.UrlFetchApp.fetch=(url,options)=>{const response=original(url,options),payload=options.payload&&JSON.parse(options.payload);if(url.endsWith(':batchGet')&&payload.documents.length>1){const body=transform(JSON.parse(response.getContentText()),payload);return {getResponseCode:()=>response.getResponseCode(),getContentText:()=>JSON.stringify(body)};}return response;};}

test('one request batches table metadata in the current transaction and keeps per-table checks on use',()=>{
 const f=fixture(),book=f.open(),matching=book.getSheetByName('2期目マッチングDB');
 assert.equal(matching.getName(),'2期目マッチングDB');assert.equal(batches(f).length,1);const call=batches(f)[0];assert.equal(call.body.documents.length,2);assert.equal(call.body.transaction,book.transaction);
 const at=f.calls.length;assert.equal(book.getSheetByName('_NODE_operations').getName(),'_NODE_operations');assert.equal(f.calls.length,at);
 const cachedTransaction=book.transaction;f.c.firestoreReset_(false);const fresh=f.c.firestoreOpenBook_(f.config);fresh.getSheetByName('_NODE_operations');assert.notEqual(fresh.transaction,cachedTransaction);assert.equal(batches(f).length,2,'A new request must re-read the table documents');
});

test('table batches accept reordered results but reject omitted, duplicate and unrelated names',()=>{
 const reordered=fixture();transformBatch(reordered,result=>result.reverse());assert.equal(reordered.open().getSheetByName('2期目マッチングDB').getName(),'2期目マッチングDB');
 for(const malformed of ['omitted','duplicate','unrelated','both']){const f=fixture();transformBatch(f,result=>{if(malformed==='omitted')result.pop();if(malformed==='duplicate')result[1]=copy(result[0]);if(malformed==='unrelated')result[1].found.name=result[1].found.name.replace('/tables/2','/tables/999');if(malformed==='both')result[1].missing=result[1].found.name;return result;});const b=f.open();fail(()=>b.getSheetByName('2期目マッチングDB'),'FIRESTORE_READ_FAILED');assert.equal(Object.keys(b.tableDocuments||{}).length,0);}
});

test('batch prefetch never bypasses table identity validation or treats absent requested tables as empty',()=>{
 for(const invalid of ['shape','missing']){const f=fixture();if(invalid==='shape'){const operation=f.read(f.root+'/tables/2');operation.title='wrong table';f.put(f.root+'/tables/2',operation);}else f.docs.delete(f.base+f.root+'/tables/2');const book=f.open();book.getSheetByName('2期目マッチングDB');fail(()=>book.getSheetByName('_NODE_operations'),'SCHEMA_MISMATCH');}
});

test('table metadata batching is bounded to one hundred requested documents',()=>{
 const f=fixture(),manifest=f.read(f.root);for(let id=3;id<=104;id++){manifest.tables.push({sheetId:id,title:'fixture-table-'+id});f.put(f.root+'/tables/'+id,{sheetId:id,title:'fixture-table-'+id,rowCount:1,columnCount:1,lastRow:0,lastColumn:0});}f.put(f.root,manifest);const book=f.open();book.getSheetByName('fixture-table-104');assert.equal(batches(f)[0].body.documents.length,100);assert.ok(batches(f)[0].body.documents[0].endsWith('/tables/104'));book.getSheetByName('fixture-table-103');assert.equal(batches(f).length,2);assert.equal(batches(f)[1].body.documents.length,4);assert.ok(batches(f).every(call=>call.body.transaction===book.transaction));
});

test('overlapping reads fetch only an uncovered middle range without adding one query per cached island',()=>{
 const f=fixture();for(let row=4;row<=8;row++)f.row(row,['value-'+row]);const sheet=f.open().getSheetByName('2期目マッチングDB');sheet.getRange(1,1,2,1).getValues();sheet.getRange(7,1,2,1).getValues();const before=queries(f).length,values=sheet.getRange(1,1,8,1).getValues();assert.equal(queries(f).length,before+1);const filters=queries(f).at(-1).body.structuredQuery.where.compositeFilter.filters;assert.equal(filters[0].fieldFilter.value.integerValue,'3');assert.equal(filters[1].fieldFilter.value.integerValue,'6');assert.equal(values[7][0],'value-8');const count=f.calls.length;sheet.getRange(2,1,6,1).getValues();assert.equal(f.calls.length,count);
});

test('only a complete row-count read can replace the metadata scan, including metadata after last values',()=>{
 for(const complete of [true,false]){const f=fixture(),table=f.read(f.root+'/tables/1');table.rowCount=10;f.put(f.root+'/tables/1',table);f.row(8,[],{metadata:{NODE_RECORD_ID:{value:'record-after-last-values',metadataId:33}}});const sheet=f.open().getSheetByName('2期目マッチングDB');sheet.getRange(1,1,complete?10:3,4).getValues();const before=queries(f).length,map=f.c.firestoreMetadataMaps_(sheet,['NODE_RECORD_ID']);assert.equal(map.NODE_RECORD_ID[8].value,'record-after-last-values');assert.equal(queries(f).length,before+(complete?0:1));}
});

test('row mutation planning reuses a transaction-owned metadata row but never a previous request',()=>{
 const f=fixture(),sheet=f.open(true).getSheetByName('2期目マッチングDB');f.c.firestoreMetadataMaps_(sheet,['NODE_RECORD_ID']);const before=f.calls.length;assert.equal(f.c.firestoreBody_(sheet,2).values[1],'架空会社');assert.equal(f.calls.length,before);f.row(2,['changed']);f.c.firestoreReset_(true);const fresh=f.c.firestoreOpenBook_(f.config).getSheetByName('2期目マッチングDB');assert.equal(f.c.firestoreBody_(fresh,2).values[0],'changed');assert.ok(f.calls.length>before);
});

function accountFixture(count=2){const f=fixture(),manifest=f.read(f.root);manifest.tables.push({sheetId:9,title:'_NODE_players'});f.put(f.root,manifest);f.put(f.root+'/tables/9',{sheetId:9,title:'_NODE_players',rowCount:200,columnCount:9,lastRow:count,lastColumn:9});for(let row=1;row<=count;row++)f.put(f.root+'/tables/9/rows/'+String(row).padStart(8,'0'),{row,hasMetadata:false,payload:JSON.stringify({values:row===1?['id','name','team','color','target','bio','sheetNames','role','active']:['ND-'+row,'fixture','','',20,'','[]','player',true],formulas:[],cells:[],metadata:{}})});return f;}
function transformProof(f,transform){const original=f.c.UrlFetchApp.fetch;f.c.UrlFetchApp.fetch=(url,options)=>{const response=original(url,options),payload=options.payload&&JSON.parse(options.payload);if(url.endsWith(':batchGet')&&!payload.transaction&&payload.mask){const body=transform(JSON.parse(response.getContentText()),payload);return {getResponseCode:()=>response.getResponseCode(),getContentText:()=>JSON.stringify(body)};}return response;};}

test('outside proof combines manifest and roster checks with a masked batch and still ends with a fresh manifest read',()=>{
 const f=accountFixture(),book=f.open();book.getSheetByName('_NODE_players').getRange(1,1,2,9).getValues();transformProof(f,result=>result.reverse());const start=f.calls.length;f.c.firestoreVerifyBook_(book);const proof=f.calls.slice(start);assert.equal(proof.length,2);assert.ok(proof[0].url.endsWith(':batchGet'));assert.equal(proof[0].body.transaction,undefined);assert.equal(proof[0].body.documents.length,4);assert.ok(proof[0].body.documents.includes(f.base+f.root));assert.deepEqual(proof[0].body.mask.fieldPaths,['__nodeProofAbsent']);assert.equal(proof[1].options.method,'get');assert.ok(proof[1].url.endsWith('/'+f.root));
});

test('account revocation and manifest changes before or during outside verification still fail closed',()=>{
 for(const changed of ['roster-row','roster-table','manifest-before','manifest-during']){const f=accountFixture(),book=f.open();book.getSheetByName('_NODE_players').getRange(1,1,2,9).getValues();if(changed==='roster-row'){const data=f.read(f.root+'/tables/9/rows/00000002'),body=JSON.parse(data.payload);body.values[8]=false;data.payload=JSON.stringify(body);f.put(f.root+'/tables/9/rows/00000002',data);}else if(changed==='roster-table'){const data=f.read(f.root+'/tables/9');data.lastRow=3;f.put(f.root+'/tables/9',data);}else if(changed==='manifest-before'){const data=f.read(f.root);data.revision++;f.put(f.root,data);}else transformProof(f,result=>{const data=f.read(f.root);data.revision++;f.put(f.root,data);return result;});fail(()=>f.c.firestoreVerifyBook_(book),'BUSY');}
});

test('outside proof rejects duplicate missing and unrelated result positions',()=>{
 for(const malformed of ['omitted','duplicate','unrelated','both']){const f=accountFixture(),book=f.open();book.getSheetByName('_NODE_players').getRange(1,1,2,9).getValues();transformProof(f,result=>{if(malformed==='omitted')result.pop();if(malformed==='duplicate')result[1]=copy(result[0]);if(malformed==='unrelated')result[1].found.name+='-wrong';if(malformed==='both')result[1].missing=result[1].found.name;return result;});fail(()=>f.c.firestoreVerifyBook_(book),'FIRESTORE_READ_FAILED');}
});

test('outside roster proof caps batches at one hundred without omitting account rows',()=>{
 const f=accountFixture(105),book=f.open();book.getSheetByName('_NODE_players').getRange(1,1,105,9).getValues();const start=f.calls.length;f.c.firestoreVerifyBook_(book);const proofs=f.calls.slice(start).filter(call=>call.url.endsWith(':batchGet'));assert.equal(proofs.length,2);assert.equal(proofs[0].body.documents.length,100);assert.equal(proofs[1].body.documents.length,7);assert.equal(new Set(proofs.flatMap(call=>call.body.documents)).size,107);assert.ok(proofs.every(call=>!call.body.transaction&&call.body.mask));
});

test('only matching rows use a 250-document page while ordinary private workflow tables remain at 200',()=>{
 const f=fixture(),book=f.open(),matching=book.getSheetByName('2期目マッチングDB'),operations=book.getSheetByName('_NODE_operations');matching.getRange(1,1,3,4).getValues();operations.getRange(1,1,1,6).getValues();const calls=queries(f);assert.equal(calls[0].body.structuredQuery.limit,250);assert.equal(calls[1].body.structuredQuery.limit,200);assert.equal(f.c.firestoreRowPageSize_(matching),250);assert.equal(f.c.firestoreRowPageSize_(operations),200);
});

test('matching metadata retains every ID at 226, exactly 250, 251 and 403 document boundaries',()=>{
 for(const count of [226,250,251,403]){const f=fixture(),table=f.read(f.root+'/tables/1');table.lastRow=count+2;f.put(f.root+'/tables/1',table);for(let row=4;row<=count+2;row++)f.row(row,['fixture-'+row],{metadata:{NODE_RECORD_ID:{value:'fixture-record-'+row,metadataId:row+10}}});const sheet=f.open().getSheetByName('2期目マッチングDB'),map=f.c.firestoreMetadataMaps_(sheet,['NODE_RECORD_ID']);assert.equal(Object.keys(map.NODE_RECORD_ID).length,count);assert.equal(map.NODE_RECORD_ID[count+2].value,'fixture-record-'+(count+2));const calls=queries(f);assert.equal(calls.length,count<250?1:2);assert.ok(calls.every(call=>call.body.structuredQuery.limit===250));if(count>=250)assert.ok(calls[1].body.structuredQuery.startAt.values[0].referenceValue.endsWith('/00000252'));}
});

test('sparse matching row ranges cross the page boundary without skipping records after a missing document',()=>{
 const f=fixture(),table=f.read(f.root+'/tables/1');table.lastRow=405;f.put(f.root+'/tables/1',table);for(let row=4;row<=405;row++)if(row!==251)f.row(row,['fixture-'+row]);const sheet=f.open().getSheetByName('2期目マッチングDB'),values=sheet.getRange(1,1,405,1).getValues();assert.equal(values[250][0],'');assert.equal(values[251][0],'fixture-252');assert.equal(values[404][0],'fixture-405');assert.equal(queries(f).length,2);assert.equal(queries(f)[1].body.structuredQuery.startAt.values[0].integerValue,'250');
});

test('duplicate, out-of-order and repeated previous-page documents are rejected at query boundaries',()=>{
 for(const malformed of ['duplicate','reverse','previous-page']){const f=fixture(),original=f.c.UrlFetchApp.fetch;let queriesSeen=0;for(let row=4;row<=253;row++)f.row(row,['fixture-'+row]);f.c.UrlFetchApp.fetch=(url,options)=>{const response=original(url,options);if(!url.endsWith(':runQuery'))return response;const result=JSON.parse(response.getContentText());queriesSeen++;if(malformed==='duplicate'&&queriesSeen===1)result[1]=copy(result[0]);if(malformed==='reverse'&&queriesSeen===1)result.reverse();if(malformed==='previous-page'&&queriesSeen===2){const row=f.docs.get(f.base+f.root+'/tables/1/rows/00000250');result[0]={document:copy(row)};}return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(result)};};const sheet=f.open().getSheetByName('2期目マッチングDB');fail(()=>sheet.getRange(1,1,253,1).getValues(),'SCHEMA_MISMATCH');}
});

test('roster-only reads prefetch no business table definitions and business prefetch excludes the loaded roster',()=>{
 const f=accountFixture(),book=f.open();book.getSheetByName('_NODE_players').getRange(1,1,2,9).getValues();const metadata=f.calls.filter(call=>call.url.endsWith(':batchGet')&&call.body.transaction&&call.body.documents.some(name=>name.includes('/tables/')));assert.equal(metadata.length,1);assert.deepEqual(metadata[0].body.documents,[f.base+f.root+'/tables/9']);assert.deepEqual(Object.keys(book.tableDocuments),['9']);const before=f.calls.length;f.c.firestoreVerifyBook_(book);assert.ok(f.calls.slice(before).every(call=>!call.body?.documents?.some(name=>name.includes('/tables/1')||name.includes('/tables/2'))));book.getSheetByName('2期目マッチングDB');const batch=batches(f).filter(call=>call.body.transaction).at(-1);assert.equal(batch.body.documents.length,2);assert.ok(batch.body.documents.includes(f.base+f.root+'/tables/1'));assert.ok(batch.body.documents.includes(f.base+f.root+'/tables/2'));assert.equal(batch.body.documents.includes(f.base+f.root+'/tables/9'),false);
});

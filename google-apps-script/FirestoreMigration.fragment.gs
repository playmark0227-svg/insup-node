/* Owner-only, resumable migration. The original workbook is read, never changed.
 * Normal app requests cannot call these editor functions. Authentication stays in
 * Script Properties; neither password hashes nor secrets enter the import. */
var FIRESTORE_MIGRATION_KEY='NODE_FIRESTORE_MIGRATION_STATE';
var FIRESTORE_MIGRATION_TARGET_KEY='NODE_FIRESTORE_MIGRATION_TARGET';
var FIRESTORE_MIGRATION_CONFIRM_KEY='NODE_FIRESTORE_MIGRATION_CONFIRM';

function firestoreMigrationState_(){
  var raw=props_().getProperty(FIRESTORE_MIGRATION_KEY);if(!raw)return null;
  try{var state=JSON.parse(raw);if(!state||['prepared','importing','ready','verified','active','abandoned'].indexOf(state.phase)<0)throw new Error('state');return state;}
  catch(error){fail_('MIGRATION_STATE','Firebase移行状態を確認してください。安全のため保存を停止しています。');}
}
function firestoreMigrationFrozen_(){var state=firestoreMigrationState_();return !!state&&(['prepared','importing','ready','verified'].indexOf(state.phase)>=0||state.phase==='active'&&props_().getProperty('NODE_STORAGE_PROVIDER')!=='firestore');}
function firestoreMigrationTarget_(){
  var raw=props_().getProperty(FIRESTORE_MIGRATION_TARGET_KEY),target;
  try{target=JSON.parse(raw||'null');}catch(error){target=null;}
  if(!target||Object.keys(target).some(function(key){return ['projectId','databaseId'].indexOf(key)<0;})||typeof target.projectId!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(target.projectId)||target.databaseId!==undefined&&target.databaseId!=='(default)'&&!/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(target.databaseId))fail_('FIRESTORE_NOT_CONFIGURED','移行先プロジェクトを NODE_FIRESTORE_MIGRATION_TARGET に設定してください。');
  return {projectId:target.projectId,databaseId:target.databaseId||'(default)'};
}
function firestoreMigrationReset_(){if(typeof firestoreClose_==='function')firestoreClose_();if(typeof firestoreReset_==='function')firestoreReset_();}
function firestoreMigrationPlain_(value){
  if(value instanceof Date){if(!isFinite(value.getTime()))fail_('MIGRATION_SOURCE','無効な日付があるため移行を停止しました。');return {$nodeDate:value.toISOString()};}
  if(value===undefined||value===null)return '';
  if(typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&isFinite(value))return value;
  fail_('MIGRATION_SOURCE','移行元に対応していないセル値があります。');
}
/* All migration callers pass JSON-compatible objects. Count their serialized
 * UTF-8 bytes locally instead of creating a service Blob for every source row.
 * Preserve the previous service behavior for a raw unpaired surrogate; normal
 * JSON.stringify escapes it and never needs this compatibility fallback. */
function firestoreMigrationUtf8Length_(value){
  var text=typeof value==='string'?value:JSON.stringify(value),bytes=0;
  if(typeof text!=='string')fail_('MIGRATION_SOURCE','移行元の保存サイズを確認できませんでした。');
  for(var i=0;i<text.length;i++){
    var code=text.charCodeAt(i);
    if(code<128)bytes++;
    else if(code<2048)bytes+=2;
    else if(code>=55296&&code<=56319){var next=i+1<text.length?text.charCodeAt(i+1):0;if(next>=56320&&next<=57343){bytes+=4;i++;}else return Utilities.newBlob(text).getBytes().length;}
    else if(code>=56320&&code<=57343)return Utilities.newBlob(text).getBytes().length;
    else bytes+=3;
  }
  return bytes;
}
function firestoreMigrationSummary_(state,extra){
  var result={phase:state.phase,sourceHash:state.sourceHash,tableCount:state.counts.tableCount,rowDocumentCount:state.counts.rowDocumentCount,recordIdCount:state.counts.recordIdCount,operationCount:state.counts.operationCount};
  if(state.cursor!==undefined)result.documentsImported=state.cursor;
  Object.keys(extra||{}).forEach(function(key){result[key]=extra[key];});Logger.log(JSON.stringify(result));return result;
}
function firestoreMigrationConfirm_(expected){if(props_().getProperty(FIRESTORE_MIGRATION_CONFIRM_KEY)!==expected)fail_('MIGRATION_CONFIRM_REQUIRED','確認したハッシュに対応する移行確認値を設定してください。');}
/* Stopping writes is an operational switch, not a new data destination. All
 * other source/owner/authorization fields stay bound to the migration seal. */
function firestoreRuntimeConfigHash_(config){var binding={};Object.keys(config).forEach(function(key){if(key!=='writesEnabled')binding[key]=config[key];});return hash_(stableJson_(binding));}
/* Metadata is one Advanced Sheets RPC, not a chain of remote getter calls per entry.
 * Search visibility/location are intentionally not restricted: preserve DOCUMENT and
 * all PROJECT metadata visible to this Apps Script project. No partial fallback. */
function firestoreMigrationMetadata_(bookId,catalog){
  var response;try{response=Sheets.Spreadsheets.DeveloperMetadata.search({dataFilters:[{developerMetadataLookup:{}}]},bookId);}catch(_){fail_('SHEET_READ_FAILED','移行元の管理IDを一括取得できませんでした。権限とSheets APIを確認してください。元データは変更していません。');}
  function object(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(function(key){return keys.indexOf(key)>=0;});}
  if(!object(response,['matchedDeveloperMetadata'])||response.matchedDeveloperMetadata!==undefined&&!Array.isArray(response.matchedDeveloperMetadata))fail_('METADATA_CONFLICT','管理IDの一括応答を確認できませんでした。');
  var items=response.matchedDeveloperMetadata||[],rowMetadata=Object.create(null),tableMetadata=Object.create(null),legacyMetadata=[],ids=Object.create(null),maxId=0;
  var entries=items.map(function(item){
    if(!object(item,['developerMetadata','dataFilters'])||!object(item.developerMetadata,['metadataId','metadataKey','metadataValue','visibility','location']))fail_('METADATA_CONFLICT','対応していない管理IDの保存形式があります。');
    var raw=item.developerMetadata,id=raw.metadataId,key=raw.metadataKey,hasValue=Object.prototype.hasOwnProperty.call(raw,'metadataValue'),value=hasValue?raw.metadataValue:null,location=raw.location;
    if(!Number.isSafeInteger(id)||id<1||id>2147483647||ids[id]||typeof key!=='string'||!key||hasValue&&typeof value!=='string'||['DOCUMENT','PROJECT'].indexOf(raw.visibility)<0)fail_('METADATA_CONFLICT','管理IDの形式・重複・公開範囲を確認してください。');ids[id]=true;maxId=Math.max(maxId,id);
    if(!object(location,['locationType','dimensionRange','sheetId','spreadsheet']))fail_('METADATA_CONFLICT','管理IDの位置情報を確認してください。');
    var locations=['dimensionRange','sheetId','spreadsheet'].filter(function(k){return Object.prototype.hasOwnProperty.call(location,k);});if(locations.length!==1)fail_('METADATA_CONFLICT','管理IDの位置が一つに特定できません。');
    var type,sheetId,row;
    if(locations[0]==='dimensionRange'){
      var range=location.dimensionRange;type='ROW';if(!object(range,['sheetId','dimension','startIndex','endIndex'])||range.dimension!=='ROWS')fail_('METADATA_CONFLICT','行以外の管理IDは移行前に確認が必要です。');
      var start=range.startIndex===undefined?0:range.startIndex,end=range.endIndex;sheetId=range.sheetId;
      if(!Number.isSafeInteger(sheetId)||sheetId<0||!Object.prototype.hasOwnProperty.call(catalog,sheetId)||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(end)||end!==start+1||end>catalog[sheetId].rowCount)fail_('METADATA_CONFLICT','管理IDの行位置・行数・表を確認してください。');row=start+1;
      if(['__proto__','constructor','prototype'].indexOf(key)>=0)fail_('METADATA_CONFLICT','対応していない管理IDのキーがあります。');
    }else if(locations[0]==='sheetId'){
      type='SHEET';sheetId=location.sheetId;if(!Number.isSafeInteger(sheetId)||sheetId<0||!Object.prototype.hasOwnProperty.call(catalog,sheetId))fail_('METADATA_CONFLICT','管理IDが関連する表を確認できません。');
    }else {type='SPREADSHEET';if(location.spreadsheet!==true)fail_('METADATA_CONFLICT','管理IDのブック位置を確認できません。');}
    if(location.locationType!==undefined&&location.locationType!==type)fail_('METADATA_CONFLICT','管理IDの位置と種類が一致しません。');
    return {entry:{metadataId:id,key:key,value:value,visibility:raw.visibility},type:type,sheetId:sheetId,row:row};
  });
  // The API does not promise response order. Canonical IDs avoid false source
  // changes between identical reads; row object ordering is already stableJson_.
  entries.sort(function(a,b){return a.entry.metadataId-b.entry.metadataId;}).forEach(function(item){var entry=item.entry;
    if(item.type==='ROW'){var key=item.sheetId+':'+item.row,map=rowMetadata[key]||(rowMetadata[key]=Object.create(null));if(Object.prototype.hasOwnProperty.call(map,entry.key))fail_('METADATA_CONFLICT','同じ行に同じキーの管理IDが複数あります。元データを変更せず停止しました。');map[entry.key]={value:entry.value,metadataId:entry.metadataId,visibility:entry.visibility};}
    else if(item.type==='SHEET')(tableMetadata[item.sheetId]||(tableMetadata[item.sheetId]=[])).push(entry);else legacyMetadata.push(entry);
  });
  return {rowMetadata:rowMetadata,tableMetadata:tableMetadata,legacyMetadata:legacyMetadata,maxMetadataId:maxId,metadataCount:items.length};
}
/* Up to four bounded ranges per RPC, capped at 64k cells. The returned grid has
 * exactly the same original row/column positions and raw cell JSON as before. */
function firestoreMigrationGrid_(bookId,info,end,width,stats){
  var grid=[],chunk=Math.min(200,Math.max(1,Math.floor(64000/width))),perCall=Math.max(1,Math.min(4,Math.floor(64000/(chunk*width))));
  for(var start=1;start<=end;){var ranges=[],expected=Object.create(null),batchStart=start,batchEnd=start-1;
    for(var n=0;n<perCall&&start<=end;n++){var finish=Math.min(end,start+chunk-1);expected[start-1]={end:finish,seen:false};ranges.push("'"+info.title.replace(/'/g,"''")+"'!A"+start+':'+columnName_(width)+finish);batchEnd=finish;start=finish+1;}
    var response;if(stats)stats.gridRequests++;try{response=Sheets.Spreadsheets.get(bookId,{ranges:ranges,fields:'sheets(properties(sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,dataValidation,userEnteredFormat(numberFormat),chipRuns,note))))'});}catch(_){fail_('SHEET_READ_FAILED','移行元のセル情報を一括取得できませんでした。元データは変更していません。');}
    if(!response||!Array.isArray(response.sheets)||response.sheets.length!==1||!response.sheets[0].properties||response.sheets[0].properties.sheetId!==info.id||!Array.isArray(response.sheets[0].data)||response.sheets[0].data.length!==ranges.length||firestoreMigrationUtf8Length_(response)>12000000)fail_('SHEET_READ_FAILED','移行元のセル情報・応答サイズを確認できませんでした。');
    response.sheets[0].data.forEach(function(part){
      if(!part||typeof part!=='object'||Array.isArray(part)||part.rowData!==undefined&&!Array.isArray(part.rowData))fail_('SHEET_READ_FAILED','移行元のセル情報の形式を確認できませんでした。');
      var baseRow=part.startRow===undefined?0:part.startRow,baseColumn=part.startColumn===undefined?0:part.startColumn;
      if(!Number.isSafeInteger(baseRow)||baseRow<0||!Number.isSafeInteger(baseColumn)||baseColumn!==0||!Object.prototype.hasOwnProperty.call(expected,baseRow)||expected[baseRow].seen)fail_('SHEET_READ_FAILED','要求した範囲のセル情報が欠落・重複しています。');var block=expected[baseRow];block.seen=true;
      (part.rowData||[]).forEach(function(row,index){var target=baseRow+index;if(target<baseRow||target>=block.end||!row||typeof row!=='object'||Array.isArray(row)||row.values!==undefined&&!Array.isArray(row.values)||(row.values||[]).length+baseColumn>width)fail_('SHEET_READ_FAILED','移行元のセル範囲を確認できませんでした。');var cells=grid[target]||(grid[target]=[]);
        (row.values||[]).forEach(function(cell,column){var c=baseColumn+column;if(!cell||typeof cell!=='object'||Array.isArray(cell)||cells[c]!==undefined)fail_('SHEET_READ_FAILED','移行元のセル情報が重複、または不正な形式です。');cells[c]=cell;});
      });
    });
    if(Object.keys(expected).some(function(key){return !expected[key].seen;}))fail_('SHEET_READ_FAILED','要求した範囲のセル情報をすべて確認できませんでした。');
  }
  return grid;
}
function firestoreMigrationSource_(config){
  var readStarted=Date.now();
  if(config.spreadsheetId===NODE.originalId)fail_('PROTECTED_SOURCE','原本からの移行は実行しません。登録済みの管理コピーを使ってください。');
  assertManagedBook_(config.spreadsheetId);
  // This one-off migration deliberately addresses the old Sheets source even
  // when recovering a partially applied provider switch. It has no write calls.
  var book=SpreadsheetApp.openById(config.spreadsheetId);if(book.getSpreadsheetTimeZone()!=='Asia/Tokyo')fail_('TIMEZONE','移行元のタイムゾーンを確認してください。');
  var tabs=resolveBusinessTabs_(book);if(tabs.matchingSheetId!==Number(config.matchingSheetId)||tabs.kpiSheetId!==Number(config.kpiSheetId))fail_('SCHEMA_MISMATCH','移行元の業務タブIDが設定と一致しません。');
  var bookId=book.getId(),sheets=book.getSheets().slice().sort(function(a,b){return a.getSheetId()-b.getSheetId();}),catalog=Object.create(null);
  sheets.forEach(function(sheet){var id=sheet.getSheetId(),info={id:id,sheet:sheet,title:sheet.getName(),lastRow:sheet.getLastRow(),lastColumn:sheet.getLastColumn(),rowCount:sheet.getMaxRows(),columnCount:sheet.getMaxColumns()};if(!Number.isSafeInteger(id)||id<0||Object.prototype.hasOwnProperty.call(catalog,id)||typeof info.title!=='string'||!info.title||!Number.isSafeInteger(info.rowCount)||info.rowCount<1||!Number.isSafeInteger(info.columnCount)||info.columnCount<1||!Number.isSafeInteger(info.lastRow)||info.lastRow<0||info.lastRow>info.rowCount||!Number.isSafeInteger(info.lastColumn)||info.lastColumn<0||info.lastColumn>info.columnCount)fail_('MIGRATION_SOURCE','移行元の表の範囲を確認してください。');catalog[id]=info;});
  var metadata=firestoreMigrationMetadata_(bookId,catalog),rowMetadata=metadata.rowMetadata,tableMetadata=metadata.tableMetadata,legacyMetadata=metadata.legacyMetadata,maxMetadataId=metadata.maxMetadataId,readStats={metadataCount:metadata.metadataCount,gridRequests:0,elapsedMs:0};
  var tables=[],documents=[],cellCount=0,counts={tableCount:0,rowDocumentCount:0,recordIdCount:0,operationCount:0};
  sheets.forEach(function(sheet){
    var id=sheet.getSheetId(),info=catalog[id],lastRow=info.lastRow,lastColumn=info.lastColumn,rowCount=info.rowCount,columnCount=info.columnCount,rowsWithMetadata=Object.keys(rowMetadata).filter(function(key){return key.indexOf(id+':')===0;}).map(function(key){return Number(key.slice(String(id).length+1));});
    if(rowsWithMetadata.some(function(row){return row>rowCount;}))fail_('METADATA_CONFLICT','管理IDの行位置が元の表を超えています。');
    var end=Math.max(lastRow,rowsWithMetadata.length?Math.max.apply(null,rowsWithMetadata):0),width=Math.max(1,lastColumn);
    cellCount+=end*width;if(cellCount>2000000||end>50000||columnCount>1000||tables.length>=200)fail_('MIGRATION_LIMIT','元データが一度に検証できる上限を超えています。分割移行を確認してください。');
    var table={sheetId:id,title:info.title,rowCount:rowCount,columnCount:columnCount,lastRow:lastRow,lastColumn:lastColumn,legacyMetadata:tableMetadata[id]||[]};
    tables.push(table);documents.push({path:'tables/'+id,data:table});
    var values=end?sheet.getRange(1,1,end,width).getValues():[],formulas=end?sheet.getRange(1,1,end,width).getFormulas():[],grid=[];
    // Only this optional scan bound is derived. All rows, formulas and raw cells
    // remain in the import and its hash; missing bounds still mean a full scan.
    if(id===Number(config.matchingSheetId)){var identityBound=Math.min(40,rowCount);values.forEach(function(row,index){if(normalizeName_(row[2]))identityBound=Math.max(identityBound,index+1);});table.identityReadBound=Math.min(rowCount,identityBound);}
    grid=firestoreMigrationGrid_(bookId,info,end,width,readStats);
    for(var row=1;row<=end;row++){
      var rowValues=(values[row-1]||[]).map(firestoreMigrationPlain_),rowFormulas=(formulas[row-1]||[]).map(function(value){return String(value||'');}),cells=Array.from({length:width},function(_,column){return grid[row-1]&&grid[row-1][column]||{};}),metadata=rowMetadata[id+':'+row]||{};
      var payload={values:rowValues,formulas:rowFormulas,cells:cells,metadata:metadata};
      if(!rowValues.some(function(value){return value!=='';})&&!rowFormulas.some(Boolean)&&!cells.some(function(cell){return Object.keys(cell).length>0;})&&!Object.keys(metadata).length)continue;
      var data={row:row,hasMetadata:!!Object.keys(metadata).length,payload:stableJson_(payload)};
      if(firestoreMigrationUtf8Length_(data)>880000)fail_('MIGRATION_LIMIT','1行の保存サイズが大きいため移行を停止しました。元データは変更していません。');
      documents.push({path:'tables/'+id+'/rows/'+('00000000'+row).slice(-8),data:data});counts.rowDocumentCount++;
      if(metadata[NODE.recordKey])counts.recordIdCount++;
      if(info.title===NODE.operationsTab&&row>1&&rowValues[0]!==''&&!rowFormulas[0])counts.operationCount++;
    }
  });
  counts.tableCount=tables.length;var sourceConfigHash=hash_(stableJson_(config)),runtimeConfigHash=firestoreRuntimeConfigHash_(config),sourceHash=hash_(stableJson_([book.getId(),book.getName(),book.getSpreadsheetTimeZone(),sourceConfigHash,runtimeConfigHash,tables,legacyMetadata,documents]));
  var manifest={schemaVersion:1,revision:0,title:book.getName(),timeZone:book.getSpreadsheetTimeZone(),sourceSpreadsheetId:book.getId(),sourceConfigHash:sourceConfigHash,runtimeConfigHash:runtimeConfigHash,tables:tables.map(function(table){return {sheetId:table.sheetId,title:table.title};}),nextMetadataId:maxMetadataId+1,legacyMetadata:legacyMetadata};
  if(firestoreMigrationUtf8Length_(manifest)>880000)fail_('MIGRATION_LIMIT','移行目録が保存上限を超えています。');
  readStats.elapsedMs=Date.now()-readStarted;return {sourceHash:sourceHash,sourceConfigHash:sourceConfigHash,runtimeConfigHash:runtimeConfigHash,counts:counts,manifest:manifest,documents:documents,readStats:readStats};
}
/* Editor-only connectivity probe. The fixed metadata GET has no documents path,
 * no transaction/import write, and never logs project names or provider bodies. */
function verifyNodeFirestoreAccess(){
  var owner=requireOwner_(),target=firestoreMigrationTarget_(),name='projects/'+target.projectId+'/databases/'+target.databaseId,url='https://firestore.googleapis.com/v1/projects/'+target.projectId+'/databases/'+encodeURIComponent(target.databaseId),response,status,text;
  try{response=UrlFetchApp.fetch(url,{method:'get',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true,followRedirects:false});status=response.getResponseCode();text=response.getContentText();}catch(_){fail_('FIRESTORE_ACCESS_FAILED','Firebaseの接続を確認できませんでした。元データは変更していません。');}
  if(status===401||status===403)fail_('FIRESTORE_ACCESS_DENIED','Firebaseの読み取り権限、またはGoogleの再認証を確認してください。元データは変更していません。');
  if(status===404)fail_('FIRESTORE_NOT_CONFIGURED','指定したFirebaseデータベースが見つかりません。設定を確認してください。');
  if(status===429)fail_('RATE_LIMITED','Firebaseの接続確認が集中しています。時間をおいて再確認してください。');
  if(status!==200||typeof text!=='string'||text.length>100000)fail_('FIRESTORE_ACCESS_FAILED','Firebaseの接続確認を完了できませんでした。元データは変更していません。');
  var data;try{data=JSON.parse(text);}catch(_){fail_('FIRESTORE_ACCESS_FAILED','Firebaseの接続応答を確認できませんでした。');}
  if(!data||typeof data!=='object'||Array.isArray(data)||data.name!==name||typeof data.locationId!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(data.locationId)||data.type!=='FIRESTORE_NATIVE')fail_('FIRESTORE_ACCESS_FAILED','Firebaseのデータベース形式・地域を確認してください。');
  if(requireOwner_()!==owner||stableJson_(firestoreMigrationTarget_())!==stableJson_(target))fail_('BUSY','接続確認中に設定が変わりました。もう一度確認してください。');
  var result={verified:true,readOnly:true,locationId:data.locationId,type:data.type};Logger.log(JSON.stringify({locationId:result.locationId,type:result.type}));return result;
}
function firestoreMigrationBinding_(state){return {projectId:state.target.projectId,databaseId:state.target.databaseId,workbookId:state.target.workbookId,sourceSpreadsheetId:state.sourceSpreadsheetId,sourceConfigHash:state.sourceConfigHash,runtimeConfigHash:state.runtimeConfigHash,sourceHash:state.sourceHash,importId:state.importId};}
function firestoreMigrationSeal_(state){var pepper=props_().getProperty(NODE.pepperKey);if(!pepper)fail_('NOT_CONFIGURED','認証設定が未完了のため移行できません。');return hmac_(stableJson_(firestoreMigrationBinding_(state)),pepper);}
function firestoreMigrationProof_(state,phase){return Object.assign({state:phase,preparedAt:state.preparedAt,verifiedAt:state.verifiedAt||'',seal:firestoreMigrationSeal_(state)},firestoreMigrationBinding_(state),state.counts);}
function firestoreMigrationAssertCurrent_(state,source,config,owner){
  if(requireOwner_()!==owner||state.ownerEmail!==owner)fail_('FORBIDDEN','移行の実行者が変わりました。');
  if(stableJson_(config_())!==stableJson_(config)||hash_(stableJson_(config))!==state.sourceConfigHash||source.sourceHash!==state.sourceHash)fail_('MIGRATION_SOURCE_CHANGED','移行元または接続設定が変わりました。元データへ書かずに停止しました。旧接続へ戻す場合は移行を中止してください。');
}
function firestoreMigrationWrite_(target,writes){
  if(!writes.length)return;var body={writes:writes};if(firestoreMigrationUtf8Length_(body)>8000000)fail_('MIGRATION_LIMIT','移行バッチが大きすぎます。');
  var result=firestoreRequest_('post',':commit',body,target);if(!result||!Array.isArray(result.writeResults)||result.writeResults.length!==writes.length)fail_('INTERNAL','移行の保存結果を確認できません。入力を変えずに同じ移行を再実行してください。');return result;
}
function firestoreMigrationDocument_(target,path,data,precondition){var result={update:{name:firestoreDocumentName_(target,'nodeWorkbooks/'+target.workbookId+(path?'/'+path:'')),fields:firestoreEncodeFields_(data)}};if(precondition)result.currentDocument=precondition;return result;}
function firestoreMigrationRead_(target,path){return firestoreRequest_('get','nodeWorkbooks/'+target.workbookId+(path?'/'+path:''),undefined,target);}
function previewNodeFirestoreMigration(){
  firestoreMigrationReset_();var owner=requireOwner_(),config=config_();if(props_().getProperty('NODE_STORAGE_PROVIDER')==='firestore')fail_('MIGRATION_ALREADY_ACTIVE','Firebaseへの切替は完了しています。');
  var source=firestoreMigrationSource_(config);if(requireOwner_()!==owner||stableJson_(config_())!==stableJson_(config))fail_('BUSY','確認中に設定が変わりました。');return firestoreMigrationSummary_({phase:'preview',sourceHash:source.sourceHash,counts:source.counts},{readOnly:true,readStats:source.readStats,prepareConfirmation:'PREPARE:'+source.sourceHash});
}
function prepareNodeFirestoreMigration(){
  firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),config=config_();if(props_().getProperty('NODE_STORAGE_PROVIDER')==='firestore')fail_('MIGRATION_ALREADY_ACTIVE','Firebaseへの切替は完了しています。');var source=firestoreMigrationSource_(config),target=firestoreMigrationTarget_(),old=firestoreMigrationState_();
    firestoreMigrationConfirm_('PREPARE:'+source.sourceHash);
    if(old&&old.phase!=='abandoned'){if(old.sourceHash!==source.sourceHash||old.target.projectId!==target.projectId||old.target.databaseId!==target.databaseId)fail_('MIGRATION_IN_PROGRESS','別の移行が進行中です。先に状態を確認してください。');return firestoreMigrationSummary_(old,{frozen:true});}
    var id=Utilities.getUuid().replace(/-/g,''),state={phase:'prepared',importId:id,target:Object.assign({},target,{workbookId:'migration-'+id}),ownerEmail:owner,sourceSpreadsheetId:config.spreadsheetId,sourceConfigHash:source.sourceConfigHash,runtimeConfigHash:source.runtimeConfigHash,sourceHash:source.sourceHash,counts:source.counts,cursor:0,preparedAt:new Date().toISOString()};
    if(requireOwner_()!==owner||stableJson_(config_())!==stableJson_(config))fail_('BUSY','確認中に設定が変わりました。');props_().setProperty(FIRESTORE_MIGRATION_KEY,JSON.stringify(state));return firestoreMigrationSummary_(state,{frozen:true});
  });
}
function importNodeFirestoreMigration(){
  firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_(),config=config_();if(!state||['prepared','importing','ready'].indexOf(state.phase)<0)fail_('MIGRATION_STATE','先に移行準備を実行してください。');if(state.phase==='ready')return firestoreMigrationSummary_(state,{frozen:true});
    var source=firestoreMigrationSource_(config);firestoreMigrationAssertCurrent_(state,source,config,owner);
    if(state.phase==='prepared'){
      var manifest=Object.assign({},source.manifest,{migrationProof:firestoreMigrationProof_(state,'importing')}),existing=firestoreMigrationRead_(state.target,'');if(existing){if(stableJson_(firestoreDecodeFields_(existing.fields))!==stableJson_(manifest))fail_('MIGRATION_VERIFY_FAILED','移行先に異なるデータがあります。上書きせず停止しました。');}else firestoreMigrationWrite_(state.target,[firestoreMigrationDocument_(state.target,'',manifest,{exists:false})]);state.phase='importing';props_().setProperty(FIRESTORE_MIGRATION_KEY,JSON.stringify(state));
    }
    var start=state.cursor,end=Math.min(source.documents.length,start+400);
    for(var cursor=start;cursor<end;){var batch=[],bytes=0;
      while(cursor<end&&batch.length<80){var item=source.documents[cursor],write=firestoreMigrationDocument_(state.target,item.path,item.data),size=firestoreMigrationUtf8Length_(write);if(batch.length&&bytes+size>6000000)break;batch.push(write);bytes+=size;cursor++;}
      firestoreMigrationWrite_(state.target,batch);state.cursor=cursor;props_().setProperty(FIRESTORE_MIGRATION_KEY,JSON.stringify(state));
    }
    if(state.cursor===source.documents.length){var current=firestoreMigrationRead_(state.target,''),manifest=firestoreDecodeFields_(current.fields);manifest.migrationProof=firestoreMigrationProof_(state,'ready');firestoreMigrationWrite_(state.target,[firestoreMigrationDocument_(state.target,'',manifest,{updateTime:current.updateTime})]);state.phase='ready';props_().setProperty(FIRESTORE_MIGRATION_KEY,JSON.stringify(state));}
    return firestoreMigrationSummary_(state,{frozen:true,more:state.phase!=='ready'});
  });
}
function firestoreMigrationVerifyTarget_(state,source,activation){
    var current=firestoreMigrationRead_(state.target,'');if(!current)fail_('MIGRATION_VERIFY_FAILED','Firebaseの移行目録がありません。保存先は切り替えていません。');var manifest=firestoreDecodeFields_(current.fields),expected=Object.assign({},source.manifest,{migrationProof:manifest.migrationProof});
    if(stableJson_(manifest)!==stableJson_(expected)||!manifest.migrationProof||(activation?['verified','active']:['ready','verified']).indexOf(manifest.migrationProof.state)<0||stableJson_(manifest.migrationProof)!==stableJson_(firestoreMigrationProof_(state,manifest.migrationProof.state)))fail_('MIGRATION_VERIFY_FAILED','Firebaseの移行目録が一致しません。保存先は切り替えていません。');
    var expectedRows={},seenRows={},rowCount=0;
    source.documents.forEach(function(item){if(item.path.indexOf('/rows/')<0){var document=firestoreMigrationRead_(state.target,item.path);if(!document)fail_('MIGRATION_VERIFY_FAILED','Firebaseの移行表が不足しています。');if(stableJson_(firestoreDecodeFields_(document.fields))!==stableJson_(item.data))fail_('MIGRATION_VERIFY_FAILED','Firebaseの移行表が元データと一致しません。');}else expectedRows[firestoreDocumentName_(state.target,'nodeWorkbooks/'+state.target.workbookId+'/'+item.path)]=item.data;});
    source.manifest.tables.forEach(function(table){var pageToken='',pages=0;do{
      var path='nodeWorkbooks/'+state.target.workbookId+'/tables/'+table.sheetId+'/rows?pageSize=300'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''),page=firestoreRequest_('get',path,undefined,state.target);
      if(!page||page.documents!==undefined&&!Array.isArray(page.documents)||++pages>200)fail_('MIGRATION_VERIFY_FAILED','Firebaseの移行一覧を検証できませんでした。');
      (page.documents||[]).forEach(function(document){if(!expectedRows[document.name]||seenRows[document.name]||stableJson_(firestoreDecodeFields_(document.fields))!==stableJson_(expectedRows[document.name]))fail_('MIGRATION_VERIFY_FAILED','Firebaseの行が不足・重複・変更されています。保存先は切り替えていません。');seenRows[document.name]=true;rowCount++;});
      var next=page.nextPageToken||'';if(typeof next!=='string'||next===pageToken&&next)fail_('MIGRATION_VERIFY_FAILED','Firebaseの表示位置が不正です。');pageToken=next;
    }while(pageToken);});
    if(rowCount!==source.counts.rowDocumentCount)fail_('MIGRATION_VERIFY_FAILED','Firebaseの行件数が元データと一致しません。保存先は切り替えていません。');
    return {current:current,manifest:manifest};
}
function verifyNodeFirestoreMigration(){
  firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_(),config=config_();if(!state||['ready','verified'].indexOf(state.phase)<0)fail_('MIGRATION_STATE','原文の取り込みを完了してから検証してください。');var source=firestoreMigrationSource_(config);firestoreMigrationAssertCurrent_(state,source,config,owner);
    var verified=firestoreMigrationVerifyTarget_(state,source,false),current=verified.current,manifest=verified.manifest;
    // Re-read the source after all remote reads: a manual Sheets edit is outside
    // the script lock and must invalidate a verification that ran across it.
    var after=firestoreMigrationSource_(config);firestoreMigrationAssertCurrent_(state,after,config,owner);state.phase='verified';state.verifiedAt=new Date().toISOString();manifest.migrationProof=firestoreMigrationProof_(state,'verified');firestoreMigrationWrite_(state.target,[firestoreMigrationDocument_(state.target,'',manifest,{updateTime:current.updateTime})]);props_().setProperty(FIRESTORE_MIGRATION_KEY,JSON.stringify(state));return firestoreMigrationSummary_(state,{verified:true,frozen:true,activateConfirmation:'ACTIVATE:'+state.sourceHash});
  });
}
function activateNodeFirestoreMigration(){
  firestoreMigrationReset_();try{return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_(),config=config_();if(!state||['verified','active'].indexOf(state.phase)<0)fail_('MIGRATION_STATE','移行データの検証を完了してから切り替えてください。');firestoreMigrationConfirm_('ACTIVATE:'+state.sourceHash);if(state.phase==='active'){
      if(state.ownerEmail!==owner||state.runtimeConfigHash!==firestoreRuntimeConfigHash_(config))fail_('MIGRATION_VERIFY_FAILED','切替済みの保存先設定が一致しません。');
      var active=firestoreMigrationRead_(state.target,''),activeManifest=active&&firestoreDecodeFields_(active.fields),proof=activeManifest&&activeManifest.migrationProof;
      if(!activeManifest||activeManifest.sourceSpreadsheetId!==state.sourceSpreadsheetId||activeManifest.sourceConfigHash!==state.sourceConfigHash||activeManifest.runtimeConfigHash!==state.runtimeConfigHash||!Number.isSafeInteger(activeManifest.revision)||activeManifest.revision<0||!proof||proof.state!=='active'||stableJson_(firestoreMigrationBinding_(state))!==stableJson_(firestoreMigrationBinding_({target:{projectId:proof.projectId,databaseId:proof.databaseId,workbookId:proof.workbookId},sourceSpreadsheetId:proof.sourceSpreadsheetId,sourceConfigHash:proof.sourceConfigHash,runtimeConfigHash:proof.runtimeConfigHash,sourceHash:proof.sourceHash,importId:proof.importId}))||!constantEqual_(proof.seal,firestoreMigrationSeal_(state)))fail_('MIGRATION_VERIFY_FAILED','切替済みのFirebase移行証明を確認できません。');
      var currentProvider=props_().getProperty('NODE_STORAGE_PROVIDER'),currentTarget=props_().getProperty('NODE_FIRESTORE_CONFIG');
      if(currentProvider!=='firestore'||currentTarget!==JSON.stringify(state.target))props_().setProperties({NODE_FIRESTORE_CONFIG:JSON.stringify(state.target),NODE_STORAGE_PROVIDER:'firestore',NODE_FIRESTORE_MIGRATION_STATE:JSON.stringify(state)});
      firestoreMigrationReset_();if(!firestoreMigrationReady_(config))fail_('MIGRATION_VERIFY_FAILED','有効な保存先を確認できません。');return firestoreMigrationSummary_(state,{active:true});
    }var source=firestoreMigrationSource_(config);firestoreMigrationAssertCurrent_(state,source,config,owner);
    var verified=firestoreMigrationVerifyTarget_(state,source,true),current=verified.current,manifest=verified.manifest;
    var after=firestoreMigrationSource_(config);firestoreMigrationAssertCurrent_(state,after,config,owner);
    manifest.migrationProof=firestoreMigrationProof_(state,'active');firestoreMigrationWrite_(state.target,[firestoreMigrationDocument_(state.target,'',manifest,{updateTime:current.updateTime})]);state.phase='active';state.activatedAt=new Date().toISOString();props_().setProperties({NODE_FIRESTORE_CONFIG:JSON.stringify(state.target),NODE_STORAGE_PROVIDER:'firestore',NODE_FIRESTORE_MIGRATION_STATE:JSON.stringify(state)});firestoreMigrationReset_();if(!firestoreMigrationReady_(config))fail_('MIGRATION_VERIFY_FAILED','切替後の保存先を確認できません。新しい保存を止めて設定を確認してください。');return firestoreMigrationSummary_(state,{active:true,sourceUnchanged:true});
  });}finally{if(typeof firestoreClose_==='function')firestoreClose_();}
}
function cancelNodeFirestoreMigration(){
  firestoreMigrationReset_();return withLock_(function(){var owner=requireOwner_(),state=firestoreMigrationState_();if(!state||state.phase==='abandoned')return {canceled:true,sourceUnchanged:true};if(state.ownerEmail!==owner)fail_('FORBIDDEN','準備した所有者のみ移行を中止できます。');if(state.phase==='active'||props_().getProperty('NODE_STORAGE_PROVIDER')==='firestore')fail_('MIGRATION_ALREADY_ACTIVE','切替済みのため自動では旧保存先に戻しません。新しい変更を失わないため個別の復旧確認が必要です。');firestoreMigrationConfirm_('CANCEL:'+state.sourceHash);state.phase='abandoned';state.abandonedAt=new Date().toISOString();props_().setProperty(FIRESTORE_MIGRATION_KEY,JSON.stringify(state));return firestoreMigrationSummary_(state,{canceled:true,sourceUnchanged:true});});
}
function firestoreMigrationReady_(config){
  if(props_().getProperty('NODE_STORAGE_PROVIDER')!=='firestore')return false;var state=firestoreMigrationState_();if(!state||state.phase!=='active'||state.sourceSpreadsheetId===NODE.originalId||state.sourceSpreadsheetId!==config.spreadsheetId||state.runtimeConfigHash!==firestoreRuntimeConfigHash_(config))return false;
  var target=firestoreConfig_();if(stableJson_(target)!==stableJson_(state.target))return false;var book=firestoreOpenBook_(config),manifest=book._firestoreManifest;
  if(!manifest||manifest.sourceSpreadsheetId!==config.spreadsheetId||manifest.sourceConfigHash!==state.sourceConfigHash||manifest.runtimeConfigHash!==state.runtimeConfigHash||!manifest.migrationProof)return false;var proof=manifest.migrationProof;
  return proof.state==='active'&&proof.sourceHash===state.sourceHash&&stableJson_(firestoreMigrationBinding_(state))===stableJson_(firestoreMigrationBinding_({target:{projectId:proof.projectId,databaseId:proof.databaseId,workbookId:proof.workbookId},sourceSpreadsheetId:proof.sourceSpreadsheetId,sourceConfigHash:proof.sourceConfigHash,runtimeConfigHash:proof.runtimeConfigHash,sourceHash:proof.sourceHash,importId:proof.importId}))&&constantEqual_(proof.seal,firestoreMigrationSeal_(state));
}

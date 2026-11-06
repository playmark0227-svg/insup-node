/* Private image evidence. Upload-session URLs are capabilities returned once in memory:
 * never put one in a row, property, operation result, export, log, public token or ACL.
 * Routes: beginMatchEvidence -> beginMatchEvidence_ (early wrapper; own budget/commit),
 * completeMatchEvidence -> planCompleteMatchEvidence_ in normal receipt transaction,
 * readMatchEvidence -> readMatchEvidence_ (normal authenticated read budget).
 * Additional OAuth scope: devstorage.read_write. Firebase/Firestore active only.
 */
var MATCH_EVIDENCE_TAB='_NODE_match_evidence';
var MATCH_EVIDENCE_HEADERS=['id','body','version','updatedAt'];
var MATCH_EVIDENCE_MIMES=['image/png','image/jpeg','image/webp'];
var MATCH_EVIDENCE_MAX=5*1024*1024;
var MATCH_EVIDENCE_TTL=30*60*1000;
function matchEvidenceOrigin_(value){if(value!=='https://insupnode.vifight.com'&&value!=='https://playmark0227-svg.github.io')fail_('VALIDATION','この画面からの画像添付は許可されていません。公開アプリを開き直してください。');return value;}
function matchEvidenceStorage_(store){
 if(!nodeUsesFirestore_())fail_('FEATURE_UNAVAILABLE','証拠の保存はFirebaseへの切り替え後に利用できます。下書きは保存できます。');
 var storage=firestoreConfig_(),bucket=props_().getProperty('NODE_FIREBASE_STORAGE_BUCKET');
 if(bucket!==storage.projectId+'.firebasestorage.app'&&bucket!==storage.projectId+'.appspot.com')fail_('FEATURE_UNAVAILABLE','証拠ファイルの保存先を確認してください。下書きは保存できます。');
 if(store&&(!store.book||!store.book.storage||stableJson_(store.book.storage)!==stableJson_(storage)))fail_('FEATURE_UNAVAILABLE','有効なFirebase保存先を確認できません。');
 return {bucket:bucket,namespace:storage.workbookId};
}
function matchEvidenceFeature_(){try{var state=firestoreMigrationState_();if(!state||state.phase!=='active')return false;matchEvidenceStorage_();return true;}catch(_){return false;}}
function matchEvidenceUuid_(id){if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))fail_('VALIDATION','ファイルの保存IDを確認してください。');return id;}
function matchEvidenceTable_(book){
 var state=intakeTable_(book,MATCH_EVIDENCE_TAB,MATCH_EVIDENCE_HEADERS),seen=Object.create(null);
 state.entries=state.rows.map(function(row,index){var p;try{p=JSON.parse(row[1]);}catch(_){fail_('SCHEMA_MISMATCH','証拠ファイルの管理情報を確認してください。');}
  salesObject_(p,['evidenceId','ownerId','recordId','profileId','kind','mime','size','status','generation','createdAt','expiresAt','completedAt','version','updatedAt']);
  matchEvidenceUuid_(p.evidenceId);teamAccount_(p.ownerId);salesId_(p.recordId);salesId_(p.profileId,true);choice_(p.kind,['candidate','client']);choice_(p.mime,MATCH_EVIDENCE_MIMES);choice_(p.status,['pending','completed']);salesId_(p.version);salesStamp_(p.createdAt);salesStamp_(p.expiresAt);salesStamp_(p.updatedAt);salesStamp_(p.completedAt,true);
  if(!Number.isSafeInteger(p.size)||p.size<1||p.size>MATCH_EVIDENCE_MAX||p.status==='pending'&&(p.generation!==''||p.completedAt!=='')||p.status==='completed'&&(!/^[1-9][0-9]{0,29}$/.test(p.generation)||!p.completedAt)||Date.parse(p.expiresAt)-Date.parse(p.createdAt)!==MATCH_EVIDENCE_TTL||row[0]!==p.evidenceId||row[2]!==p.version||row[3]!==p.updatedAt||seen[p.evidenceId])fail_('SCHEMA_MISMATCH','証拠ファイルの状態・期限・保存IDを確認してください。');
  seen[p.evidenceId]=true;p.row=index+2;return p;
 });return state;
}
function matchEvidencePublic_(entry){var result=Object.assign({},entry);delete result.row;return result;}
function matchEvidenceWrite_(store,plan,state,previous,next){next.version=Utilities.getUuid();next.updatedAt=new Date().toISOString();var body=matchEvidencePublic_(next);intakeWritePlan_(store,plan,MATCH_EVIDENCE_TAB,MATCH_EVIDENCE_HEADERS,state,previous?previous.row:state.rows.length+2,[next.evidenceId,JSON.stringify(body),next.version,next.updatedAt]);}
function matchEvidenceRecord_(store,user,entry){var record=findRecord_(store,entry.recordId);actorOwns_(user,record);if(record.playerId!==entry.ownerId||entry.profileId&&(record.profileId||'')!==entry.profileId)fail_('FORBIDDEN','証拠ファイルと候補者の担当・関連が一致しません。');return record;}
function matchEvidenceName_(storage,entry){return 'node-evidence/'+storage.namespace+'/'+matchEvidenceUuid_(entry.evidenceId);}
function matchEvidenceFetch_(method,url,extra){
 if(typeof url!=='string'||!/^https:\/\/storage\.googleapis\.com\/(?:upload\/storage\/v1|storage\/v1)\/b\//.test(url)||/[\r\n#]/.test(url))fail_('VALIDATION','証拠ファイルの接続先を確認してください。');
 var options=Object.assign({method:method,muteHttpExceptions:true,followRedirects:false},extra||{});options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+ScriptApp.getOAuthToken()});
 var response;try{response=UrlFetchApp.fetch(url,options);}catch(_){fail_('INTERNAL','証拠ファイルの応答を確認できませんでした。同じ保存IDで確認してください。');}
 var code=response.getResponseCode();if(code===404)return null;if(code===401||code===403)fail_('STORAGE_ACCESS_DENIED','証拠ファイルの保存権限を確認してください。');if(code===409||code===412)fail_('CONFLICT','ファイルはすでに送信されています。保存結果を確認してください。');if(code===429)fail_('RATE_LIMITED','ファイルへのアクセスが集中しています。時間をおいて確認してください。');if(code<200||code>=300)fail_(code>=500||code===408?'INTERNAL':'STORAGE_REQUEST_FAILED','証拠ファイルの処理を完了できませんでした。');return response;
}
function matchEvidenceJson_(response){if(!response)return null;try{var text=response.getContentText();if(typeof text!=='string'||text.length>50000)throw Error();var p=JSON.parse(text);if(!p||typeof p!=='object'||Array.isArray(p))throw Error();return p;}catch(_){fail_('INTERNAL','証拠ファイルの応答形式を確認できませんでした。');}}
function matchEvidencePrivateBucket_(storage){var data=matchEvidenceJson_(matchEvidenceFetch_('get','https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(storage.bucket)+'?fields=name,iamConfiguration'));if(!data||data.name!==storage.bucket||!data.iamConfiguration||data.iamConfiguration.publicAccessPrevention!=='enforced'||!data.iamConfiguration.uniformBucketLevelAccess||data.iamConfiguration.uniformBucketLevelAccess.enabled!==true)fail_('STORAGE_NOT_PRIVATE','証拠用ストレージの非公開設定を確認してください。公開禁止と均一アクセスが必要です。');}
function matchEvidenceMetadata_(storage,entry){var url='https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o/'+encodeURIComponent(matchEvidenceName_(storage,entry))+'?projection=full'+(entry.generation?'&generation='+encodeURIComponent(entry.generation):'');return matchEvidenceJson_(matchEvidenceFetch_('get',url));}
function matchEvidenceCheckMetadata_(storage,entry,metadata){
 var m=metadata&&metadata.metadata;if(!metadata||metadata.bucket!==storage.bucket||metadata.name!==matchEvidenceName_(storage,entry)||metadata.contentType!==entry.mime||String(metadata.size)!==String(entry.size)||typeof metadata.generation!=='string'||!/^[1-9][0-9]{0,29}$/.test(metadata.generation)||entry.generation&&metadata.generation!==entry.generation||!m||m.nodeEvidenceId!==entry.evidenceId||m.nodeOwnerId!==entry.ownerId||m.nodeRecordId!==entry.recordId||m.nodeKind!==entry.kind||m.nodeNamespace!==storage.namespace||m.firebaseStorageDownloadTokens!==undefined||metadata.acl&&metadata.acl.some(function(acl){return acl.entity==='allUsers'||acl.entity==='allAuthenticatedUsers';}))fail_('EVIDENCE_MISMATCH','証拠ファイルの内容・担当・種類が保存情報と一致しません。');return metadata;
}
function matchEvidenceBytes_(storage,entry,generation,range){var url='https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o/'+encodeURIComponent(matchEvidenceName_(storage,entry))+'?alt=media&generation='+encodeURIComponent(generation),response=matchEvidenceFetch_('get',url,range?{headers:{Range:'bytes=0-31'}}:{});if(!response)fail_('NOT_FOUND','証拠ファイルが見つかりません。');var bytes;try{bytes=response.getBlob().getBytes();}catch(_){fail_('INTERNAL','証拠ファイルを読み込めませんでした。');}if(!bytes||!bytes.length||bytes.length>MATCH_EVIDENCE_MAX||!range&&bytes.length!==entry.size)fail_('EVIDENCE_MISMATCH','証拠ファイルの容量を確認できませんでした。');return bytes;}
function matchEvidenceMagic_(bytes,mime,size){var b=Array.prototype.map.call(bytes,function(n){return (n+256)%256;}),valid=false;if(mime==='image/png')valid=b.length>=8&&[137,80,78,71,13,10,26,10].every(function(n,i){return b[i]===n;});if(mime==='image/jpeg')valid=b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;if(mime==='image/webp')valid=b.length>=12&&String.fromCharCode.apply(null,b.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,b.slice(8,12))==='WEBP'&&(b[4]+b[5]*256+b[6]*65536+b[7]*16777216+8)===size;if(!valid)fail_('EVIDENCE_TYPE','画像形式を確認できませんでした。PNG・JPEG・WebPの画像を添付してください。');}
function matchEvidenceSession_(storage,entry,origin){
 matchEvidenceOrigin_(origin);
 matchEvidencePrivateBucket_(storage);var url='https://storage.googleapis.com/upload/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o?uploadType=resumable&ifGenerationMatch=0',response=matchEvidenceFetch_('post',url,{contentType:'application/json; charset=UTF-8',headers:{Origin:origin,'X-Upload-Content-Type':entry.mime,'X-Upload-Content-Length':String(entry.size)},payload:JSON.stringify({name:matchEvidenceName_(storage,entry),contentType:entry.mime,cacheControl:'private, no-store, max-age=0',metadata:{nodeEvidenceId:entry.evidenceId,nodeOwnerId:entry.ownerId,nodeRecordId:entry.recordId,nodeKind:entry.kind,nodeNamespace:storage.namespace}})}),headers=response&&response.getAllHeaders(),location=headers&&(headers.Location||headers.location);
 var prefix='https://storage.googleapis.com/upload/storage/v1/b/'+encodeURIComponent(storage.bucket)+'/o?';if(typeof location!=='string'||location.indexOf(prefix)!==0||/[\r\n#]/.test(location)||location.length>8000||!/[?&]upload_id=[^&]+/.test(location))fail_('INTERNAL','ファイル送信先を確認できませんでした。新しい添付操作で再試行してください。');return location;
}
function beginMatchEvidence_(request){
 var session=authenticate_(request.token);readBudget_(session.id,'beginMatchEvidence');
 return withLock_(function(){
  var payload=salesObject_(request.payload||{},['recordId','kind','mime','size','uploadId','origin']),origin=matchEvidenceOrigin_(payload.origin),id=matchEvidenceUuid_(payload.uploadId),kind=choice_(payload.kind,['candidate','client']),mime=choice_(payload.mime,MATCH_EVIDENCE_MIMES);if(!Number.isSafeInteger(payload.size)||payload.size<1||payload.size>MATCH_EVIDENCE_MAX)fail_('VALIDATION','画像は5MB以内で添付してください。');
  var store=readStore_({readOnly:true}),user=activeActor_(store,authenticate_(request.token)),storage=matchEvidenceStorage_(store),record=salesRecord_(store,user,payload.recordId),state=matchEvidenceTable_(store.book),previous=state.entries.find(function(e){return e.evidenceId===id;}),operationId='evidence-begin-'+id,payloadHash=hash_(stableJson_({action:'beginMatchEvidence',payload:payload})),op=operation_(store,operationId);
  if(!writesEnabled_(store.config)||firestoreMigrationFrozen_())fail_('WRITES_DISABLED','現在は証拠ファイルを保存できません。入力は保持してください。');guardProbeBusinessMutation_(store,user,'beginMatchEvidence',payload);
  if(op&&(op.actorId!==user.id||op.action!=='beginMatchEvidence'||op.payloadHash!==payloadHash))fail_('OPERATION_CONFLICT','同じファイル保存IDを別の内容に使えません。');
  if(previous&&(previous.ownerId!==record.playerId||previous.recordId!==record.recordId||previous.profileId&&previous.profileId!==(record.profileId||'')||previous.kind!==kind||previous.mime!==mime||previous.size!==payload.size))fail_('OPERATION_CONFLICT','同じファイル保存IDを別の候補者・内容に使えません。');
  if(previous&&!op)fail_('SCHEMA_MISMATCH','ファイルの保存履歴と管理情報が一致しません。');var entry=previous;if(!entry){if(op)fail_('SCHEMA_MISMATCH','ファイルの保存履歴と管理情報が一致しません。');var now=new Date(),plan={requests:[],result:{evidenceId:id}};entry={evidenceId:id,ownerId:record.playerId,recordId:record.recordId,profileId:record.profileId||'',kind:kind,mime:mime,size:payload.size,status:'pending',generation:'',createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+MATCH_EVIDENCE_TTL).toISOString(),completedAt:''};matchEvidenceWrite_(store,plan,state,null,entry);addProfileRecordChecks_(plan,[record]);commit_(store,user,'beginMatchEvidence',operationId,payloadHash,plan,request.token);}
  matchEvidenceRecord_(store,user,entry);var result={evidenceId:entry.evidenceId,mime:entry.mime,size:entry.size,expiresAt:entry.expiresAt};if(entry.status==='completed'){snapshotActor_(store,request.token);result.completed=true;return result;}
  if(Date.parse(entry.expiresAt)<=Date.now())fail_('UPLOAD_EXPIRED','添付の有効時間が切れました。新しい添付操作で再試行してください。');
  var existing=matchEvidenceMetadata_(storage,entry);if(existing){matchEvidenceCheckMetadata_(storage,entry,existing);snapshotActor_(store,request.token);result.uploaded=true;return result;}
  var uploadUrl=matchEvidenceSession_(storage,entry,origin);snapshotActor_(store,request.token);result.uploadUrl=uploadUrl;return result;
 });
}
function planCompleteMatchEvidence_(store,user,payload){
 salesObject_(payload,['evidenceId']);var storage=matchEvidenceStorage_(store),state=matchEvidenceTable_(store.book),entry=state.entries.find(function(p){return p.evidenceId===matchEvidenceUuid_(payload.evidenceId);});if(!entry)fail_('NOT_FOUND','添付の管理情報が見つかりません。');var record=matchEvidenceRecord_(store,user,entry),plan={requests:[],result:{evidenceId:entry.evidenceId}};if(entry.status==='completed'){addProfileRecordChecks_(plan,[record]);return plan;}if(Date.parse(entry.expiresAt)<=Date.now())fail_('UPLOAD_EXPIRED','添付の有効時間が切れました。新しい添付操作で再試行してください。');
 var metadata=matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry)),bytes=matchEvidenceBytes_(storage,entry,metadata.generation,true);matchEvidenceMagic_(bytes,entry.mime,entry.size);var next=Object.assign({},entry,{status:'completed',generation:metadata.generation,completedAt:new Date().toISOString()});delete next.row;matchEvidenceWrite_(store,plan,state,entry,next);addProfileRecordChecks_(plan,[record]);plan.matchEvidenceCheck={entry:next};return plan;
}
function revalidateMatchEvidencePlan_(store,user,plan){if(plan.matchEvidenceCheck){var entry=plan.matchEvidenceCheck.entry;matchEvidenceRecord_(store,user,entry);var storage=matchEvidenceStorage_(store);matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry));}}
function salesValidateEvidence_(store,user,ids,record){
 if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1]||!record)fail_('VALIDATION','候補者側・クライアント側それぞれの証拠が必要です。');actorOwns_(user,record);var storage=matchEvidenceStorage_(store),state=matchEvidenceTable_(store.book),kinds=[];
 ids.forEach(function(id){var entry=state.entries.find(function(p){return p.evidenceId===matchEvidenceUuid_(id);});if(!entry||entry.status!=='completed'||entry.recordId!==record.recordId||entry.ownerId!==record.playerId||entry.profileId&&entry.profileId!==(record.profileId||''))fail_('FORBIDDEN','この候補者・提案の確認済み証拠を添付してください。');matchEvidenceRecord_(store,user,entry);kinds.push(entry.kind);matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry));});
 if(kinds.indexOf('candidate')<0||kinds.indexOf('client')<0)fail_('VALIDATION','候補者側・クライアント側の証拠を1つずつ添付してください。');
}
function readMatchEvidence_(request){salesObject_(request.payload||{},['evidenceId']);var session=authenticate_(request.token),accounts=readAccountStore_(),user=activeActor_(accounts,session),store=readStore_({readOnly:true},accounts),storage=matchEvidenceStorage_(store),entry=matchEvidenceTable_(store.book).entries.find(function(p){return p.evidenceId===matchEvidenceUuid_(request.payload.evidenceId);});if(!entry||entry.status!=='completed')fail_('NOT_FOUND','確認済みの証拠ファイルが見つかりません。');matchEvidenceRecord_(store,user,entry);matchEvidenceCheckMetadata_(storage,entry,matchEvidenceMetadata_(storage,entry));var bytes=matchEvidenceBytes_(storage,entry,entry.generation,false);matchEvidenceMagic_(bytes,entry.mime,entry.size);snapshotActor_(store,request.token);return {mime:entry.mime,base64:Utilities.base64Encode(bytes)};}

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRestFixture,emulatorOrigin,DEMO_PROJECT,plain} from './helpers/firestore-emulator.mjs';

const target=process.env.NODE_FIRESTORE_EMULATOR_URL;
const success=value=>{assert.equal(value.ok,true,JSON.stringify(value));return plain(value.data);};
const failure=(value,code)=>{assert.equal(value.ok,false,JSON.stringify(value));if(code)assert.equal(value.error.code,code,JSON.stringify(value));return value.error;};

test('real Firestore migration and authenticated workflows use only an explicitly enabled local demo emulator',{skip:!target,timeout:180_000},async t=>{
 const f=createRestFixture(emulatorOrigin(target)),h=f.h;
 const own=f.accounts.player.snapshot.records.find(r=>r.recordId==='ROW-11111111-1111-4111-8111-111111111111');
 const legacyId=randomUUID(),legacyPayload={recordId:own.recordId,rowVersion:own.rowVersion,status:'面談実施（合否待ち）'};
 success(f.api('updateStatus',legacyPayload,'player',legacyId,{responseMode:'receipt'}));
 const originalOutboxKey=f.accounts.player.snapshot.outboxKey;
 const originalSource=f.source(),authBefore=Object.fromEntries(Object.entries(h.properties).filter(([key])=>key.startsWith('NODE_AUTH_')||key==='NODE_PEPPER')),configBefore=h.properties.NODE_CONFIG;
 let migrated;
 await t.test('owner migrates every row and receipt, verifies the real REST data, then activates without changing Sheets or credentials',()=>{
  const preview=plain(h.context.previewNodeFirestoreMigration());assert.equal(preview.recordIdCount,4);assert.equal(preview.operationCount,1);assert.equal(preview.tableCount,4);
  h.properties.NODE_FIRESTORE_MIGRATION_CONFIRM='PREPARE:'+preview.sourceHash;const prepared=h.context.prepareNodeFirestoreMigration();assert.equal(prepared.frozen,true);
  let result;do{result=h.context.importNodeFirestoreMigration();}while(result.more);assert.equal(result.phase,'ready');
  const verified=h.context.verifyNodeFirestoreMigration();assert.equal(verified.verified,true);assert.equal(h.properties.NODE_STORAGE_PROVIDER,undefined);
  h.properties.NODE_FIRESTORE_MIGRATION_CONFIRM='ACTIVATE:'+preview.sourceHash;migrated=h.context.activateNodeFirestoreMigration();assert.equal(migrated.active,true);assert.equal(h.properties.NODE_STORAGE_PROVIDER,'firestore');
  assert.equal(h.properties.NODE_CONFIG,configBefore);assert.deepEqual(Object.fromEntries(Object.entries(h.properties).filter(([key])=>key.startsWith('NODE_AUTH_')||key==='NODE_PEPPER')),authBefore);assert.equal(f.source(),originalSource);
  const saved=f.readDocument('nodeWorkbooks/'+f.migrationState().target.workbookId);assert.equal(saved.status,200);const manifest=h.context.firestoreDecodeFields_(saved.body.fields);assert.equal(manifest.migrationProof.state,'active');assert.equal(manifest.migrationProof.sourceHash,preview.sourceHash);assert.equal(manifest.migrationProof.recordIdCount,4);assert.ok(manifest.migrationProof.seal);
 });
 assert.ok(migrated?.active,'The following workflow checks require verified migration');f.forbidSheets();h.writes.length=0;h.apiCalls.length=0;
 await t.test('the existing ID and password still log in, keep the encrypted outbox scope, and receive only owned details',()=>{
  const login=success(f.api('login',{id:'ND-001',password:'correct-test-password',idleAware:true,sessionOnly:true,cacheSnapshot:true}));f.accounts.player=login;
  const start=f.calls.length,snapshot=success(f.api('snapshot')),snapshotCalls=f.calls.slice(start);t.diagnostic(JSON.stringify({snapshotRpcCalls:snapshotCalls.length,snapshotReturnedDocuments:snapshotCalls.reduce((n,c)=>n+c.responseDocuments,0)}));assert.equal(snapshot.self.playerId,'ND-001');assert.equal(snapshot.storageBackend.kind,'firestore');assert.equal(snapshot.storageBackend.projectId,DEMO_PROJECT);assert.equal(snapshot.outboxKey,originalOutboxKey,'Migration must preserve the encrypted pending-input key');
  assert.equal(snapshot.records.some(r=>r.candidateName==='他者秘密候補'),false);assert.equal(JSON.stringify(snapshot).includes('他者秘密メモ'),false);assert.equal(snapshot.records.some(r=>r.recordId===own.recordId),true);assert.equal(snapshot.destination,undefined);
  const before=f.commits();success(f.api('updateStatus',legacyPayload,'player',legacyId,{responseMode:'receipt'}));assert.equal(f.commits(),before,'A receipt from before migration must prevent a second write');
 });
 let created,createdProfile;
 await t.test('candidate and profile commit together; a lost REST commit response replays the same ID without duplicating either',()=>{
  const payload={playerId:'ND-001',candidateName:'実接続確認候補',position:'アポインター',interviewDate:'2026-11-05',profileVersion:'',fields:{workHistory:'法人向けの電話案内を2年間担当。',additionalNotes:'本人と管理者だけの架空メモ'},introduction:'法人向けの電話案内を2年間担当しています。'};
  const operationId=randomUUID();f.state.dropCommit=true;failure(f.api('createCandidate',payload,'player',operationId,{responseMode:'receipt'}),'INTERNAL');
  const afterLost=success(f.api('snapshot'));created=afterLost.records.find(r=>r.candidateName===payload.candidateName);createdProfile=afterLost.candidateProfiles.find(p=>p.recordIds.includes(created?.recordId));assert.ok(created);assert.ok(createdProfile);assert.equal(createdProfile.fields.additionalNotes,payload.fields.additionalNotes);
  const before=f.commits(),receipt=success(f.api('createCandidate',payload,'player',operationId,{responseMode:'receipt'}));assert.deepEqual(receipt,{committed:true,operationId});assert.equal(f.commits(),before);
  const after=success(f.api('snapshot'));assert.equal(after.records.filter(r=>r.candidateName===payload.candidateName).length,1);assert.equal(after.candidateProfiles.filter(p=>p.recordIds.includes(created.recordId)).length,1);
  failure(f.api('createCandidate',{...payload,candidateName:'別の内容'},'player',operationId,{responseMode:'receipt'}),'OPERATION_CONFLICT');const other=success(f.api('snapshot',{},'other'));assert.equal(JSON.stringify(other).includes(payload.candidateName),false);
 });
 await t.test('achievement cancellation and restoration preserve row versions and actual Firestore audit receipts',()=>{
  const current=success(f.api('snapshot')).records.find(r=>r.recordId===created.recordId),cancelId=randomUUID();
  const canceled=success(f.api('cancelAchievement',{recordId:current.recordId,rowVersion:current.rowVersion,stage:'候補者面談'},'player',cancelId,{responseMode:'receipt'}));assert.equal(canceled.changeId,cancelId);
  const after=success(f.api('snapshot')).records.find(r=>r.recordId===created.recordId);assert.equal(after.values[0],'');assert.notEqual(after.rowVersion,current.rowVersion);
  success(f.api('restoreChange',{changeId:cancelId},'player',randomUUID(),{responseMode:'receipt'}));const restored=success(f.api('snapshot')).records.find(r=>r.recordId===created.recordId);assert.equal(restored.values[0],'2026-11-05');
  failure(f.api('updateStatus',{recordId:created.recordId,rowVersion:current.rowVersion,status:'辞退（本人希望）'},'other',randomUUID(),{responseMode:'receipt'}),'FORBIDDEN');
 });
 await t.test('real monthly points and exchanged rewards commit once with owner-only balances',()=>{
  const read=(as='admin',payload={})=>success(f.api('readRewards',payload,as));
  const mutate=(payload,as='admin',id=randomUUID())=>success(f.api('mutateRewards',payload,as,id,{responseMode:'receipt'}));
  const initial=read();assert.equal(initial.policy.enabled,false);
  mutate({command:'policy',expectedVersion:initial.version,policy:{enabled:true,metric:'提案',pointsPerWin:100,tiePolicy:'all',effectiveMonth:'2026-10'}});
  const preview=read('admin',{month:'2026-10'});assert.deepEqual(preview.preview.awards,[{playerId:'ND-001',points:100,count:2}]);
  const payload={command:'settle',expectedVersion:preview.version,month:'2026-10',fingerprint:preview.preview.fingerprint,reason:'架空の月次確定'},id=randomUUID();mutate(payload,'admin',id);const commits=f.commits();mutate(payload,'admin',id);assert.equal(f.commits(),commits);assert.equal(read('player').balances[0].balance,100);
  mutate({command:'catalog',expectedVersion:read().version,item:{name:'架空の交換特典',points:60,active:true}});const catalog=read('player'),reward=catalog.catalog[0];
  mutate({command:'request',expectedVersion:catalog.version,rewardId:reward.id},'player');const reserved=read('player');assert.equal(reserved.balances[0].reserved,60);assert.equal(reserved.balances[0].available,40);assert.equal(reserved.requests.length,1);
  const other=read('other');assert.ok(other.balances.every(p=>p.playerId==='ND-002'));assert.equal(other.requests.length,0);assert.equal(other.ledger.length,0);
  mutate({command:'review',expectedVersion:read().version,requestId:reserved.requests[0].requestId,decision:'approve',note:'架空の受け渡し確認'});const approved=read('player');assert.equal(approved.balances[0].balance,40);assert.equal(approved.balances[0].reserved,0);assert.equal(approved.requests[0].status,'approved');assert.equal(approved.ledger.filter(p=>p.kind==='award').length,1);assert.equal(approved.ledger.filter(p=>p.kind==='redemption').length,1);
  const before=f.commits();failure(f.api('mutateRewards',{command:'adjust',expectedVersion:initial.version,playerId:'ND-001',delta:100,reason:'古い版を拒否'},'admin',randomUUID(),{responseMode:'receipt'}),'CONFLICT');assert.equal(f.commits(),before);failure(f.api('readRewards',{month:'2026-10'},'player'),'FORBIDDEN');
 });
 await t.test('Slack raw archive stays private and applies a candidate and a shared job atomically',()=>{
  const entries=[{workspace:'架空企業',channel:'架空候補者共有',sourceId:'emulator-candidate',body:'管理者だけの架空原文',candidateName:'実移行確認候補',sourceThreadId:'1793840400.000001',attachmentLinks:['https://files.example.test/fictional.pdf']},{workspace:'架空企業',channel:'架空案件共有',sourceId:'emulator-job',body:'案件の公開前原文',candidateName:''}];
  const stageId=randomUUID();success(f.api('stageMigrationBatch',{entries},'admin',stageId,{responseMode:'receipt'}));const commits=f.commits();success(f.api('stageMigrationBatch',{entries},'admin',stageId,{responseMode:'receipt'}));assert.equal(f.commits(),commits);failure(f.api('readMigrationArchive',{},'player'),'FORBIDDEN');
  const archive=success(f.api('readMigrationArchive',{},'admin'));assert.equal(archive.total,2);const item=archive.entries.find(e=>e.sourceId===entries[0].sourceId);assert.equal(item.sourceThreadId,entries[0].sourceThreadId);assert.deepEqual(item.attachmentLinks,entries[0].attachmentLinks);
  const apply={id:item.id,version:item.version,mode:'candidate',playerId:'ND-001',candidateName:item.candidateName,introduction:'確認した架空の紹介文',fields:{workHistory:'架空の法人営業経験'},confirmReviewed:true},id=randomUUID();success(f.api('applyMigrationItem',apply,'admin',id,{responseMode:'receipt'}));const before=f.commits();success(f.api('applyMigrationItem',apply,'admin',id,{responseMode:'receipt'}));assert.equal(f.commits(),before);
  const saved=success(f.api('readMigrationArchive',{},'admin')).entries.find(e=>e.id===item.id),own=success(f.api('snapshot')),record=own.records.find(r=>r.recordId===saved.recordId);assert.equal(saved.state,'imported');assert.ok(record);assert.equal(record.values[0],'');assert.equal(own.candidateProfiles.find(p=>p.recordIds.includes(record.recordId)).fields.workHistory,apply.fields.workHistory);assert.equal(JSON.stringify(success(f.api('snapshot',{},'other'))).includes(entries[0].body),false);
  const job=archive.entries.find(e=>e.sourceId===entries[1].sourceId),payload={id:job.id,version:job.version,mode:'job',confirmReviewed:true,confirmInternalSharing:false,job:{company:'架空会社',title:'架空の募集案件',description:'共有する仕事内容',requirements:'経験を確認',workConditions:'平日・条件相談',status:'open'}};
  failure(f.api('applyMigrationItem',payload,'admin',randomUUID(),{responseMode:'receipt'}),'VALIDATION');success(f.api('applyMigrationItem',{...payload,confirmInternalSharing:true},'admin',randomUUID(),{responseMode:'receipt'}));const shared=success(f.api('readTeamWorkspace',{},'other'));assert.equal(shared.jobs.length,1);assert.equal(shared.jobs[0].description,payload.job.description);assert.equal(JSON.stringify(shared).includes(entries[1].body),false);assert.equal(shared.candidates.length,0);
 });
 await t.test('explicit publications and comments never expose private profile fields and source deletion withdraws the shared copy',()=>{
  const own=success(f.api('snapshot')),record=own.records.find(r=>r.recordId===created.recordId),profile=own.candidateProfiles.find(p=>p.recordIds.includes(created.recordId));
  success(f.api('publishTeamCandidate',{recordId:record.recordId,rowVersion:record.rowVersion,profileVersion:profile.version,confirmPublication:true},'player',randomUUID(),{responseMode:'receipt'}));
  const shared=success(f.api('readTeamWorkspace',{},'other')),publication=shared.candidates.find(p=>p.candidateName===record.candidateName);assert.ok(publication);assert.equal(publication.sourceRecordId,undefined);assert.equal(JSON.stringify(shared).includes(profile.fields.additionalNotes),false);assert.equal(publication.introduction,profile.introduction);
  success(f.api('saveTeamComment',{publicationId:publication.publicationId,body:'架空の確認コメント',mentionIds:['ND-001']},'other',randomUUID(),{responseMode:'receipt'}));const comment=success(f.api('readTeamWorkspace',{},'player')).comments.find(c=>c.body==='架空の確認コメント');assert.ok(comment);assert.equal(comment.authorId,'ND-002');
  failure(f.api('saveTeamComment',{publicationId:publication.publicationId,commentId:comment.commentId,version:comment.version,body:'別の人の書き換え'},'player',randomUUID(),{responseMode:'receipt'}),'FORBIDDEN');
  success(f.api('saveTeamComment',{publicationId:publication.publicationId,parentId:comment.commentId,body:'架空の返信'},'player',randomUUID(),{responseMode:'receipt'}));assert.equal(success(f.api('readTeamWorkspace',{},'other')).comments.length,2);
  const deleteId=randomUUID(),deleted=success(f.api('deleteCandidate',{recordId:record.recordId,rowVersion:record.rowVersion,scope:'record',targets:[{recordId:record.recordId,rowVersion:record.rowVersion}]},'player',deleteId,{responseMode:'receipt'}));assert.equal(deleted.changeId,deleteId);
  const after=success(f.api('snapshot'));assert.equal(after.records.some(r=>r.recordId===record.recordId),false);assert.ok(after.deletedCandidates.some(p=>p.changeId===deleteId));const withdrawn=success(f.api('readTeamWorkspace',{},'other'));assert.equal(withdrawn.candidates.some(p=>p.publicationId===publication.publicationId),false);assert.equal(withdrawn.comments.some(p=>p.publicationId===publication.publicationId),false);
  success(f.api('restoreChange',{changeId:deleteId},'player',randomUUID(),{responseMode:'receipt'}));assert.ok(success(f.api('snapshot')).records.some(r=>r.recordId===record.recordId));assert.equal(success(f.api('readTeamWorkspace',{},'other')).candidates.some(p=>p.publicationId===publication.publicationId),false,'Private restoration cannot silently republish the candidate');
 });
 await t.test('Security Rules reject anonymous and non-server client reads and writes separately from owner API tests',()=>{
  const path='nodeWorkbooks/'+f.migrationState().target.workbookId,before=f.readDocument(path,true);assert.equal(before.status,200);
  const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),client=b64({alg:'none',typ:'JWT'})+'.'+b64({iss:`https://securetoken.google.com/${DEMO_PROJECT}`,aud:DEMO_PROJECT,sub:'fictional-client',user_id:'fictional-client',iat:now,exp:now+3600,auth_time:now,firebase:{sign_in_provider:'custom'}})+'.';
  for(const authorization of [false,client]){
   const denied=f.readDocument(path,authorization);assert.equal(denied.status,403);assert.equal(denied.body.error.status,'PERMISSION_DENIED');
   const probe='nodeWorkbooks/rules-denied-'+randomUUID().replaceAll('-','');assert.equal(f.readDocument(probe,true).status,404);const write=f.deniedWriteProbe(probe,authorization);assert.equal(write.status,403);assert.equal(write.body.error.status,'PERMISSION_DENIED');assert.equal(f.readDocument(probe,true).status,404);
  }
  assert.deepEqual(f.readDocument(path,true).body,before.body,'Denied client calls cannot change the real stored manifest');
 });
 await t.test('administrator data export retains all migrated feature data without any authentication or cache secrets',()=>{
  const exported=success(f.api('readDataExport',{},'admin'));assert.equal(exported.scope,'application-data');assert.equal(exported.snapshot.storageBackend.kind,'firestore');
  assert.ok(exported.snapshot.records.some(r=>r.recordId===created.recordId));assert.ok(exported.managementTables.some(table=>table.title==='2期目月間KPI・KGI'));
  assert.equal(exported.migrationArchive.length,2);assert.ok(exported.migrationArchive.some(item=>item.sourceThreadId==='1793840400.000001'&&item.attachmentLinks.length===1));assert.equal(exported.teamWorkspace.jobs.length,1);assert.equal(exported.rewards.balances.find(p=>p.playerId==='ND-001').balance,40);
  const forbidden=new Set(['token','password','credentials','outboxKey','cacheAccess','secret','pepper','apiKey','deviceToken','authRecord']),visit=value=>{if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){assert.equal(forbidden.has(key),false,key);visit(child);}};visit(exported);
 });
 await t.test('administrator account suspension revokes an existing player session in the actual Firestore roster',()=>{
  const accounts=success(f.api('readAccountManagement',{},'admin')),player=accounts.accounts.find(a=>a.id==='ND-001');success(f.api('manageAccount',{playerId:player.id,action:'stop',expectedVersion:player.version},'admin',randomUUID()));failure(f.api('snapshot'),'UNAUTHENTICATED');const current=success(f.api('readAccountManagement',{},'admin')).accounts.find(a=>a.id===player.id);assert.equal(current.active,false);
 });
 assert.equal(f.source(),originalSource);assert.deepEqual(h.writes,[]);assert.deepEqual(h.apiCalls,[]);
});

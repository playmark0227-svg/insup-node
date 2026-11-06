import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchEvidenceUploader,privateEvidenceImage,validateEvidenceImage} from '../lib/match-evidence-client.ts';
const image=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'private.png',{type:'image/png'});
const evidenceId='evidence-1234567890';
const validStart=(file:File)=>({evidenceId,mime:file.type,size:file.size,expiresAt:new Date(Date.now()+300000).toISOString(),uploadUrl:'https://storage.googleapis.com/upload/storage/v1/b/test.firebasestorage.app/o?upload_id=ephemeral'});
test('agreement uploader rejects renamed non-images, SVG and oversized images before sending',async()=>{
 await assert.rejects(validateEvidenceImage(new File(['<svg><script>secret</script></svg>'],'fake.png',{type:'image/png'})));
 await assert.rejects(validateEvidenceImage(new File(['<svg/>'],'fake.svg',{type:'image/svg+xml'})));
 await assert.rejects(validateEvidenceImage(new File([new Uint8Array(5*1024*1024+1)],'big.png',{type:'image/png'})));
});
test('upload verifies expected destination and sends neither credentials nor referrer; retry keeps one operation ID',async()=>{
 const file=image(),begins:Record<string,unknown>[]=[],completes:string[]=[],sent:RequestInit[]=[];const prior=globalThis.fetch;
 let first=true;
 globalThis.fetch=(async(_url:unknown,init:RequestInit)=>{sent.push(init);return new Response('',{status:200});}) as typeof fetch;
 try{
  const upload=createMatchEvidenceUploader({begin:async p=>{begins.push(p);return validStart(file);},complete:async(_p,id)=>{completes.push(id);if(first){first=false;throw new Error('uncertain receipt');}}});
  await assert.rejects(upload(file,'record-1234567890','candidate'));
  assert.equal(await upload(file,'record-1234567890','candidate'),evidenceId);
  assert.equal(begins[0].uploadId,begins[1].uploadId);assert.equal(completes[0],completes[1]);
  assert.equal(sent[0].credentials,'omit');assert.equal(sent[0].redirect,'error');assert.equal(sent[0].referrerPolicy,'no-referrer');assert.equal(sent[0].body,file);
  assert.ok(!JSON.stringify(begins).includes('private.png'));
 }finally{globalThis.fetch=prior;}
});
test('completed and already-uploaded reservations never send image bytes again',async()=>{
 const file=image();let completions=0;const prior=globalThis.fetch;
 globalThis.fetch=(async()=>{throw new Error('must not upload');}) as typeof fetch;
 try{for(const flag of ['completed','uploaded']){
  const upload=createMatchEvidenceUploader({begin:async()=>({...validStart(file),uploadUrl:undefined,[flag]:true}),complete:async()=>{completions++;}});
  assert.equal(await upload(file,'record-1234567890','client'),evidenceId);
 }assert.equal(completions,1);}finally{globalThis.fetch=prior;}
});
test('credentials, alternate host, expiry and wrong object metadata cannot become an upload target',async()=>{
 const file=image();for(const altered of [{uploadUrl:'https://evil.invalid/upload?upload_id=x'},{uploadUrl:'https://user:secret@storage.googleapis.com/upload/storage/v1/b/a/o?upload_id=x'},{expiresAt:'2000-01-01T00:00:00Z'},{mime:'image/jpeg'},{size:1000}]){
  const upload=createMatchEvidenceUploader({begin:async()=>({...validStart(file),...altered}),complete:async()=>{throw new Error('must not complete');}});
  await assert.rejects(upload(file,'record-1234567890','candidate'));
 }
});
test('private previews accept raster bytes only and never arbitrary URLs or HTML',()=>{
 assert.equal(privateEvidenceImage({mime:'image/png',base64:'iVBORw0KGgo='}),'data:image/png;base64,iVBORw0KGgo=');
 for(const v of [{mime:'image/svg+xml',base64:'PHN2Zy8+'},{mime:'image/png',base64:'https://evil.invalid'},{mime:'text/html',base64:'PGh0bWw+'}])assert.throws(()=>privateEvidenceImage(v));
});

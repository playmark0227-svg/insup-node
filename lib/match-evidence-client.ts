/** Private agreement images: upload capabilities live only for this invocation. */
const maxBytes=5*1024*1024;
const mimeTypes=['image/png','image/jpeg','image/webp'] as const;
type EvidenceKind='candidate'|'client';
type EvidenceApi={begin:(payload:Record<string,unknown>)=>Promise<unknown>;complete:(payload:Record<string,unknown>,operationId:string)=>Promise<unknown>;origin?:string};
type Start={evidenceId:string;mime:string;size:number;expiresAt:string;completed?:true;uploaded?:true;uploadUrl?:string};
function startResult(value:unknown,file:File):Start{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('添付先を確認できませんでした。');
 const v=value as Record<string,unknown>;
 if(typeof v.evidenceId!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(v.evidenceId)||v.mime!==file.type||v.size!==file.size||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt)))throw new Error('添付先を確認できませんでした。');
 if(v.completed!==true&&v.uploaded!==true){
  if(typeof v.uploadUrl!=='string'||Date.parse(v.expiresAt)<=Date.now())throw new Error('添付先の有効期限が切れています。もう一度お試しください。');
  const url=new URL(v.uploadUrl);
  if(url.protocol!=='https:'||url.hostname!=='storage.googleapis.com'||url.port||url.username||url.password||!url.pathname.startsWith('/upload/storage/v1/b/')||!url.searchParams.get('upload_id'))throw new Error('添付先を確認できませんでした。');
 }
 return v as Start;
}
export async function validateEvidenceImage(file:File):Promise<void>{
 if(!mimeTypes.includes(file.type as typeof mimeTypes[number])||file.size<12||file.size>maxBytes)throw new Error('5MB以内のPNG・JPEG・WebP画像を選んでください。');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const png=bytes.slice(0,8).every((b,i)=>b===[137,80,78,71,13,10,26,10][i]);
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!(file.type==='image/png'&&png||file.type==='image/jpeg'&&jpeg||file.type==='image/webp'&&webp))throw new Error('画像の形式とファイル内容が一致しません。画像として書き出してから選び直してください。');
}
export function createMatchEvidenceUploader(api:EvidenceApi){
 const attempts=new WeakMap<File,Map<string,string>>();
 return async(file:File,recordId:string,kind:EvidenceKind):Promise<string>=>{
  await validateEvidenceImage(file);
  let targets=attempts.get(file);if(!targets){targets=new Map();attempts.set(file,targets);}const key=recordId+':'+kind;
  let uploadId=targets.get(key);if(!uploadId){uploadId=crypto.randomUUID();targets.set(key,uploadId);}
  const start=startResult(await api.begin({recordId,kind,mime:file.type,size:file.size,uploadId,origin:api.origin||globalThis.location?.origin||''}),file);
  if(start.completed)return start.evidenceId;
  if(!start.uploaded){
   const response=await fetch(start.uploadUrl!,{method:'PUT',body:file,headers:{'Content-Type':file.type},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(90_000)});
   if(!response.ok)throw new Error('画像を送信できませんでした。選択した画像を保持したまま再試行してください。');
  }
  await api.complete({evidenceId:start.evidenceId},`complete-${uploadId}`);
  return start.evidenceId;
 };
}
export function privateEvidenceImage(value:unknown):string{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('画像を確認できませんでした。');
 const v=value as Record<string,unknown>;
 if(!mimeTypes.includes(v.mime as typeof mimeTypes[number])||typeof v.base64!=='string'||v.base64.length>Math.ceil(maxBytes/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(v.base64))throw new Error('画像を確認できませんでした。');
 return `data:${v.mime};base64,${v.base64}`;
}

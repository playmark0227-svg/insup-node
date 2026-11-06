export type MigrationSource={workspace:string;channel:string};
export type MigrationInput={sourceId:string;workspace:string;channel:string;sourceUrl:string;postedAt:string;author:string;body:string;candidateName:string;sourceThreadId?:string;attachmentLinks?:string[];omittedAttachmentCount?:number};
export type MigrationEntry=MigrationInput&{id:string;version:string;state:'staged'|'imported'|'ignored';recordId:string;updatedAt:string};
export type MigrationArchive={feature:true;entries:MigrationEntry[];nextCursor:number|null;total:number};
const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/\u0000/g,'').trim().slice(0,max):'';
export const validSlackThreadId=(value:string)=>value===''||/^\d{9,12}\.\d{1,9}$/.test(value);
/** Links are references only. Never keep credentials in a URL or load an attachment automatically. */
export function safeMigrationAttachmentUrl(value:unknown):string|null {
 if(typeof value!=='string')return null;const raw=value.trim();if(!raw||raw.length>2000||/[\s\u0000-\u001f\u007f]/.test(raw)||/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw))return null;
 const match=/^https:\/\/([a-z0-9.-]+(?::\d{1,5})?)([/?#][^\s]*)?$/i.exec(raw);if(!match||match[1].includes('..')||match[1].startsWith('.')||match[1].startsWith('-'))return null;
 const port=match[1].match(/:(\d+)$/);if(port&&(Number(port[1])<1||Number(port[1])>65535))return null;
 for(const segment of raw.split(/[?#]/).slice(1))for(const pair of segment.split('&')){
  let key=pair.split('=')[0].replace(/\+/g,' ');try{for(let i=0;i<3;i++){const next=decodeURIComponent(key);if(next===key)break;key=next;}}catch{return null;}
  key=key.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(/token|apikey|authorization|password|passwd|secret|signature|credential|accesskey|oauth|bearer|resourcekey|session|jwt|ticket|saml|^sso$|^auth$|^key$|^sig$|^code$|^rlkey$/.test(key))return null;
 }
 return `https://${match[1].toLowerCase()}${match[2]||''}`;
}
function messageAttachments(message:Record<string,unknown>){
 const links=new Set<string>();let omitted=0,hasAttachment=false;
 for(const [key,fields] of [['files',['permalink','url_private_download','url_private']],['attachments',['original_url','from_url','title_link','image_url']]] as const){
  const values=message[key];if(!Array.isArray(values))continue;
  for(const value of values){if(!value||typeof value!=='object'||Array.isArray(value))continue;hasAttachment=true;const item=value as Record<string,unknown>;let selected:string|null=null;
   for(const field of fields){if(typeof item[field]!=='string'||!item[field])continue;const safe=safeMigrationAttachmentUrl(item[field]);if(safe){selected||=safe;}else omitted++;}
   if(selected)links.add(selected);
  }
 }
 if(links.size>20)throw new Error('1投稿の添付参照は20件までです。原文を分けて確認してください。');
 return {attachmentLinks:[...links].sort(),omittedAttachmentCount:omitted,hasAttachment};
}
function richText(value:unknown):string {if(!value||typeof value!=='object')return '';const x=value as Record<string,unknown>;if(x.type==='text')return typeof x.text==='string'?x.text:'';return Array.isArray(x.elements)?x.elements.map(richText).join(x.type==='rich_text_section'?'':'\n'):'';}
export function importName(body:string):string {const found=body.match(/(?:^|\n)\s*[*＊【\[]*(?:氏名|候補者(?:氏名|名)?|名前)[】\]]*\s*[:：]\s*([^\n]+)/);return found?found[1].replace(/[*＊]/g,'').trim().replace(/\s+/g,'').slice(0,60):'';}
/** Local parser only. Archived text never executes instructions or leaves this browser for AI. */
export function parseSlackArchive(raw:string,source:MigrationSource):MigrationInput[]{
 if(!source.workspace.trim()||!source.channel.trim())throw new Error('元のワークスペース名とチャンネル名を入力してください。');
 if(raw.length>2000000)throw new Error('一度に読み込む原文は200万文字以内に分けてください。');
 let messages:unknown[];
 try{const parsed=JSON.parse(raw);messages=Array.isArray(parsed)?parsed:parsed&&Array.isArray(parsed.messages)?parsed.messages:[];if(!messages.length)throw new Error('empty');}
 catch{if(raw.trim().startsWith('{')||raw.trim().startsWith('['))throw new Error('Slack JSONの形式を確認してください。messagesの配列またはメッセージ配列に対応します。');messages=raw.split(/\n\s*---+\s*\n/).filter(x=>x.trim()).map(text=>({text}));}
 if(messages.length>5000)throw new Error('一度に読み込む投稿は5,000件までです。');
 const result:MigrationInput[]=[],seen=new Map<string,string>();
 for(const value of messages){if(!value||typeof value!=='object')continue;const m=value as Record<string,unknown>;if(['channel_join','channel_leave','channel_name','bot_message'].includes(String(m.subtype)))continue;
  const attachments=messageAttachments(m),body=clean(typeof m.text==='string'?m.text:Array.isArray(m.blocks)?m.blocks.map(richText).join('\n'):'',12001)||(attachments.hasAttachment?'添付ファイル':'');if(!body)continue;if(body.length>12000)throw new Error('12,000文字を超える投稿があります。原文を分けて確認してください。');
  const ts=clean(m.ts,40),postedAt=/^\d{9,12}\.\d{1,9}$/.test(ts)?new Date(Number(ts)*1000).toISOString():'';
  const sourceThreadId=m.thread_ts===undefined?'':clean(m.thread_ts,40);if(typeof m.thread_ts!=='string'&&m.thread_ts!==undefined||!validSlackThreadId(sourceThreadId))throw new Error('返信先の投稿IDを確認してください。');
  // Text-only snippets use their complete body as the server-side duplicate key.
  const sourceId=ts||`text:${body}`,content=JSON.stringify([body,sourceThreadId,attachments.attachmentLinks]);if(seen.has(sourceId)){if(seen.get(sourceId)!==content)throw new Error('同じ投稿IDに異なる原文・返信先・添付参照があります。Slackの編集履歴を確認し、保存する版を選んでください。');continue;}seen.set(sourceId,content);
  const permalink=clean(m.permalink,300);const sourceUrl=/^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+$/.test(permalink)?permalink:'';
  result.push({sourceId,workspace:clean(source.workspace,100),channel:clean(source.channel,100),sourceUrl,postedAt,author:clean(m.user||m.username,100),body,candidateName:importName(body),sourceThreadId,attachmentLinks:attachments.attachmentLinks,...(attachments.omittedAttachmentCount?{omittedAttachmentCount:attachments.omittedAttachmentCount}:{})});
 }
 if(!result.length)throw new Error('取り込める本文がありません。');return result;
}
export function migrationBatches(entries:MigrationInput[]):MigrationInput[][]{const batches:MigrationInput[][]=[];let current:MigrationInput[]=[];for(const item of entries){if(current.length>=10||JSON.stringify([...current,item]).length>24000){if(current.length)batches.push(current);current=[];}if(JSON.stringify([item]).length>24000)throw new Error('1投稿のデータが保存上限を超えています。');current.push(item);}if(current.length)batches.push(current);return batches;}
export function assertMigrationArchive(value:unknown):asserts value is MigrationArchive {const v=value as MigrationArchive;if(!v||v.feature!==true||!Array.isArray(v.entries)||v.entries.length>50||!Number.isSafeInteger(v.total)||v.total<0||!(v.nextCursor===null||Number.isSafeInteger(v.nextCursor)&&v.nextCursor>=0))throw new Error('移行データの形式を確認できませんでした。');for(const e of v.entries)if(!e||!['staged','imported','ignored'].includes(e.state)||['id','version','body','workspace','channel','sourceId','author','sourceUrl','postedAt','recordId','candidateName','updatedAt'].some(k=>typeof (e as unknown as Record<string,unknown>)[k]!=='string')||e.sourceThreadId!==undefined&&(typeof e.sourceThreadId!=='string'||!validSlackThreadId(e.sourceThreadId))||e.attachmentLinks!==undefined&&(!Array.isArray(e.attachmentLinks)||e.attachmentLinks.length>20||new Set(e.attachmentLinks).size!==e.attachmentLinks.length||e.attachmentLinks.some(link=>!safeMigrationAttachmentUrl(link))))throw new Error('移行した原文を確認できませんでした。');}

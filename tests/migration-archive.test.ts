import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSlackArchive,migrationBatches,safeMigrationAttachmentUrl,assertMigrationArchive} from '../lib/migration.ts';
const source={workspace:'架空ワークスペース',channel:'架空候補者共有'};
test('same Slack IDs cannot silently hide edited message text, while exact duplicates are combined',()=>{const message={ts:'1760000000.123456',text:'氏名：架空候補\n確認した紹介文'};assert.equal(parseSlackArchive(JSON.stringify([message,message]),source).length,1);assert.throws(()=>parseSlackArchive(JSON.stringify([message,{...message,text:'編集された別の原文'}]),source),/同じ投稿ID/);});
test('rich-text blocks are never silently shortened before archive length validation',()=>{const item={ts:'1760000000.123456',blocks:[{type:'rich_text',elements:[{type:'rich_text_section',elements:[{type:'text',text:'あ'.repeat(12001)}]}]}]};assert.throws(()=>parseSlackArchive(JSON.stringify([item]),source),/12,000文字/);const good={...item,blocks:[{type:'rich_text',elements:[{type:'rich_text_section',elements:[{type:'text',text:'確認した内容'}]}]}]};assert.equal(parseSlackArchive(JSON.stringify([good]),source)[0].body,'確認した内容');});
test('plain text source keys remain exact per body and batches retain all original entries',()=>{const raw='氏名：架空一\n確認した内容\n---\n氏名：架空二\n別の内容',entries=parseSlackArchive(raw,source);assert.equal(entries.length,2);assert.equal(entries[0].sourceId,`text:${entries[0].body}`);assert.deepEqual(migrationBatches(entries).flat(),entries);const tooLarge={...entries[0],body:'あ'.repeat(12000),sourceId:'text:'+'あ'.repeat(12000)};assert.throws(()=>migrationBatches([tooLarge]),/上限/);});


test('Slack replies and file-only messages retain references without fetching attachments',()=>{
 const messages=[{ts:'1760000001.123456',thread_ts:'1760000000.123456',text:'確認した返信',files:[{permalink:'https://fictional.slack.com/files/U123/F123/report.pdf',url_private:'https://files.slack.com/files-pri/T1-F1/report.pdf'}]},{ts:'1760000002.123456',files:[{url_private_download:'https://files.slack.com/files-pri/T1-F2/download/report.pdf'}]}];
 const parsed=parseSlackArchive(JSON.stringify(messages),source);assert.equal(parsed.length,2);assert.equal(parsed[0].sourceId,messages[0].ts);assert.equal(parsed[0].sourceThreadId,messages[0].thread_ts);assert.deepEqual(parsed[0].attachmentLinks,['https://fictional.slack.com/files/U123/F123/report.pdf']);assert.equal(parsed[1].body,'添付ファイル');assert.equal(parsed[1].sourceThreadId,'');assert.equal(parsed[1].attachmentLinks?.length,1);
 const unsafe=parseSlackArchive(JSON.stringify([{ts:'1760000003.123456',attachments:[{original_url:'https://files.example.test/report?token=private',title_link:'https://docs.example.test/report'}]}]),source)[0];assert.equal(unsafe.body,'添付ファイル');assert.deepEqual(unsafe.attachmentLinks,['https://docs.example.test/report']);assert.equal(unsafe.omittedAttachmentCount,1);assert.equal(JSON.stringify(unsafe).includes('private'),false);
});
test('attachment references exclude credentials, unsafe protocols and disguised secret query keys',()=>{
 const unsafe=['http://files.example.test/file','javascript:alert(1)','https://name:password@files.example.test/file','https://name%40host.example/file','https://files.example.test/file?access_token=private','https://files.example.test/file?X-Amz-Signature=private','https://files.example.test/file?%61pi_key=private','https://files.example.test/file?%2561pi_key=private','https://files.example.test/file#token=private','https://files.example.test/file?resourcekey=private','https://files.example.test/file?jwt=private','https://files.example.test/file?bad%=x','https://files.example.test/%0aheader'];
 for(const value of unsafe)assert.equal(safeMigrationAttachmentUrl(value),null,value);
 assert.equal(safeMigrationAttachmentUrl('https://FILES.EXAMPLE.TEST/report.pdf?download=1#page=2'),'https://files.example.test/report.pdf?download=1#page=2');
 const message={ts:'1760000001.123456',text:'原文',files:unsafe.map(permalink=>({permalink}))},parsed=parseSlackArchive(JSON.stringify([message]),source)[0];assert.deepEqual(parsed.attachmentLinks,[]);assert.equal(parsed.omittedAttachmentCount,unsafe.length);
});
test('re-importing the same post requires matching text, thread and attachment references',()=>{
 const message={ts:'1760000001.123456',thread_ts:'1760000000.123456',text:'原文',files:[{permalink:'https://files.example.test/one.pdf'}]};
 assert.equal(parseSlackArchive(JSON.stringify([message,message]),source).length,1);
 for(const changed of [{...message,thread_ts:'1760000099.123456'},{...message,files:[{permalink:'https://files.example.test/two.pdf'}]}])assert.throws(()=>parseSlackArchive(JSON.stringify([message,changed]),source),/同じ投稿ID/);
 assert.throws(()=>parseSlackArchive(JSON.stringify([{...message,thread_ts:'not-a-thread'}]),source),/返信先/);
 assert.throws(()=>parseSlackArchive(JSON.stringify([{...message,files:Array.from({length:21},(_,i)=>({permalink:`https://files.example.test/${i}.pdf`}))}]),source),/20件/);
 const entry={...parseSlackArchive(JSON.stringify([message]),source)[0],id:'entry',version:'version',state:'staged',recordId:'',updatedAt:'2026-11-06T00:00:00Z'},archive={feature:true,entries:[entry],total:1,nextCursor:null};assert.doesNotThrow(()=>assertMigrationArchive(archive));
 assert.throws(()=>assertMigrationArchive({...archive,entries:[{...entry,attachmentLinks:['javascript:alert(1)']}]}));
});

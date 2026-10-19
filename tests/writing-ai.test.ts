import test from 'node:test';
import assert from 'node:assert/strict';
import { blankInterviewFields, interviewStringFields, unicodeLength, type InterviewFields } from '../lib/candidate-intake.ts';
import { assertWritingKitState, composeWritingKitIntroduction, defaultWritingPreferences, selectWritingKitQuestions,
  validateWritingPreferences, writingSectionIds, writingTopicCodes, type WritingKit, type WritingKitState, type WritingPreferences } from '../lib/writing-ai.ts';

const headings={basic:'基本条件',experience:'職務経歴',results:'確認済み実績',tools:'利用ツール',availability:'面談可能日',summary:'紹介概要'};
function kit(preferences:WritingPreferences=defaultWritingPreferences(),style:WritingKit['style']='standard'):WritingKit {
  return {generatedAt:'2026-10-20T02:00:00.000Z',source:'generated',style,preferenceVersion:preferences.version,
    sections:preferences.sectionOrder.map(id=>({id,heading:headings[id],lead:'確認済みの内容を記載します。'})),
    coaching:writingTopicCodes.map(code=>({code,questions:[`${code}：本人に確認することはありますか。`],actions:[`${code}：確認した内容と未確認事項を分けて記録する。`]}))};
}
function state(preferences=defaultWritingPreferences()):WritingKitState {
  return {kit:kit(preferences),pending:false,configured:true,preferences,usage:{userRemaining:2,teamRemaining:9,resetAt:'2026-10-20T15:00:00.000Z'}};
}
const clone=<T>(value:T):T=>structuredClone(value);
const record=(value:unknown)=>value as Record<string,unknown>;


test('writing state accepts generated saved cached-disconnected and pending forms without altering payloads',()=>{
 const generated=state(),before=clone(generated);assert.doesNotThrow(()=>assertWritingKitState(generated));assert.deepEqual(generated,before);
 const saved=state();saved.kit!.source='saved';saved.configured=false;saved.usage={userRemaining:0,teamRemaining:0,resetAt:saved.usage.resetAt};assert.doesNotThrow(()=>assertWritingKitState(saved));
 const pending={...state(),kit:null,pending:true};assert.doesNotThrow(()=>assertWritingKitState(pending));
 const custom=defaultWritingPreferences();custom.version='custom_version_123456';custom.sectionOrder=['availability','tools','basic','experience','results','summary'];assert.doesNotThrow(()=>assertWritingKitState(state(custom)));
});

test('writing state rejects unknown response properties at every boundary and retains no raw reference text',()=>{
 for(const mutate of [
  (s:WritingKitState)=>{record(s).referenceText='private reference';},
  (s:WritingKitState)=>{record(s.usage).memo='private memo';},
  (s:WritingKitState)=>{record(s.preferences).reference='private example';},
  (s:WritingKitState)=>{record(s.kit).candidateName='private name';},
  (s:WritingKitState)=>{record(s.kit!.sections[0]).raw='private history';},
  (s:WritingKitState)=>{record(s.kit!.coaching[0]).reflection='private reflection';},
 ]){const input=state();mutate(input);assert.throws(()=>assertWritingKitState(input));}
 for(const input of [null,[],{},'kit',0,{...state(),kit:undefined},{...state(),usage:undefined},{...state(),preferences:undefined}])assert.throws(()=>assertWritingKitState(input));
});

test('writing state requires server provenance settings version full section order and every coaching topic',()=>{
 for(const mutate of [
  (s:WritingKitState)=>{record(s.kit).source='local';},
  (s:WritingKitState)=>{record(s.kit).style='creative';},
  (s:WritingKitState)=>{s.kit!.preferenceVersion='other_version_12345';},
  (s:WritingKitState)=>{s.kit!.sections.pop();},
  (s:WritingKitState)=>{s.kit!.sections.reverse();},
  (s:WritingKitState)=>{s.kit!.sections[1].id='basic';},
  (s:WritingKitState)=>{record(s.kit!.sections[0]).id='unknown';},
  (s:WritingKitState)=>{s.kit!.coaching.pop();},
  (s:WritingKitState)=>{s.kit!.coaching.reverse();},
  (s:WritingKitState)=>{s.kit!.coaching[1].code='requirements';},
  (s:WritingKitState)=>{record(s.kit!.coaching[0]).code='unknown';},
 ]){const input=state();mutate(input);assert.throws(()=>assertWritingKitState(input));}
});

test('writing output length controls dates and daily quota boundaries match the backend contract',()=>{
 for(const mutate of [
  (s:WritingKitState)=>{s.kit!.sections[0].heading='見'.repeat(33);},
  (s:WritingKitState)=>{s.kit!.sections[0].lead='導'.repeat(121);},
  (s:WritingKitState)=>{s.kit!.sections[0].lead='';},
  (s:WritingKitState)=>{s.kit!.sections[0].heading='  ';},
  (s:WritingKitState)=>{s.kit!.sections[0].lead='control\u0007';},
  (s:WritingKitState)=>{s.kit!.coaching[0].questions=[];},
  (s:WritingKitState)=>{s.kit!.coaching[0].actions=[];},
  (s:WritingKitState)=>{s.kit!.coaching[0].questions=['問'.repeat(141)];},
  (s:WritingKitState)=>{s.kit!.coaching[0].actions=['行'.repeat(181)];},
  (s:WritingKitState)=>{s.kit!.coaching[0].questions=['a','b','c','d'];},
  (s:WritingKitState)=>{s.kit!.coaching[0].actions=['a','b','c','d'];},
  (s:WritingKitState)=>{s.kit!.generatedAt='not-a-date';},
  (s:WritingKitState)=>{s.kit!.generatedAt='2026-02-30T02:00:00.000Z';},
  (s:WritingKitState)=>{s.usage.resetAt='2026-10-20';},
  (s:WritingKitState)=>{s.usage.userRemaining=-1;},
  (s:WritingKitState)=>{s.usage.userRemaining=4;},
  (s:WritingKitState)=>{s.usage.userRemaining=0.5;},
  (s:WritingKitState)=>{s.usage.teamRemaining=11;},
  (s:WritingKitState)=>{s.usage.teamRemaining=NaN;},
 ]){const input=state();mutate(input);assert.throws(()=>assertWritingKitState(input));}
 const boundary=state();boundary.kit!.sections[0].heading='見'.repeat(32);boundary.kit!.sections[0].lead='導'.repeat(120);boundary.kit!.coaching[0].questions=['問'.repeat(140)];boundary.kit!.coaching[0].actions=['行'.repeat(180)];boundary.usage.userRemaining=3;boundary.usage.teamRemaining=10;assert.doesNotThrow(()=>assertWritingKitState(boundary));
});

test('writing shared preferences are exact finite settings with isolated arrays and backend-valid versions',()=>{
 const initial=defaultWritingPreferences(),first=validateWritingPreferences(initial);assert.deepEqual(first,initial);first.sectionOrder.reverse();assert.deepEqual(initial.sectionOrder,[...writingSectionIds]);
 for(const input of [{...initial,version:'short'}, {...initial,version:'v'.repeat(81)}, {...initial,version:'contains private example'}, {...initial,tone:'casual'}, {...initial,targetLength:800}, {...initial,includeSummary:'yes'}, {...initial,sectionOrder:['basic']}, {...initial,sectionOrder:[...writingSectionIds.slice(0,5),'basic']}, {...initial,referenceText:'private reference'}])assert.throws(()=>validateWritingPreferences(input));
 assert.doesNotThrow(()=>validateWritingPreferences({...initial,version:'valid_version_123456'}));
});

test('client introduction preserves confirmed source units and source provenance without creating assessments',()=>{
 const fields={...blankInterviewFields(),age:'40',gender:'回答しない',residence:'架空県',desiredHourlyRate:'2,000円/時',workHistory:'本人申告：法人向け架電を6か月。',achievements:'本人申告：アポ3件。未確認。',strengths:'本人申告：記録をこまめに残す。',crmTools:['Salesforce','その他'],crmOther:'社内CRM',chatTools:['Slack'],interviewAvailability:'平日午後。要調整。'};
 const before=clone(fields),result=composeWritingKitIntroduction('架空の候補者',fields,kit());
 assert.equal(result.truncated,false);assert.deepEqual(result.omittedFields,[]);assert.match(result.text,/氏名：架空の候補者/);assert.match(result.text,/希望単価：2,000円\/時/);assert.match(result.text,/本人申告：アポ3件。未確認。/);assert.match(result.text,/CRM：Salesforce/);assert.match(result.text,/その他のCRM：社内CRM/);assert.doesNotMatch(result.text,/CRM：Salesforce・その他/);assert.deepEqual(fields,before);
 for(const label of Object.values(headings))assert.ok(result.text.includes(`【${label}】`));assert.doesNotMatch(result.text,/優秀|おすすめ|即戦力|採用すべき|適性|推薦/);
});

test('missing client data remains absent and internal fields cannot populate a blank introduction',()=>{
 assert.deepEqual(composeWritingKitIntroduction('',blankInterviewFields(),kit()),{text:'',truncated:false,omittedFields:[]});
 const privateOnly={...blankInterviewFields(),attendanceConcerns:'内部の勤怠懸念',additionalNotes:'非公開の面談メモ',interviewMemo:'内部面談メモ',selfReflection:'担当者の自己反省',interviewAdvice:'担当者へのアドバイス'};
 assert.deepEqual(composeWritingKitIntroduction('',privateOnly,kit()),{text:'',truncated:false,omittedFields:[]});
 const minimal=composeWritingKitIntroduction('架空の候補者',blankInterviewFields(),kit());assert.doesNotMatch(minimal.text,/年齢：|性別：|営業経験・職歴：|稼働開始：|未確認|経験豊富/);
});

test('client introduction excludes attendance notes interviewer memo reflection and advice while retaining allowed factual history',()=>{
 const fields={...blankInterviewFields(),workHistory:'外部共有を確認済みの営業経歴',attendanceConcerns:'PRIVATE_ATTENDANCE',additionalNotes:'PRIVATE_ADDITIONAL',interviewMemo:'PRIVATE_INTERVIEW_MEMO',selfReflection:'PRIVATE_SELF_REFLECTION',interviewAdvice:'PRIVATE_INTERVIEW_ADVICE'};
 const result=composeWritingKitIntroduction('架空の候補者',fields,kit());assert.match(result.text,/外部共有を確認済みの営業経歴/);
 for(const secret of ['PRIVATE_ATTENDANCE','PRIVATE_ADDITIONAL','PRIVATE_INTERVIEW_MEMO','PRIVATE_SELF_REFLECTION','PRIVATE_INTERVIEW_ADVICE'])assert.ok(!result.text.includes(secret));assert.deepEqual(result.omittedFields,[]);
 assert.equal(fields.attendanceConcerns,'PRIVATE_ATTENDANCE');assert.equal(fields.additionalNotes,'PRIVATE_ADDITIONAL');
});

function longFields():InterviewFields {
 const fields=blankInterviewFields();
 for(const key of interviewStringFields)fields[key]=`${key}の確認済み入力🧑‍💻`.repeat(key==='workHistory'?600:100);
 fields.crmTools=['Salesforce','kintone','その他'];fields.chatTools=['Slack','Chatwork','その他'];return fields;
}

test('standard and concise client introductions fit 1000 and 600 Unicode codepoints without splitting emoji',()=>{
 for(const [style,targetLength,limit] of [['standard',1000,1000],['standard',600,600],['concise',1000,600],['concise',600,600]] as const){
  const preferences={...defaultWritingPreferences(),targetLength},fields=longFields(),template=kit(preferences,style),before=clone({fields,template,preferences});
  const result=composeWritingKitIntroduction('架空の候補者🧑‍💻',fields,template,preferences);
  assert.ok(unicodeLength(result.text)<=limit,`${style}/${targetLength}: ${unicodeLength(result.text)}`);assert.equal(result.truncated,true);assert.ok(result.omittedFields.includes('workHistory'));assert.ok(!result.omittedFields.includes('attendanceConcerns'));assert.ok(!result.omittedFields.includes('additionalNotes'));
  assert.doesNotMatch(result.text,/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  for(const section of Object.values(headings))assert.ok(result.text.includes(`【${section}】`));
  assert.deepEqual({fields,template,preferences},before);assert.deepEqual(composeWritingKitIntroduction('架空の候補者🧑‍💻',fields,template,preferences),result);
 }
});

test('custom section order and summary choice affect only the composed output',()=>{
 const preferences={...defaultWritingPreferences(),includeSummary:false,sectionOrder:['availability','tools','basic','experience','results','summary'] as WritingPreferences['sectionOrder']};
 const fields={...blankInterviewFields(),workHistory:'確認済みの経験',achievements:'本人申告の実績',pcEnvironment:'MacBook',interviewAvailability:'平日午後'};
 const result=composeWritingKitIntroduction('架空の候補者',fields,kit(preferences),preferences);assert.doesNotMatch(result.text,/【紹介概要】/);
 const expected=['面談可能日','利用ツール','基本条件','職務経歴','確認済み実績'];assert.ok(expected.every((heading,index)=>index===0||result.text.indexOf(`【${expected[index-1]}】`)<result.text.indexOf(`【${heading}】`)));
});

test('oversized generic leads use short headings without sacrificing source fields or exceeding the length budget',()=>{
 const preferences={...defaultWritingPreferences(),targetLength:600 as const},template=kit(preferences),fields=longFields(),before=clone(template);
 for(const section of template.sections)section.lead='記載内容は本人に確認してください。'.repeat(6);
 const oversized=clone(template),result=composeWritingKitIntroduction('架空の候補者',fields,template,preferences);assert.ok(unicodeLength(result.text)<=600);assert.equal(result.truncated,true);assert.match(result.text,/【基本情報】/);assert.match(result.text,/【営業経験・職歴】/);assert.deepEqual(template,oversized);assert.notDeepEqual(template,before);
});

test('local question routing selects fixed topics without echoing any private memo or profile content',()=>{
 const fields={...blankInterviewFields(),workHistory:'PRIVATE_HISTORY',attendanceConcerns:'PRIVATE_ATTENDANCE',additionalNotes:'PRIVATE_NOTES'};
 const template=kit(),before=clone({fields,template});
 const result=selectWritingKitQuestions(template,{fields,memo:'PRIVATE_MEMO：希望の時給条件を確認。本人に何を聞くか。',reflection:'PRIVATE_REFLECTION：質問の仕方を振り返る。'});
 assert.deepEqual(result.sourceLabels,['希望条件の確認','聞き方・伝え方','面談の振り返り']);
 assert.ok(result.questions.some(value=>value.startsWith('requirements：')));assert.ok(result.questions.some(value=>value.startsWith('communication：')));assert.ok(result.questions.some(value=>value.startsWith('reflection：')));
 for(const secret of ['PRIVATE_HISTORY','PRIVATE_ATTENDANCE','PRIVATE_NOTES','PRIVATE_MEMO','PRIVATE_REFLECTION'])assert.ok(!JSON.stringify(result).includes(secret));
 assert.deepEqual(Object.keys(result).sort(),['actions','questions','sourceLabels']);assert.deepEqual({fields,template},before);
});

test('local topic routing falls back safely, stays bounded and deduplicates generic questions',()=>{
 const template=kit();assert.deepEqual(selectWritingKitQuestions(template,{fields:blankInterviewFields()}).sourceLabels,['希望条件の確認','聞き方・伝え方']);
 for(const topic of template.coaching){topic.questions=['共通の確認事項','次に何を確認しますか','記録は残っていますか'];topic.actions=['共通の次の行動','本人に確認する','結果を記録する'];}
 const input={fields:blankInterviewFields(),memo:'希望条件・営業経験・説明・予定・提案',reflection:'次回改善したい'};
 const result=selectWritingKitQuestions(template,input);assert.equal(result.sourceLabels.length,3);assert.ok(result.questions.length<=6);assert.ok(result.actions.length<=5);assert.equal(new Set(result.questions).size,result.questions.length);assert.equal(new Set(result.actions).size,result.actions.length);
});

test('local question helper does not call cloud transport or forward profile text to a provider',()=>{
 const previous=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;throw new Error('Network must not be used');};
 try {const result=selectWritingKitQuestions(kit(),{fields:longFields(),memo:'秘密の稼働予定',reflection:'秘密の会話の振り返り'});assert.equal(called,false);assert.ok(result.questions.length>0);assert.ok(!JSON.stringify(result).includes('秘密'));}
 finally {globalThis.fetch=previous;}
});

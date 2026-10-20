import { introductionHeadings } from "./introduction-style.ts";
import {
  interviewFieldLabels, normalizeInterviewFields, unicodeLength,
  type InterviewFields, type IntroductionComposition,
} from './candidate-intake.ts';
import { defaultWritingPreferences, validateWritingPreferences as validateDevicePreferences, type WritingPreferences } from './on-device-ai.ts';

export { defaultWritingPreferences, type WritingPreferences } from './on-device-ai.ts';
export function validateWritingPreferences(value:unknown):WritingPreferences {
  const preferences=validateDevicePreferences(value);
  if(!/^(?:initial|[A-Za-z0-9_-]{16,80})$/.test(preferences.version))throw new Error('AI書式の設定を確認できませんでした。');
  return preferences;
}
export const writingSectionIds = ['basic','experience','results','tools','availability','summary'] as const;
export type WritingSectionId = typeof writingSectionIds[number];
export const writingTopicCodes = ['requirements','experience','communication','schedule','proposal','reflection'] as const;
export type WritingTopicCode = typeof writingTopicCodes[number];
export type WritingStyle = 'standard'|'concise';
export type WritingKit = {
  generatedAt: string; source: 'generated'|'saved'; style: WritingStyle; preferenceVersion: string;
  sections: {id:WritingSectionId;heading:string;lead:string}[];
  coaching: {code:WritingTopicCode;questions:string[];actions:string[]}[];
};
export type WritingKitState = {
  kit: WritingKit|null; pending:boolean; configured:boolean; preferences:WritingPreferences;
  usage:{userRemaining:number;teamRemaining:number;resetAt:string};
};
export type CandidateAiConnection = {
  identityKey: string; preferences:WritingPreferences; enabled:boolean;
  onReadKit:(style:WritingStyle)=>Promise<WritingKitState>;
  onGenerateKit:(style:WritingStyle)=>Promise<WritingKitState>;
};

const text = (value:unknown,max:number):value is string => typeof value==='string' && !!value.trim() && unicodeLength(value)<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const objectWithKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const timestamp=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function assertWritingKitState(value:unknown):asserts value is WritingKitState {
  const invalid=()=>{throw new Error('AIの文章構成を確認できませんでした。');};
  if(!objectWithKeys(value,['kit','pending','configured','usage','preferences'])||typeof value.pending!=='boolean'||typeof value.configured!=='boolean'||
    !objectWithKeys(value.usage,['userRemaining','teamRemaining','resetAt'])||
    !Number.isInteger(value.usage.userRemaining)||(value.usage.userRemaining as number)<0||(value.usage.userRemaining as number)>3||
    !Number.isInteger(value.usage.teamRemaining)||(value.usage.teamRemaining as number)<0||(value.usage.teamRemaining as number)>10||!timestamp(value.usage.resetAt))invalid();
  const state=value as unknown as WritingKitState,preferences=validateWritingPreferences(state.preferences);
  if(state.kit===null)return;
  const kit=state.kit;
  if(!objectWithKeys(kit,['generatedAt','source','style','preferenceVersion','sections','coaching'])||!['generated','saved'].includes(kit.source)||
    !['standard','concise'].includes(kit.style)||kit.preferenceVersion!==preferences.version||!timestamp(kit.generatedAt)||
    !Array.isArray(kit.sections)||kit.sections.length!==6||!Array.isArray(kit.coaching)||kit.coaching.length!==6)invalid();
  if(kit.sections.some((section,index)=>!objectWithKeys(section,['id','heading','lead'])||section.id!==preferences.sectionOrder[index]||!text(section.heading,32)||!text(section.lead,120))||
    kit.coaching.some((topic,index)=>!objectWithKeys(topic,['code','questions','actions'])||topic.code!==writingTopicCodes[index]||
      !Array.isArray(topic.questions)||topic.questions.length<1||topic.questions.length>3||topic.questions.some(question=>!text(question,140))||
      !Array.isArray(topic.actions)||topic.actions.length<1||topic.actions.length>3||topic.actions.some(action=>!text(action,180))))invalid();
}

/** All source values are inserted here, after the cloud request has finished. */
export function composeWritingKitIntroduction(candidateName:string,raw:InterviewFields,kit:WritingKit,preferences?:WritingPreferences):IntroductionComposition {
  const fields=normalizeInterviewFields(raw),prefs=preferences||defaultWritingPreferences();
  const value=(key:keyof InterviewFields|'candidateName')=>key==='candidateName'?candidateName.trim():Array.isArray(fields[key])?(fields[key] as string[]).join('・'):(fields[key] as string).trim();
  type Entry={key:keyof InterviewFields|'candidateName';value:string;weight:number;label:string};
  const entry=(key:Entry['key'],weight=1):Entry=>({key,value:value(key),weight,label:interviewFieldLabels[key]});
  const tools=(key:'crmTools'|'chatTools',other:'crmOther'|'chatOther'):Entry[]=>{
    const list=fields[key].filter(v=>v!=='その他'||!fields[other].trim());
    return [{...entry(key),value:list.join('・')},entry(other)];
  };
  const groups:Record<WritingSectionId,Entry[]>={
    basic:[entry('candidateName'),entry('age'),entry('gender'),entry('residence'),entry('availableFrom'),entry('timeWindow'),entry('daysPerWeek'),entry('monthlyHours'),entry('sideJob'),entry('desiredHourlyRate'),entry('workStyle')],
    experience:[entry('workHistory',4)],results:[entry('achievements',2),entry('strengths',2)],
    tools:[entry('pcEnvironment'),entry('networkEnvironment'),entry('pcSkills'),...tools('crmTools','crmOther'),...tools('chatTools','chatOther')],
    availability:[entry('interviewAvailability',2)],summary:[],
  };
  // Internal notes and interviewer's reflection are not automatically shared.
  const sections=prefs.sectionOrder.map(id=>{
    const template=kit.sections.find(section=>section.id===id);
    return {id,template:template?{...template,heading:introductionHeadings[id]}:undefined,entries:groups[id].filter(e=>e.value)};
  })
    .filter(s=>s.template&&(s.entries.length||s.id==='summary'&&prefs.includeSummary&&!!candidateName.trim()));
  const limit=Math.min(1000,prefs.targetLength,kit.style==='concise'?600:1000);
  const render=(base:number)=>sections.map(s=>{
    const body=s.entries.map(e=>{
      const points=Array.from(e.value),n=Math.max(1,Math.floor(base*e.weight));
      return `${e.label}：${points.length>n?points.slice(0,n-1).join('')+'…':e.value}`;
    }).join('\n');
    return `【${s.template!.heading}】\n${[s.template!.lead.trim(),body].filter(Boolean).join('\n')}`;
  }).join('\n\n');
  if(unicodeLength(render(0))>limit){
    const shortHeadings = introductionHeadings;
    sections.forEach(s=>{s.template={id:s.id,heading:shortHeadings[s.id],lead:s.id==='summary'?'記載内容は本人に確認してください。':''};});
    if(unicodeLength(render(0))>limit)throw new Error('文章構成が長すぎます。入力内容は残っています。標準の書式で作成してください。');
  }
  const longest=Math.max(1,...sections.flatMap(s=>s.entries.map(e=>unicodeLength(e.value))));
  const full=render(longest);
  if(unicodeLength(full)<=limit)return {text:full,truncated:false,omittedFields:[]};
  let low=0,high=longest;
  while(low<high){const middle=Math.ceil((low+high)/2);if(unicodeLength(render(middle))<=limit)low=middle;else high=middle-1;}
  return {text:render(low),truncated:true,omittedFields:[...new Set(sections.flatMap(s=>s.entries.filter(e=>unicodeLength(e.value)>Math.max(1,Math.floor(low*e.weight))).map(e=>e.key)))]};
}

const topicLabels:Record<WritingTopicCode,string>={requirements:'希望条件の確認',experience:'経験の事実確認',communication:'聞き方・伝え方',schedule:'面談・稼働予定',proposal:'提案前の確認',reflection:'面談の振り返り'};
/** Local keyword routing only; no profile, keyword, category or memo is sent. */
export function selectWritingKitQuestions(kit:WritingKit,input:{fields:InterviewFields;memo?:string;reflection?:string}):{questions:string[];actions:string[];sourceLabels:string[]} {
  const source=[input.memo||'',input.reflection||''].join('\n');
  const topics=new Set<WritingTopicCode>();
  if(/条件|時給|単価|希望|要件|相違|認識/.test(source))topics.add('requirements');
  if(/経験|職歴|実績|具体例|商材|営業/.test(source))topics.add('experience');
  if(/質問|聞き|聞く|ヒアリング|説明|会話|伝え|遮|話し|早口|滑舌/.test(source))topics.add('communication');
  if(/日程|予定|稼働|曜日|時間|シフト|開始/.test(source))topics.add('schedule');
  if(/提案|クライアント|紹介|連絡|募集|案件/.test(source))topics.add('proposal');
  if(input.reflection?.trim())topics.add('reflection');
  if(!topics.size){topics.add('requirements');topics.add('communication');}
  const picked=[...topics].slice(0,3).map(code=>kit.coaching.find(c=>c.code===code)).filter((c):c is WritingKit['coaching'][number]=>!!c);
  return {questions:[...new Set(picked.flatMap(c=>c.questions))].slice(0,6),actions:[...new Set(picked.flatMap(c=>c.actions))].slice(0,5),sourceLabels:picked.map(c=>topicLabels[c.code])};
}

import {interviewFieldLabels, normalizeInterviewFields, unicodeLength, type InterviewFields, type InterviewStringField} from "./candidate-intake.ts";

export type IntroductionCheck = {code:string;fields:InterviewStringField[];title:string;detail:string};
export type IntroductionRevision = {field:InterviewStringField;label:string;before:string;after:string};
export type IntroductionReview = {fields:InterviewFields;checks:IntroductionCheck[];revisions:IntroductionRevision[];notes:string[]};

// These are unambiguous business terms only. Names, companies, places and numbers
// are not transliterated or guessed. The caller always keeps the original input.
const businessSpellings:readonly [RegExp,string][]=[
 [/てれあぽ/gi,"テレアポ"],[/いんさいどせーるす/gi,"インサイドセールス"],
 [/あぽいんたー/gi,"アポインター"],[/こーるせんたー/gi,"コールセンター"],
 [/ほうじんえいぎょう/gi,"法人営業"],[/こじんえいぎょう/gi,"個人営業"],
 [/しんきかいたく/gi,"新規開拓"],[/あぽいんと/gi,"アポイント"],
 [/ひありんぐ/gi,"ヒアリング"],[/かでんぎょうむ/gi,"架電業務"],
 [/おんらいんめんだん/gi,"オンライン面談"],[/りすとさくせい/gi,"リスト作成"],
 [/せーるすふぉーす/gi,"Salesforce"],[/きんとーん/gi,"kintone"],[/えいぎょう/gi,"営業"],
];
const editableBusinessFields:InterviewStringField[]=["workHistory","achievements","strengths","pcSkills","crmOther","chatOther"];
const numericText=(value:string)=>value.normalize("NFKC").replace(/(\d),(?=\d{3}(?:\D|$))/g,"$1");
const ratePatterns=[/(?:時給|(?:円|万円)\s*[\/／]\s*(?:時(?:間)?|h)|(?:時(?:間)?)\s*(?:あたり|当たり|単価)|\/hour\b)/i,/(?:日給|(?:円|万円)\s*[\/／]\s*日|日\s*(?:あたり|当たり|単価)|日\s*\d[\d,]*\s*(?:円|万円)|\/day\b)/i,/(?:月給|月額|(?:円|万円)\s*[\/／]\s*月|月\s*(?:あたり|当たり|単価)|月\s*\d[\d,]*\s*(?:円|万円)|\/month\b)/i,/(?:年収|年俸|(?:円|万円)\s*[\/／]\s*年|年\s*(?:あたり|当たり|単価)|\/year\b)/i];
const withRateUnit=(value:string)=>ratePatterns.some(pattern=>pattern.test(numericText(value)));
function businessSpelling(value:string,names:readonly string[]):string {
 const ranges:{start:number;end:number}[]=[];
 for(const match of value.matchAll(/「[^」\n]*」|『[^』\n]*』|(?:株式会社|有限会社|合同会社|一般社団法人|NPO法人)[^\s、。，,\n「」()（）]*|[^\s、。，,\n「」()（）]+(?:株式会社|有限会社|合同会社)|(?:氏名|会社名|企業名|勤務先|所属)[：:][^\n]+/g))ranges.push({start:match.index,end:match.index+match[0].length});
 for(const name of names.filter(Boolean)){let start=value.indexOf(name);while(start>=0){ranges.push({start,end:start+name.length});start=value.indexOf(name,start+name.length);}}
 const merged:{start:number;end:number}[]=[];for(const range of ranges.sort((a,b)=>a.start-b.start)){const previous=merged.at(-1);if(previous&&range.start<=previous.end)previous.end=Math.max(previous.end,range.end);else merged.push({...range});}
 const normalize=(part:string)=>{for(const [pattern,replacement] of businessSpellings)part=part.replace(pattern,replacement);return part;};let result="",cursor=0;
 for(const range of merged){result+=normalize(value.slice(cursor,range.start))+value.slice(range.start,range.end);cursor=range.end;}return result+normalize(value.slice(cursor));
}

/** Read-only preparation: fact checks and spelling proposals never mutate saved fields. */
export function reviewIntroductionSource(raw:InterviewFields,protectedNames:readonly string[]=[]):IntroductionReview {
 const fields=normalizeInterviewFields(raw),checks:IntroductionCheck[]=[],revisions:IntroductionRevision[]=[],notes:string[]=[];
 for(const field of editableBusinessFields){const before=fields[field],after=businessSpelling(before,protectedNames);if(after!==before){fields[field]=after;revisions.push({field,label:interviewFieldLabels[field],before,after});}}
 const add=(code:string,keys:InterviewStringField[],title:string,detail:string)=>checks.push({code,fields:keys,title,detail});
 if(fields.desiredHourlyRate.trim()&&(/単位未確認|不明|どちら|未定|要確認/.test(fields.desiredHourlyRate)||/[\d０-９]/.test(fields.desiredHourlyRate)&&!withRateUnit(fields.desiredHourlyRate))){
  add("rate-unit",["desiredHourlyRate"],"希望単価の単位を確認","時給・日給・月額などの単位が読み取れません。単位を確認するまで、希望単価は共有本文へ入れません。原文は入力欄に残っています。");
  fields.desiredHourlyRate="";
 }
 const days=numericText(fields.daysPerWeek).match(/(?:週\s*(-?\d+(?:\.\d+)?)(?:\s*[〜～~\-]\s*(\d+(?:\.\d+)?))?|(?<!\d)(-?\d+(?:\.\d+)?)\s*日)/),weeklyDays=days?Number(days[2]||days[1]||days[3]):null;
 if(weeklyDays!==null&&(weeklyDays<1||weeklyDays>7))add("weekly-days",["daysPerWeek"],"週の稼働日数を確認","週の稼働日数が1〜7日の範囲に収まっていません。元の表記が回数・隔週などを意味するか確認してください。");
 const hours=numericText(fields.monthlyHours).match(/(-?\d+(?:\.\d+)?)(?:\s*[〜～~\-]\s*(\d+(?:\.\d+)?))?\s*(?:時間|h)/i),monthlyHours=hours?Number(hours[1]):null;
 if(fields.monthlyHours.trim()&&/(?:週|日)\s*(?:あたり|当たり|間)?\s*\d/.test(numericText(fields.monthlyHours)))add("hours-unit",["monthlyHours"],"月間時間と単位を確認","月間稼働時間の欄に週・日単位の記載があります。月・週・日のどの時間数かを確認してください。");
 if(monthlyHours!==null&&(monthlyHours<0||monthlyHours>744))add("monthly-hours",["monthlyHours"],"月間稼働時間を確認","負の時間数、または1か月の暦上の時間数を超える値です。時間数または単位の入力を確認してください。");
 const window=numericText(fields.timeWindow).match(/(\d{1,2})(?::(\d{2}))?\s*(?:時)?\s*[〜～~\-－]\s*(\d{1,2})(?::(\d{2}))?\s*(?:時)?/);
 if(window&&weeklyDays!==null&&weeklyDays>=1&&weeklyDays<=7&&monthlyHours!==null){const start=Number(window[1])+Number(window[2]||0)/60,end=Number(window[3])+Number(window[4]||0)/60;if(start>=0&&end<=24&&end>start&&monthlyHours>weeklyDays*(end-start)*5)add("hours-consistency",["timeWindow","daysPerWeek","monthlyHours"],"日数・時間帯・月間時間の整合を確認","記載された週の日数と時間帯だけでは、希望する月間時間に届かない可能性があります。時間帯が目安か、追加で稼働できる日があるか確認してください。");}
 if(fields.availableFrom.trim())notes.push("「稼働開始」の入力は稼働開始可能日・希望として扱います。実際に開始済みという実績には置き換えません。");
 if(!fields.workHistory.trim())add("experience-missing",["workHistory"],"紹介の中心となる経験を確認","担当業務・商材・期間のうち、分かるものを営業経験・職歴へ記録すると具体的な紹介文になります。未確認の経歴は補いません。");
 if(/(?:\d+|[一二三四五六七八九十]+)\s*位|トップ|top\s*\d/i.test(fields.achievements)&&!/(?:年|月|期|期間|対象|名中|人中|チーム|部署|全社|社内|営業会社)/.test(fields.achievements))add("achievement-scope",["achievements"],"順位の対象・期間を確認","順位だけでは比較対象や期間が分かりません。確認できる対象と期間を追記すると、実績を誇張せず伝えられます。");
 if(unicodeLength(fields.workHistory)>2500)notes.push("長い職歴は担当業務・商材・期間を中心に要約します。省略前の原文は入力欄に保持します。");
 // Internally contradictory scheduling data is withheld until corrected; it must
 // not become a fluent but misleading client-facing claim.
 for(const check of checks)if(["weekly-days","hours-unit","monthly-hours","hours-consistency"].includes(check.code))for(const field of check.fields)fields[field]="";
 return {fields,checks,revisions,notes};
}

function kanjiNumber(value:string):number {const digits:Record<string,number>={〇:0,零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},units:Record<string,number>={十:10,百:100,千:1000};if(!/[十百千]/.test(value))return Number([...value].map(char=>digits[char]).join(""));let number=0,digit=0;for(const char of value){if(char in digits)digit=digits[char];else{number+=(digit||1)*units[char];digit=0;}}return number+digit;}
const numbers=(text:string)=>new Set((numericText(text).replace(/[〇零一二三四五六七八九十百千]+(?=\s*(?:年|か月|ヶ月|ケ月|月|週間?|日|時間|件|社|人|円|位|代|%))/g,value=>String(kanjiNumber(value))).match(/\d+(?:\.\d+)?/g)||[]).map(value=>String(Number(value))));
const factualFields=(fields:InterviewFields)=>Object.entries(fields).filter(([key])=>!["attendanceConcerns","additionalNotes","interviewMemo","selfReflection","interviewAdvice"].includes(key)).map(([,value])=>Array.isArray(value)?value.join(" "):value).join("\n");
const tools=["Salesforce","kintone","HubSpot","Excel","Word","PowerPoint","Chatwork","Slack","MacBook","Windows","Claude","ChatGPT","Photoshop","Illustrator"];
function timeQuantities(text:string):Set<string>{const result=new Set<string>(),value=numericText(text);for(const match of value.matchAll(/(?<![\d年月日])(週|月|日)(?:間)?\s*(\d+(?:\.\d+)?)\s*(時間|h|日)|(?<!\d)(\d+(?:\.\d+)?)\s*(時間|h)\s*[\/／]\s*(週|月|日)/gi)){result.add(`${match[1]||match[6]}:${Number(match[2]||match[4])}:${/^(?:時間|h)$/i.test(match[3]||match[5])?"hours":"days"}`);}return result;}

/** Conservative, deterministic checks for material inventions; this is not a factual guarantee. */
export function introductionEvidenceIssues(draft:string,candidateName:string,prepared:InterviewFields,memo=""):string[] {
 const source=[candidateName,factualFields(prepared),memo].join("\n"),knownNumbers=numbers(source),issues:string[]=[];
 if([...numbers(draft)].some(value=>!knownNumbers.has(value)))issues.push("source-number");
 const lower=source.toLowerCase();if(tools.some(tool=>draft.toLowerCase().includes(tool.toLowerCase())&&!lower.includes(tool.toLowerCase())))issues.push("source-tool");
 if(prepared.availableFrom.trim()&&/(?:稼働|就業|勤務)(?:を)?(?:開始済み|開始しています|開始しました|開始した|中です|中である)/.test(draft)&&!/(?:稼働|就業|勤務)(?:を)?(?:開始済み|開始しています|開始しました|開始した|中です|中である)/.test(source))issues.push("availability-as-start");
 const knownTime=timeQuantities([source,prepared.monthlyHours?`月${prepared.monthlyHours}`:"",prepared.daysPerWeek?`週${prepared.daysPerWeek}`:""].join("\n"));
 if([...timeQuantities(draft)].some(quantity=>!knownTime.has(quantity)))issues.push("time-unit-changed");
 if(["正社員","契約社員","派遣社員","業務委託","アルバイト","パート"].some(term=>draft.includes(term)&&!source.includes(term)))issues.push("employment-type");
 for(const pattern of ratePatterns)if(pattern.test(numericText(draft))&&!pattern.test(numericText(source)))issues.push("rate-unit-changed");
 if(/本人申告/.test(source)&&!/(?:本人申告|本人による|本人から|と伺|と聞|とのこと|との申告)/.test(draft)&&/(?:経験|担当|実績|達成|勤務)/.test(draft))issues.push("self-report-removed");
 return [...new Set(issues)];
}

/** Presentation-only parsing; all text remains escaped by React and copied unchanged. */
export function introductionDocument(text:string):{heading:string;body:string}[] {
 const sections:{heading:string;body:string}[]=[];let current={heading:"",body:""};
 for(const line of text.split(/\r?\n/)){const match=line.trim().match(/^【([^】\n]{1,40})】$/);if(match){if(current.heading||current.body.trim())sections.push({...current,body:current.body.trim()});current={heading:match[1],body:""};}else current.body+=(current.body?"\n":"")+line;}
 if(current.heading||current.body.trim())sections.push({...current,body:current.body.trim()});return sections;
}

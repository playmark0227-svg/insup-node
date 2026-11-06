import {interviewFieldLabels,interviewStringFields, normalizeInterviewFields, unicodeLength, type InterviewFields, type InterviewStringField} from "./candidate-intake.ts";

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
const ratePatterns=[/(?:時給|(?:円|万円)\s*[\/／]\s*(?:時(?:間)?|h)|(?:時(?:間)?)\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|\/hour\b)/i,/(?:日給|(?:円|万円)\s*[\/／]\s*日|日\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|日\s*\d[\d,]*\s*(?:円|万円)|\/day\b)/i,/(?:月給|月額|(?:円|万円)\s*[\/／]\s*月|月\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|月\s*\d[\d,]*\s*(?:円|万円)|\/month\b)/i,/(?:年収|年俸|(?:円|万円)\s*[\/／]\s*年|年\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|\/year\b)/i];
const withRateUnit=(value:string)=>ratePatterns.some(pattern=>pattern.test(numericText(value)));
// Explicit personal reasons, not occupations such as 介護職/看護師/病院勤務.
// This is intentionally bounded; it is not a general health-data classifier.
const personalDetail=/(?:持病(?:で|が|の治療|を治療|あり|有り)|通院(?:しています|しております|しており|しているため|をしています|をしております|中です|予定です)|(?:毎週|定期的に|週\d+回|月\d+回)[^。\n]{0,8}通院|(?:家族|両親|親|父|母|祖父|祖母)の介護(?:で|のため|があり|中|をして|に伴|により|に専念|が必要|と両立|による)|(?:子ども|子供|お子様|息子|娘)(?:の|が)[^。\n]{0,10}(?:発熱|体調不良|送迎|通院|入院)(?:で|のため|があり|あり|への対応|によ|をして|をする|が必要|など|[：:]|$))/;
function businessSpelling(value:string,names:readonly string[]):string {
 const ranges:{start:number;end:number}[]=[];
 for(const match of value.matchAll(/「[^」\n]*」|『[^』\n]*』|(?:株式会社|有限会社|合同会社|一般社団法人|NPO法人)[^\s、。，,\n「」()（）]*|[^\s、。，,\n「」()（）]+(?:株式会社|有限会社|合同会社)|(?:氏名|会社名|企業名|勤務先|所属)[：:][^\n]+/g))ranges.push({start:match.index,end:match.index+match[0].length});
 for(const name of names.filter(Boolean)){let start=value.indexOf(name);while(start>=0){ranges.push({start,end:start+name.length});start=value.indexOf(name,start+name.length);}}
 const merged:{start:number;end:number}[]=[];for(const range of ranges.sort((a,b)=>a.start-b.start)){const previous=merged.at(-1);if(previous&&range.start<=previous.end)previous.end=Math.max(previous.end,range.end);else merged.push({...range});}
 const normalize=(part:string)=>{for(const [pattern,replacement] of businessSpellings)part=part.replace(pattern,replacement);return part;};let result="",cursor=0;
 for(const range of merged){result+=normalize(value.slice(cursor,range.start))+value.slice(range.start,range.end);cursor=range.end;}return result+normalize(value.slice(cursor));
}

const rankMention=/(?:[0-9０-９一二三四五六七八九十]+\s*位|トップ|top\s*\d+|No[.．]?\s*[0-9０-９]+|ナンバーワン|首位)/i;
/** Preserve only uncertainty already written alongside a rank, never invent its
 * period, comparison group, or a supposedly verified achievement. */
export function introductionRankQualifications(value:string):string[] {
 if(!rankMention.test(value))return [];
 return [...new Set(value.split(/[。\n]/).map(part=>part.trim()).filter(part=>/(?:未確認|不明|確認中|要確認)/.test(part)&&/(?:期間|時期|比較|人数|対象|名中|人中)/.test(part)))];
}
export function missingIntroductionRankQualification(body:string,qualifications:readonly string[]):boolean {
 if(!rankMention.test(body)||!qualifications.length)return false;
 const retained=introductionRankQualifications(body).join("\n"),source=qualifications.join("\n");
 return /期間|時期/.test(source)&&!(/期間|時期/.test(retained))||/比較|人数|対象|名中|人中/.test(source)&&!(/比較|人数|対象|名中|人中/.test(retained));
}

/** Expand only separated clock ranges. A free-form note is never split into two
 * guessed times, and impossible/overnight-ambiguous times need confirmation. */
function preparedTimeWindow(raw:string):{value:string;needsConfirmation:boolean} {
 const clock="[0-9０-９]{1,4}(?:[：:][0-9０-９]{2}|時(?:[0-9０-９]{1,2}分)?)?";
 const ranges=new RegExp(`(?<![0-9０-９:：.])(${clock})[\\t ]*([〜～~\\-－–—])[\\t ]*(翌(?:日)?[\\t ]*)?(${clock})(?![0-9０-９:：.])`,"g");
 const dates=[...raw.matchAll(/[0-9０-９]{4}(?:[-－/／][0-9０-９]{1,2}[-－/／][0-9０-９]{1,2}|年[0-9０-９]{1,2}月[0-9０-９]{1,2}日)/g)].map(match=>({start:match.index,end:match.index+match[0].length}));
 const protectedDate=(start:number,end:number)=>dates.some(date=>start<date.end&&end>date.start);
 const parsed=(token:string)=>{
  const normalized=token.normalize("NFKC"),colon=normalized.match(/^(\d{1,2}):(\d{2})$/),japanese=normalized.match(/^(\d{1,2})時(?:(\d{1,2})分)?$/);
  const compact=/^\d{3,4}$/.test(normalized);
  const hour=colon||japanese?Number((colon||japanese)![1]):compact?Number(normalized.slice(0,-2)):Number(normalized);
  const minute=colon||japanese?Number((colon||japanese)![2]||0):compact?Number(normalized.slice(-2)):0;
  return {hour,minute,compact,valid:hour>=0&&hour<=24&&minute>=0&&minute<60&&(hour!==24||minute===0),text:`${hour}:${String(minute).padStart(2,"0")}`};
 };
 let value="",cursor=0,needsConfirmation=false;
 const consumed:{start:number;end:number}[]=[];
 for(const match of raw.matchAll(ranges)){
  const start=match.index,end=start+match[0].length;
  if(protectedDate(start,end)||/^(?:時間|h\b|日|か月|ヶ月|ケ月|年|件|円|%)/i.test(raw.slice(end)))continue;
  const from=parsed(match[1]),to=parsed(match[4]),following=raw.slice(end),preceding=raw.slice(0,start);
  const chained=new RegExp(`^[\\t ]*[〜～~\\-－–—][\\t ]*${clock}`).test(following)||new RegExp(`${clock}[\\t ]*[〜～~\\-－–—][\\t ]*$`).test(preceding);
  if(!from.valid||!to.valid||from.hour===24||!match[3]&&to.hour*60+to.minute<=from.hour*60+from.minute||chained)needsConfirmation=true;
  consumed.push({start,end});
  value+=raw.slice(cursor,start)+(from.compact||to.compact?`${from.text}〜${match[3]||""}${to.text}`:match[0]);cursor=end;
 }
 value+=raw.slice(cursor);
 const unused=(start:number,end:number)=>!protectedDate(start,end)&&!consumed.some(range=>start>=range.start&&end<=range.end);
 // An isolated compact time, concatenated range, or adjacent clock tokens has
 // no reliable range boundary. Explicit dates and durations stay untouched.
 for(const match of raw.matchAll(/(?<![0-9０-９.])([0-9０-９]{3,8})(?![0-9０-９.]|年|月|日|時間|h\b|件|円)/gi))if(unused(match.index,match.index+match[0].length))needsConfirmation=true;
 for(const match of raw.matchAll(new RegExp(`(?<![0-9０-９:：.])(${clock})[\\t ]+(${clock})(?![0-9０-９:：.])`,"g")))if(unused(match.index,match.index+match[0].length))needsConfirmation=true;
 for(const match of raw.matchAll(/(?<![0-9０-９:：.])[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?[\t ]*[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?/g))if(unused(match.index,match.index+match[0].length))needsConfirmation=true;
 for(const match of raw.matchAll(/(?<![0-9０-９:：.])[0-9０-９]{1,3}(?:[：:][0-9０-９]{1,3}|時(?:[0-9０-９]{1,3}分)?)(?![0-9０-９:：.])/g))if(unused(match.index,match.index+match[0].length)&&!parsed(match[0]).valid)needsConfirmation=true;
 return {value:needsConfirmation?raw:value,needsConfirmation};
}

/** Read-only preparation: fact checks and spelling proposals never mutate saved fields. */
export function reviewIntroductionSource(raw:InterviewFields,protectedNames:readonly string[]=[]):IntroductionReview {
 const fields=normalizeInterviewFields(raw),checks:IntroductionCheck[]=[],revisions:IntroductionRevision[]=[],notes:string[]=[];
 const add=(code:string,keys:InterviewStringField[],title:string,detail:string)=>checks.push({code,fields:keys,title,detail});
 // An explicit choice not to disclose an attribute is not client-facing evidence.
 if(/^(?:回答しない|回答を控える|未回答)$/.test(fields.gender.trim()))fields.gender="";
 const privateFields:InterviewStringField[]=[];
 for(const field of interviewStringFields)if(!["attendanceConcerns","additionalNotes","interviewMemo","selfReflection","interviewAdvice"].includes(field)&&personalDetail.test(fields[field])){privateFields.push(field);fields[field]="";}
 if(privateFields.length)add("private-detail",privateFields,"共有文に入れない個人事情を分離",`${privateFields.map(field=>interviewFieldLabels[field]).join("・")}に個人の健康・家庭事情を含む記載があります。この項目は共有文から一旦省いています。共有できる経歴・条件と社内確認用の事情を分けて記録してください。原文は入力欄に残っています。`);
 for(const field of editableBusinessFields){const before=fields[field],after=businessSpelling(before,protectedNames);if(after!==before){fields[field]=after;revisions.push({field,label:interviewFieldLabels[field],before,after});}}
 const timeWindow=preparedTimeWindow(fields.timeWindow);
 if(timeWindow.needsConfirmation){add("time-window",["timeWindow"],"希望時間帯の時刻を確認","時刻の区切りや実在する時間を確認してください。『9:00〜18:00』のように開始・終了を分け、日をまたぐ場合は『翌』を記録してください。確認するまで希望時間帯は共有本文へ入れません。原文は入力欄に残っています。");fields.timeWindow="";}
 else if(timeWindow.value!==fields.timeWindow){const before=fields.timeWindow;fields.timeWindow=timeWindow.value;revisions.push({field:"timeWindow",label:interviewFieldLabels.timeWindow,before,after:timeWindow.value});}
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
const evidenceText=(text:string)=>numericText(text).replace(/\bB2([BC])\b/gi,"Bto$1").replace(/[〇零一二三四五六七八九十百千]+(?=\s*(?:年|か月|ヶ月|ケ月|月|週間?|日|時間|件|通|本|回|コール|アポ|社|人|円|位|代|%|パーセント))/g,value=>String(kanjiNumber(value)));
const numbers=(text:string)=>new Set((evidenceText(text).replace(/(?<!\d)1\s*(?:日|週間?|か月|ヶ月|ケ月|時間|年)\s*(?:あたり|当たり|につき)|[\/／]\s*1\s*(?:日|週間?|か月|ヶ月|ケ月|月|時間|年)/g,"").match(/\d+(?:\.\d+)?/g)||[]).map(value=>String(Number(value))));
const factualFields=(fields:InterviewFields)=>Object.entries(fields).filter(([key])=>!["attendanceConcerns","additionalNotes","interviewMemo","selfReflection","interviewAdvice"].includes(key)).map(([,value])=>Array.isArray(value)?value.join(" "):value).join("\n");
const tools=["Salesforce","kintone","HubSpot","Excel","Word","PowerPoint","Chatwork","Slack","MacBook","Windows","Claude","ChatGPT","Photoshop","Illustrator"];
function timeQuantities(text:string):Set<string>{const result=new Set<string>(),value=numericText(text);for(const match of value.matchAll(/(?<![\d年月日])(週|月|日)(?:間)?\s*(\d+(?:\.\d+)?)\s*(時間|h|日)|(?<!\d)(\d+(?:\.\d+)?)\s*(時間|h)\s*[\/／]\s*(週|月|日)/gi)){result.add(`${match[1]||match[6]}:${Number(match[2]||match[4])}:${/^(?:時間|h)$/i.test(match[3]||match[5])?"hours":"days"}`);}return result;}

type MetricClaim={value:string;unit:string;period:string|null;qualifier:string|null;approximate:boolean;metric:string|null;company:string|null};
const periodPatterns:readonly [string,RegExp][]=[
 ["day",/(?:1\s*日\s*(?:あたり|当たり|につき)|日次|日間|毎日|日ごと|(?<![\d年月])日(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?日)/],
 ["week",/(?:1\s*週間?\s*(?:あたり|当たり|につき)|週次|週間|毎週|週ごと|週(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?週)/],
 ["month",/(?:1\s*(?:か月|ヶ月|ケ月)\s*(?:あたり|当たり|につき)|月次|月間|毎月|月ごと|(?<![\d年])月(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?月)/],
 ["year",/(?:1\s*年\s*(?:あたり|当たり|につき)|年次|年間|毎年|年ごと|(?<!\d)年(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?年)/],
 ["hour",/(?:1\s*時間\s*(?:あたり|当たり|につき)|時間(?:あたり|当たり)|[\/／]\s*(?:1\s*)?(?:時間|時|h\b))/i],
];
const metricPatterns:readonly [string,RegExp][]=[
 ["call",/架電|発信|コール|テレアポ|電話営業/],
 ["appointment",/(?<!テレ)アポ(?:イント)?(?!インター)|商談設定|商談獲得/],
 ["contract",/成約|受注|契約獲得/],
 ["meeting",/商談(?!設定|獲得)|面談/],
 ["sales",/売上|売り上げ/],
 ["achievement-rate",/達成率/],
];
const uniqueMarker=(text:string,patterns:readonly [string,RegExp][])=>{const found=patterns.filter(([,pattern])=>pattern.test(text)).map(([key])=>key);return found.length===1?found[0]:null;};
function metricQualifier(text:string):string|null {
 const patterns:readonly [string,RegExp][]=[["maximum",/最大|最多|最高/],["average",/平均|アベレージ/],["target",/(?:目標|ノルマ)(?!達成|比|に対)/]];
 const limited=patterns.filter(([,pattern])=>pattern.test(text));
 return limited.length===1?limited[0][0]:limited.length?null:/実績|実際/.test(text)?"actual":null;
}
type CompanyMention={start:number;name:string};
function companyMentions(text:string):CompanyMention[] {
 const result:CompanyMention[]=[],corporation="(?:株式会社|有限会社|合同会社)",name="[^\\s、,。;；:：（）()【】〈〉■「」]{1,40}?";
 // Only explicit proper names qualify. Generic words such as 営業会社/同社 do
 // not establish an employer, and no company aliases are guessed.
 const pattern=new RegExp(`${corporation}${name}(?=(?:で(?:は|の)?(?=[\\s、,]|月|日|週|年|1|最大|平均|目標|実績|架電|営業|法人|個人|新規|既存|テレアポ|コール|電話|Bto|toB|成約|受注|勤務|担当|\\d)|に(?:て|おいて|勤務|所属|入社)|の(?:勤務|営業|実績)|[\\s、,。;；:：（）()【】〈〉■「」]|$))|(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9-]{0,24}社(?![A-Za-z])`,"g");
 for(const match of text.matchAll(pattern))result.push({start:match.index,name:match[0]});
 // Suffix corporations are accepted only at a clearly bounded name start.
 for(const match of text.matchAll(/(?:^|[\n\s、,。:：■「])([^\s、,。:：（）()【】〈〉■「」]{1,30}(?:株式会社|有限会社|合同会社))/g))if(!result.some(item=>item.name===match[1]&&Math.abs(item.start-match.index)<2))result.push({start:match.index+match[0].indexOf(match[1]),name:match[1]});
 return result.sort((a,b)=>a.start-b.start);
}
function metricClaims(raw:string):MetricClaim[] {
 const text=evidenceText(raw),matches=[...text.matchAll(/(\d+(?:\.\d+)?)\s*(件|通|本|回|人|社|%|パーセント|コール|アポイント|アポ(?!インター))/g)],companies=companyMentions(text),result:MetricClaim[]=[];
 for(let index=0;index<matches.length;index++){
  const match=matches[index],start=match.index,end=start+match[0].length;
  const sentenceStart=Math.max(text.lastIndexOf("。",start-1),text.lastIndexOf("\n",start-1),text.lastIndexOf(";",start-1),text.lastIndexOf("；",start-1))+1;
  const nextStop=text.slice(end).search(/[。\n;；]/),sentenceEnd=nextStop<0?text.length:end+nextStop;
  const previousEnd=index&&matches[index-1].index>=sentenceStart?matches[index-1].index+matches[index-1][0].length:sentenceStart;
  const nextStart=matches[index+1]?.index??text.length;
  const before=text.slice(previousEnd,start).split(/[、,]/).at(-1)??"";
  const after=text.slice(end,Math.min(sentenceEnd,nextStart)).split(/[、,]/)[0];
  const local=before+match[0]+after,sentence=text.slice(sentenceStart,sentenceEnd);
  // A missing local marker can inherit an unambiguous sentence-level unit or
  // business metric, never a maximum/average from a different numeric claim.
  const period=uniqueMarker(local,periodPatterns)??uniqueMarker(sentence,periodPatterns);
  const metric=match[2]==="コール"?"call":/^アポ/.test(match[2])?"appointment":uniqueMarker(local,metricPatterns)??uniqueMarker(sentence,metricPatterns);
  const summaryStart=[...text.slice(0,start).matchAll(/【(?:総評|まとめ|基本情報|稼働[^】]*)】/g)].at(-1)?.index??-1;
  const company=companies.filter(item=>item.start<start&&item.start>summaryStart).at(-1)?.name??null;
  const meaning=companies.reduce((value,item)=>value.replaceAll(item.name,""),local);
  const approximate=/(?:(?<!成|契)約|およそ)\s*(?:(?:日|月|週|年|時間)(?:間)?\s*)?$/.test(before)||/^\s*(?:程度|ほど|前後)/.test(after);
  // Shorthand carries a metric but still represents a count. Do not turn an
  // unlabelled 件 in a neighbouring sentence into a different numeric dimension.
  const unit=match[2]==="コール"||/^アポ/.test(match[2])?"件":match[2]==="パーセント"?"%":match[2];
  result.push({value:String(Number(match[1])),unit,period,metric,qualifier:metricQualifier(meaning),approximate,company});
 }
 return result;
}
function metricEvidenceIssues(draft:string,sources:readonly string[]):string[] {
 const known=sources.flatMap(metricClaims),knownNumbers=numbers(sources.join("\n")),issues:string[]=[];
 for(const claim of metricClaims(draft)){
  let candidates=known.filter(source=>source.value===claim.value&&(source.unit===claim.unit||source.metric==="call"&&claim.metric==="call"&&["件","通"].includes(source.unit)&&["件","通"].includes(claim.unit)));
  // The general number check handles new numbers. Here a tuple is compared only
  // when a readable count/rate exists on both sides.
  if(!candidates.length){if(knownNumbers.has(claim.value))issues.push("metric-context-changed");continue;}
  if(claim.company&&candidates.some(source=>source.company)){
   const own=candidates.filter(source=>source.company===claim.company);
   if(!own.length){issues.push("company-metric-changed");continue;}candidates=own;
  }
  if(claim.metric&&candidates.some(source=>source.metric)){
   const sameMetric=candidates.filter(source=>!source.metric||source.metric===claim.metric);
   if(!sameMetric.length){issues.push("metric-context-changed");continue;}candidates=sameMetric;
  }
  const samePeriod=candidates.filter(source=>source.period===claim.period);
  if(!samePeriod.length&&candidates.some(source=>source.period||claim.period)){issues.push("metric-period-changed");continue;}
  if(samePeriod.length)candidates=samePeriod;
  // Unmarked factual counts may be explicitly called an 実績. A maximum,
  // average or target must keep its limiting meaning rather than become a fact.
  const sameMeaning=candidates.some(source=>(source.qualifier===claim.qualifier||(!source.qualifier&&claim.qualifier==="actual"))&&(!source.approximate||claim.approximate));
  if(!sameMeaning)issues.push("metric-qualifier-changed");
 }
 return issues;
}
const escapePattern=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function experiencePolarity(text:string,subject:string):{negative:boolean;positive:boolean} {
 let negative=false,positive=false;
 const pattern=new RegExp(escapePattern(subject),"gi");
 for(const match of text.matchAll(pattern)){
  const tail=text.slice(match.index+match[0].length).split(/[。\n、,;；]/)[0].slice(0,65);
  const before=text.slice(Math.max(0,match.index-16),match.index);
  const neg=/^(?:(?:の|での|を|は|について|に関して|[・:：\s])*)(?:(?:使用|利用|実務|操作|営業|業務|担当|活用)(?:の)?)?(?:経験(?:は|が|[：:\s])*(?:ない|なし|ありません)|未経験|未使用|なし|ありません|を?使ったこと(?:は|が)?(?:ない|なし|ありません)|を?使用したこと(?:は|が)?(?:ない|なし|ありません))/.test(tail)||/^(?:(?:の|を|は|[・:：\s])*)(?:使用|利用|操作|活用)(?:経験)?(?:は|が)?(?:ない|なし|未経験|できない|ありません|できません)/.test(tail);
  if(neg)negative=true;
  else if(!/未確認|確認中|要確認|不明|経験を確認|経験の確認|使えるか|利用できるか/.test(tail)){
   if(/^(?:(?:の|での|を|は|について|[・:：\s])*)(?:(?:使用|利用|実務|操作|営業|業務|担当|活用)(?:の)?)?(?:経験(?:が|は|を)?(?:ある|あり|あります|持|有)|経験者|を?使(?:え|用)|を?(?:使った|使用した)こと(?:が|は)?(?:ある|あり)|を?使用|を?利用|を?活用|を?担当|が?使える|が?使用できる|が?利用できる|に?対応(?:可能|でき))/.test(tail)||/^(?:(?:を|が|は|[・:：\s])*)(?:使用|利用|活用|操作)(?:でき|可能|して|経験|あり)/.test(tail)||/(?:使用可能|利用可能|経験あり|経験済み|使用ツール|利用ツール)[：:\s]*$/.test(before))positive=true;
  }
 }
 return {negative,positive};
}
function negatedExperienceIssues(draft:string,sources:readonly string[]):boolean {
 const subjects=[...tools,"法人営業","個人営業","BtoB営業","toB営業","BtoC営業","toC営業","テレアポ","営業"];
 // A generic 営業 claim may refer to a different experience when the source only
 // negates a specific type. Check that type, not a substring inside it.
 const canonical=(text:string)=>evidenceText(text).replace(/\bBto([BC])\b/gi,"to$1");
 for(const subject of subjects){
  const key=canonical(subject),texts=sources.map(canonical),states=texts.map(value=>experiencePolarity(key==="営業"?value.replace(/(?:法人|個人|to[BC])営業/g,""):value,key));
  if(!states.some(state=>state.negative)||states.some(state=>state.positive))continue;
  const target=canonical(draft),state=experiencePolarity(key==="営業"?target.replace(/(?:法人|個人|to[BC])営業/g,""):target,key);
  if(state.positive)return true;
 }
 const texts=sources.map(canonical),crmStates=texts.map(text=>experiencePolarity(text,"CRM"));
 if(crmStates.some(state=>state.negative)&&!crmStates.some(state=>state.positive))for(const tool of ["Salesforce","kintone","HubSpot"]){
  if(experiencePolarity(canonical(draft),tool).positive&&!texts.some(text=>experiencePolarity(text,tool).positive))return true;
 }
 return false;
}
type ExperienceDuration={quantity:string;unit:"year"|"month";half:boolean;company:string|null;approximate:boolean;limit:string|null};
function experienceDurations(raw:string):ExperienceDuration[] {
 const text=evidenceText(raw),companies=companyMentions(text),claims:ExperienceDuration[]=[];
 for(const match of text.matchAll(/(?<![\d.年月])(\d+(?:\.\d+)?)\s*(年(?:間)?|か月|ヶ月|ケ月|カ月|ヵ月)(半)?(?![\d年月日])/g)){
  // A calendar year (2026年) is not a duration. Calendar month/day notation
  // cannot establish a number of months of experience either.
  if(Number(match[1])>100||/^\s*(?:あたり|当たり|につき)/.test(text.slice(match.index+match[0].length))||/[\/／]\s*$/.test(text.slice(0,match.index)))continue;
  const boundary=[...text.slice(0,match.index).matchAll(/【[^】]+】/g)].at(-1)?.index??-1;
  const company=companies.filter(item=>item.start<match.index&&item.start>boundary).at(-1)?.name??null;
  const before=text.slice(Math.max(0,match.index-12),match.index),after=text.slice(match.index+match[0].length);
  const approximate=/(?:約|およそ|概ね)\s*$/.test(before)||/^\s*(?:程度|ほど|前後)/.test(after);
  const limit=after.match(/^\s*(以上|以下|未満|超)/)?.[1]??before.match(/(最大|最長|最低|最短)\s*$/)?.[1]??null;
  claims.push({quantity:String(Number(match[1])),unit:match[2].startsWith("年")?"year":"month",half:!!match[3],company,approximate,limit});
 }
 return claims;
}
function changedExperiencePeriod(draft:string,sources:readonly string[]):boolean {
 const known=sources.flatMap(experienceDurations);
 return experienceDurations(draft).some(claim=>{
  let candidates=known.filter(source=>source.quantity===claim.quantity&&source.unit===claim.unit&&source.half===claim.half);
  if(claim.company&&candidates.some(source=>source.company))candidates=candidates.filter(source=>source.company===claim.company);
  return !candidates.some(source=>(!source.approximate||claim.approximate)&&source.limit===claim.limit);
 });
}

function unsupportedAchievement(draft:string,source:string):boolean {
 // Explicit events only; ordinary paraphrases of strengths and capabilities are
 // deliberately not graded by a keyword-based factual checker.
 const topics:readonly [RegExp,RegExp][]=[
  [/(?:研修|講習|講座)(?:を)?(?:受講|修了)|(?:研修|講習|講座)で(?:の)?(?:実績|受賞|成績)/, /研修|講習|講座/],
  [/(?:資格|免許)(?:を)?(?:取得|保有|持って)|(?:認定資格|有資格者)/,/資格|免許|認定/],
  [/(?:受賞|表彰)(?:歴|経験|され|を受け|実績|があり)|(?:賞|表彰)を(?:受|獲得)/,/受賞|表彰|賞を|賞に/],
  [/(?:管理職|マネージャー|部長|課長|リーダー)(?:として|を(?:担当|経験|務め)|の経験|経験)/,/管理職|マネージャー|部長|課長|リーダー/],
 ];
 return topics.some(([claim,evidence])=>claim.test(draft)&&!evidence.test(source));
}

/** Concrete additions observed in small-model introductions. Only explicit
 * source claims can support these outcomes; ordinary work is not their proof. */
function unsupportedNarrativeAssessment(draft:string,source:string):boolean {
 if(/(?:今後|将来|これから)[^。\n]{0,50}(?:貢献|寄与|活躍|期待)|(?:貢献|寄与|活躍)(?:すること|できること)?(?:が|を)?(?:期待|見込)|(?:貢献|寄与|活躍)できる(?:可能性|と考え|と思い)/.test(draft))return true;
 const patterns:readonly RegExp[]=[
  /長け(?:て|る)/,/秀で(?:て|る)/,/卓越(?:した|する)/,/高度な能力/,/高度なスキル/,/高い能力/,/高い専門性/,/高い適応力/,
  /顧客満足(?:度)?[^。\n]{0,12}(?:向上|改善)/,
  ...["課題(?:の|を)?解決","チーム","組織","事業","売上","利益","成果","業績","生産性"].map(topic=>new RegExp(`${topic}[^。\\n]{0,20}(?:貢献|寄与)`)),
 ];
 return patterns.some(pattern=>pattern.test(draft)&&!pattern.test(source));
}

/** Conservative, deterministic checks for material inventions; this is not a factual guarantee. */
export function introductionEvidenceIssues(draft:string,candidateName:string,prepared:InterviewFields,memo=""):string[] {
 const source=[candidateName,factualFields(prepared),memo].join("\n"),knownNumbers=numbers(source),issues:string[]=introductionContentIssues(draft);
 const sourceParts=[...Object.entries(prepared).filter(([key])=>!["attendanceConcerns","additionalNotes","interviewMemo","selfReflection","interviewAdvice"].includes(key)).map(([,value])=>Array.isArray(value)?value.join(" "):value),memo];
 if([...numbers(draft)].some(value=>!knownNumbers.has(value)))issues.push("source-number");
 const lower=source.toLowerCase();if(tools.some(tool=>draft.toLowerCase().includes(tool.toLowerCase())&&!lower.includes(tool.toLowerCase())))issues.push("source-tool");
 if(prepared.availableFrom.trim()&&/(?:稼働|就業|勤務)(?:を)?(?:開始済み|開始しています|開始しました|開始した|中です|中である)/.test(draft)&&!/(?:稼働|就業|勤務)(?:を)?(?:開始済み|開始しています|開始しました|開始した|中です|中である)/.test(source))issues.push("availability-as-start");
 const knownTime=timeQuantities([source,prepared.monthlyHours?`月${prepared.monthlyHours}`:"",prepared.daysPerWeek?`週${prepared.daysPerWeek}`:""].join("\n"));
 if([...timeQuantities(draft)].some(quantity=>!knownTime.has(quantity)))issues.push("time-unit-changed");
 if(["正社員","契約社員","派遣社員","業務委託","アルバイト","パート"].some(term=>draft.includes(term)&&!source.includes(term)))issues.push("employment-type");
 for(const pattern of ratePatterns)if(pattern.test(numericText(draft))&&!pattern.test(numericText(source)))issues.push("rate-unit-changed");
 if(/本人申告/.test(source)&&!/(?:本人申告|本人による|本人から|と伺|と聞|とのこと|との申告)/.test(draft)&&/(?:経験|担当|実績|達成|勤務)/.test(draft))issues.push("self-report-removed");
 issues.push(...metricEvidenceIssues(draft,sourceParts));
 if(negatedExperienceIssues(draft,sourceParts))issues.push("experience-negation-changed");
 if(changedExperiencePeriod(draft,sourceParts))issues.push("experience-period-changed");
 if(unsupportedAchievement(draft,source))issues.push("source-achievement");
 if(unsupportedNarrativeAssessment(draft,source))issues.push("source-assessment");
 const rankQualifications=sourceParts.flatMap(introductionRankQualifications);
 if(draft.split(/【[^】\n]+】|(?:^|\n)[\t ]*(?:#{1,6}[\t ]+|\*\*)[^\n]+/).some(part=>missingIntroductionRankQualification(part,rankQualifications)))issues.push("rank-scope-removed");
 return [...new Set(issues)];
}

/** A user can polish the proposed wording without silently adding new facts. */
export function editedIntroductionIssues(draft:string,candidateName:string,prepared:InterviewFields):string[] {
 const issues:string[]=[];
 if(!draft.trim())issues.push("empty-draft");
 if(unicodeLength(draft)>1000)issues.push("draft-length");
 const labelledName=draft.match(/(?:^|\n)\s*(?:氏名|候補者名|名前)\s*[：:]\s*([^\n]+)/)?.[1].trim();
 if(candidateName.trim()&&(!draft.includes(candidateName.trim())||labelledName!==undefined&&labelledName!==candidateName.trim()))issues.push("candidate-name");
 return [...new Set([...issues,...introductionEvidenceIssues(draft,candidateName,prepared)])];
}

/** Apply the same content boundary to a model draft or a manually polished candidate. */
export function introductionContentIssues(draft:string):string[] {
 const issues:string[]=[];
 if(personalDetail.test(draft))issues.push("source-private-detail");
 if(/採用(?:すべき|を推奨|適性|可否)|不採用(?:を推奨|にすべき)|(?:能力|適性|人物)(?:評価|スコア|点数)|\d+\s*点満点|即戦力(?:です|として|と判断|人材|の人材)|優秀な(?:人材|候補者)|ポテンシャル(?:が高|の高|に期待)|成長が期待/.test(draft))issues.push("source-assessment");
 if(/(?<![〇零一二三四五六七八九十百千万億0-9０-９])[〇○◯●□]{2,}(?![〇零一二三四五六七八九十百千万億0-9０-９])|(?:\b|[：:])X{2,}(?=\b|[位件円年名社])/i.test(draft))issues.push("source-format");
 const schemaArtifact=/["'](?:\$schema|properties|required|additionalProperties|responseConstraint|minLength|maxLength|minItems|maxItems|draft|summary|questions|actions)["']\s*:|["']type["']\s*:\s*["'](?:object|array|string|integer|number|boolean|null)["']|```(?:json)?\s*[\[{]/i;
 let decoded=draft;
 for(let depth=0;depth<3;depth++){
  if(schemaArtifact.test(decoded)){issues.push("source-format");break;}
  try{const value:unknown=JSON.parse(decoded);if(value!==null&&typeof value==="object"){issues.push("source-format");break;}if(typeof value!=="string"||value===decoded)break;decoded=value;}catch{break;}
 }
 return issues;
}

/** Presentation-only parsing; all text remains escaped by React and copied unchanged. */
export function introductionDocument(text:string):{heading:string;body:string}[] {
 const sections:{heading:string;body:string}[]=[];let current={heading:"",body:""};
 for(const line of text.split(/\r?\n/)){const match=line.trim().match(/^【([^】\n]{1,40})】$/);if(match){if(current.heading||current.body.trim())sections.push({...current,body:current.body.trim()});current={heading:match[1],body:""};}else current.body+=(current.body?"\n":"")+line;}
 if(current.heading||current.body.trim())sections.push({...current,body:current.body.trim()});return sections;
}

export type IntroductionQualityIssue = {code:"missing-section"|"source-coverage"|"note-fragments"|"repeated-sentence";title:string;detail:string;field?:InterviewStringField};
export type IntroductionQualityReview = {issues:IntroductionQualityIssue[];checkedSections:string[]};

/** Editorial checks only. Vocabulary coverage can flag a valid paraphrase, so
 * these are review prompts rather than a factual guarantee or an adoption gate. */
export function reviewIntroductionQuality(draft:string,fields:InterviewFields,settings:{tone:"formal"|"plain";includeSummary:boolean}):IntroductionQualityReview {
 const document=introductionDocument(draft),section=(heading:string)=>document.find(part=>part.heading===heading)?.body||"";
 const expected:[string,InterviewStringField][]=[];
 const evidence=(value:string)=>!!value.trim()&&!/^(?:未確認|確認中|記載なし|情報なし|未入力)[。．]?$/u.test(value.trim());
 if(evidence(fields.workHistory))expected.push(["営業経験・職務経歴","workHistory"]);
 if(evidence(fields.achievements)||evidence(fields.strengths))expected.push(["営業における強み",evidence(fields.strengths)?"strengths":"achievements"]);
 if(settings.includeSummary&&expected.length)expected.push(["総評","workHistory"]);
 const issues:IntroductionQualityIssue[]=[];
 for(const [heading,field] of expected)if(!section(heading).trim())issues.push({code:"missing-section",field,title:`${heading}の材料を確認`,detail:`入力に材料がありますが、「${heading}」の節がありません。ほかの節に含めたか、必要な説明が抜けていないか確認してください。`});
 const experience=section("営業経験・職務経歴"),sources=fields.workHistory.normalize("NFKC").toLocaleLowerCase("ja"),body=experience.normalize("NFKC").toLocaleLowerCase("ja");
 if(experience&&evidence(fields.workHistory)){
  const groups:readonly (readonly [string,readonly string[]])[]=[
   ["法人向け",["法人","btob","b2b","tob"]],["個人向け",["個人","btoc","b2c","toc"]],
   ["SaaS",["saas"]],["電話での営業・案内",["テレアポ","架電","電話営業","電話案内","電話で","電話による","アウトバウンド"]],
   ["リスト作成",["リスト作成","リストの作成","リストを作成"]],["ヒアリング",["ヒアリング","聞き取り","聞き取","聞き出"]],
   ["訪問販売",["訪問販売","訪問営業"]],["接客",["接客","来店者への応対","来店客への応対"]],
  ];
  const missing=groups.filter(([,aliases])=>aliases.some(value=>sources.includes(value))&&!aliases.some(value=>body.includes(value))).map(([label])=>label);
  for(const company of new Set(companyMentions(fields.workHistory).map(item=>item.name)))if(!experience.includes(company))missing.push(company);
  const durations=(value:string)=>new Map([...evidenceText(value).matchAll(/(\d+(?:\.\d+)?)\s*(年(?:間)?|か月|ヶ月|ケ月|カ月|ヵ月)(?![0-9０-９日])/g)].map(match=>[`${Number(match[1])}:${match[2].startsWith("年")?"year":"month"}`,match[0]]));
  const sourceDurations=durations(fields.workHistory),bodyDurations=durations(experience);
  for(const [key,label] of sourceDurations)if(!bodyDurations.has(key))missing.push(label);
  if(missing.length)issues.push({code:"source-coverage",field:"workHistory",title:"職歴から抜けた説明がないか確認",detail:`原文にある「${missing.slice(0,6).join("」「")}」に対応する表記が職歴本文では見つかりません。言い換えで残っているかを読み直し、必要なら候補文を修正してください。`});
 }
 const narrative=document.filter(part=>["営業経験・職務経歴","営業における強み","総評"].includes(part.heading));
 if(settings.tone==="formal"&&narrative.some(part=>["営業経験・職務経歴","総評"].includes(part.heading)&&part.body.trim()&&!/(?:です|ます|ました|でした|おります)[。！？\s]/u.test(part.body+"\n")))issues.push({code:"note-fragments",title:"メモの羅列になっていないか確認",detail:"丁寧語の設定ですが、職歴または総評が単語・体言止め中心です。担当していた仕事が読み手へ伝わる文章になっているか確認してください。"});
 const seen=new Set<string>();let repeated=false;
 for(const part of narrative)for(const line of part.body.split(/[。\n！？]/)){
  if(/本人申告の内容を含みます|順位の確認範囲/.test(line))continue;
  const normalized=line.normalize("NFKC").replace(/[\s・、,「」『』〈〉]/g,"");
  if(unicodeLength(normalized)<18)continue;
  if(seen.has(normalized))repeated=true;seen.add(normalized);
 }
 if(repeated)issues.push({code:"repeated-sentence",title:"同じ文章の繰り返しを確認",detail:"同じ文が複数の場所にあります。職歴は担当内容、強みは具体的な工夫、総評は全体像という役割に分けると読みやすくなります。"});
 return {issues,checkedSections:expected.map(([heading])=>heading)};
}

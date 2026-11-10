import test from "node:test";
import assert from "node:assert/strict";
import { filterCandidateGroups, groupCandidates, sortCandidateGroups, candidateAppointments, candidateFilterCount } from "../lib/candidate-groups.ts";
import type { CandidateRecord } from "../lib/sheets-client.ts";
import { blankInterviewFields, type CandidateProfile } from "../lib/candidate-intake.ts";

function record(id: string, name: string, playerId = "ND-001", row = 2): CandidateRecord {
  const values: CandidateRecord["values"] = Array(26).fill("");
  values[2] = name;
  return { recordId: id, rowVersion: `version-${id}`, row, playerId, candidateName: name, source: "紹介元", values, formulaColumns: [] };
}
const all = { owner: "all", status: "all", search: "" };

test("same owner and whitespace-normalized name form one candidate while preserving every proposal and profile", () => {
  const first = { ...record("first", "山田 太郎", "ND-001", 3), candidateId: "C-first", profileId: "profile-first" };
  const second = { ...record("second", "山田　太郎", "ND-001", 4), candidateId: "C-second", profileId: "profile-second" };
  const third = { ...record("third", "山田\t太郎", "ND-001", 5), candidateId: "C-first", profileId: "profile-first" };
  const groups = groupCandidates([first, second, third], "registration-desc");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "山田太郎");
  assert.equal(groups[0].playerId, "ND-001");
  assert.deepEqual(groups[0].records, [third, second, first]);
  assert.strictEqual(groups[0].records[2], first);
  assert.equal(groups[0].records[2].rowVersion, "version-first");
  assert.equal(groups[0].records[0].profileId, "profile-first");
  assert.equal(groups[0].records[1].profileId, "profile-second");
});

test("identical names remain separate for different owners, including unmapped display owners", () => {
  const first = record("first", "山田太郎", "ND-001");
  const second = record("second", "山田太郎", "ND-002");
  const unmappedA = record("unmapped-a", "山田太郎", "");
  const unmappedASpaced = record("unmapped-a-spaced", "山田太郎", "");
  const unmappedB = record("unmapped-b", "山田太郎", "");
  const emptyOwner = record("empty-owner", "山田太郎", "");
  unmappedA.values[3] = "架空一郎";
  unmappedASpaced.values[3] = "架空 一郎";
  unmappedB.values[3] = "架空二郎";
  const groups = groupCandidates([first, second, unmappedA, unmappedASpaced, unmappedB, emptyOwner], "interview-desc");
  assert.equal(groups.length, 5);
  assert.equal(new Set(groups.map(group => group.key)).size, 5);
  assert.deepEqual(groups.find(group => group.records.some(row => row.recordId === "unmapped-a"))?.records.map(row => row.recordId), ["unmapped-a", "unmapped-a-spaced"]);
  assert.equal(filterCandidateGroups(groups, { ...all, owner: "ND-001" }).length, 1);
  assert.equal(filterCandidateGroups(groups, { ...all, owner: "unassigned" }).length, 3);
});

test("blank candidate names are kept as separate records rather than merged", () => {
  const groups = groupCandidates([record("blank-a", ""), record("blank-b", "　 \t"), record("named", "山田太郎")], "interview-desc");
  assert.equal(groups.length, 3);
  assert.equal(new Set(groups.map(group => group.key)).size, 3);
  assert.deepEqual(groups.map(group => group.records.length), [1, 1, 1]);
});

test("candidate group ordering follows the chosen sorted proposal order", () => {
  const old = record("old", "山田太郎", "ND-001", 2);
  const newest = record("newest", "山田太郎", "ND-001", 3);
  const middle = record("middle", "佐藤花子", "ND-001", 4);
  const undated = record("undated", "鈴木次郎", "ND-001", 5);
  old.values[0] = "2026-10-10";
  newest.values[0] = "2026-10-21";
  middle.values[0] = "2026-10-01";
  const rows = [old, newest, middle, undated];
  assert.deepEqual(groupCandidates(rows, "interview-desc").map(group => group.name), ["山田太郎", "佐藤花子", "鈴木次郎"]);
  assert.deepEqual(groupCandidates(rows, "interview-asc").map(group => group.name), ["佐藤花子", "山田太郎", "鈴木次郎"]);
  assert.deepEqual(groupCandidates(rows, "interview-asc")[1].records.map(row => row.recordId), ["old", "newest"]);
  assert.deepEqual(groupCandidates(rows, "registration-desc").map(group => group.name), ["鈴木次郎", "佐藤花子", "山田太郎"]);
});

test("status and search must match the same proposal, then the complete candidate stays visible", () => {
  const proposed = record("proposed", "山田太郎", "ND-001", 2);
  const declined = record("declined", "山田太郎", "ND-001", 3);
  const other = record("other", "佐藤花子", "ND-002", 4);
  proposed.values[1] = "Alpha Client";
  proposed.values[6] = "提案完了";
  declined.values[1] = "Beta Client";
  declined.values[6] = "辞退";
  other.values[1] = "Alpha Client";
  other.values[6] = "提案完了";
  const groups = groupCandidates([proposed, declined, other], "registration-desc");
  const matching = filterCandidateGroups(groups, { owner: "ND-001", status: "提案完了", search: " alpha " });
  assert.equal(matching.length, 1);
  assert.strictEqual(matching[0], groups[1]);
  assert.deepEqual(matching[0].records.map(row => row.recordId), ["declined", "proposed"]);
  assert.deepEqual(filterCandidateGroups(groups, { owner: "ND-001", status: "提案完了", search: "Beta" }), []);
  assert.equal(filterCandidateGroups(groups, { ...all, search: "山田太郎" }).length, 1);
  assert.equal(filterCandidateGroups(groups, { ...all, search: "紹介元" }).length, 0);
  assert.equal(filterCandidateGroups(groups, { ...all, search: "CLIENT" }).length, 2);
});

test("grouping and filtering leave the source records, their values and input order unchanged", () => {
  const first = record("first", "山田 太郎", "ND-001", 2);
  const second = record("second", "山田太郎", "ND-001", 3);
  const rows = [first, second];
  const before = structuredClone(rows);
  Object.freeze(first.values);
  Object.freeze(first);
  Object.freeze(second.values);
  Object.freeze(second);
  Object.freeze(rows);
  const groups = groupCandidates(rows, "registration-desc");
  const groupsBefore = structuredClone(groups);
  filterCandidateGroups(groups, { ...all, search: "山田" });
  assert.deepEqual(rows, before);
  assert.deepEqual(groups, groupsBefore);
});

test("group keys cannot collide when names or owner labels contain separator characters", () => {
  const first = record("first", "B|C", "A");
  const second = record("second", "C", "A|B");
  const third = record("third", "B|C", "");
  const fourth = record("fourth", "C", "");
  third.values[3] = "A";
  fourth.values[3] = "A|B";
  assert.equal(new Set(groupCandidates([first, second, third, fourth], "interview-desc").map(group => group.key)).size, 4);
});


test("expanded conditions must all match one proposal while retaining the complete candidate history", () => {
 const first={...record("planned","同じ候補者","ND-001",2),profileId:"profile-a"}, second=record("waiting","同じ候補者","ND-001",3);
 first.values[1]="架空会社A";first.values[6]="面談確定（面談実施待ち）";first.values[9]="2026-10-30";
 second.values[1]="架空会社B";second.values[6]="提案完了";
 const groups=groupCandidates([first,second],"registration-desc");
 const filter={...all,statuses:["提案完了","面談確定（面談実施待ち）"],company:"架空会社A",appointment:"today" as const,profile:"with" as const};
 assert.equal(candidateFilterCount(filter),4);
 const found=filterCandidateGroups(groups,filter,"2026-10-30");assert.equal(found.length,1);assert.equal(found[0].records.length,2);assert.equal(found[0],groups[0]);
 assert.equal(filterCandidateGroups(groups,{...filter,company:"架空会社B"},"2026-10-30").length,0,"another proposal cannot supply the date or profile");
 assert.equal(filterCandidateGroups(groups,{...filter,statuses:["提案完了"]},"2026-10-30").length,0);
 assert.equal(filterCandidateGroups(groups,{...all,statuses:["提案完了"],company:"架空会社B",appointment:"none",profile:"without"},"2026-10-30").length,1);
 assert.equal(filterCandidateGroups(groups,{...all,company:null},"2026-10-30").length,0);
});

test("appointment filters share the displayed unfinished plans and ignore invalid or finished dates", () => {
 const make=(id:string,date:string,status="提案候補")=>{const row=record(id,id);row.values[6]=status;row.values[9]=date;return row;};
 const overdue=make("overdue","2026-10-29"),today=make("today","2026-10-30"),future=make("future","2026-11-01"),done=make("done","2026-10-30"),closed=make("closed","2026-10-30","辞退（本人希望）"),invalid=make("invalid","2026-02-31");done.values[16]="2026-10-30";
 const groups=groupCandidates([future,invalid,today,closed,done,overdue],"registration-desc");
 for(const [choice,expected] of [["overdue",["overdue"]],["today",["today"]],["future",["future"]],["none",["closed","done","invalid"]]] as const)assert.deepEqual(filterCandidateGroups(groups,{...all,appointment:choice},"2026-10-30").map(g=>g.name).sort(),[...expected].sort());
 assert.equal(candidateAppointments([done,closed,invalid],"2026-10-30").length,0);
 assert.equal(candidateAppointments([future,overdue,today],"2026-10-30")[0].recordId,"overdue");
 assert.equal(filterCandidateGroups(groups,{...all,appointment:"injected" as never},"2026-10-30").length,0);
});

test("candidate sorting uses the latest interview and keeps missing values last in either direction", () => {
 const a=record("a","候補者A","ND-001",2),oldA=record("a-old","候補者A","ND-001",3),b=record("b","候補者B","ND-001",4),none=record("none","","ND-001",5);
 a.values[0]="2026-10-30";oldA.values[0]="2026-10-01";b.values[0]="2026-10-20";
 const groups=groupCandidates([a,oldA,b,none],"registration-desc"),copy=structuredClone(groups);
 assert.deepEqual(sortCandidateGroups(groups,{field:"interview",direction:"asc"}).map(g=>g.name),["候補者B","候補者A",""]);
 assert.deepEqual(sortCandidateGroups(groups,{field:"interview",direction:"desc"}).map(g=>g.name),["候補者A","候補者B",""]);
 assert.deepEqual(sortCandidateGroups(groups,{field:"name",direction:"asc"}).map(g=>g.name),["候補者A","候補者B",""]);
 assert.deepEqual(sortCandidateGroups(groups,{field:"name",direction:"desc"}).map(g=>g.name),["候補者B","候補者A",""]);
 assert.deepEqual(sortCandidateGroups(groups,{field:"records",direction:"desc"}).map(g=>g.name),["候補者A","","候補者B"]);
 assert.deepEqual(groups,copy,"sorting never mutates proposals, group order or versions");
});

test("next-appointment sorting uses each person's earliest unfinished plan and stable identities for ties", () => {
 const make=(id:string,name:string,date:string)=>{const row=record(id,name);row.values[9]=date;return row;};
 const a=make("a","A","2026-11-05"),aEarlier=make("a-early","A","2026-10-29"),b=make("b","B","2026-10-30"),none=record("no-plan","C"),d=make("d","D","2026-10-30");
 const groups=groupCandidates([a,aEarlier,b,none,d],"registration-desc");
 assert.deepEqual(sortCandidateGroups(groups,{field:"appointment",direction:"asc"},"2026-10-30").map(g=>g.name),["A","B","D","C"]);
 assert.deepEqual(sortCandidateGroups(groups,{field:"appointment",direction:"desc"},"2026-10-30").map(g=>g.name),["B","D","A","C"]);
 assert.deepEqual(sortCandidateGroups([...groups].reverse(),{field:"appointment",direction:"desc"},"2026-10-30").map(g=>g.key),sortCandidateGroups(groups,{field:"appointment",direction:"desc"},"2026-10-30").map(g=>g.key));
});

function profile(row:CandidateRecord,fields:Partial<CandidateProfile["fields"]>,id=row.profileId||`profile-${row.recordId}`):CandidateProfile {
 return {profileId:id,playerId:row.playerId,recordIds:[row.recordId],version:"version",updatedAt:"2026-11-05T00:00:00Z",fields:{...blankInterviewFields(),...fields},introduction:"紹介文だけの内容は検索しない"};
}

test("professional profile words are searchable only through an exact, unambiguous record and owner relationship",()=>{
 const row={...record("same-name-a","同じ氏名","ND-001"),profileId:"profile-a"},other={...record("same-name-b","同じ氏名","ND-002"),profileId:"profile-b"};
 const profiles=[profile(row,{workHistory:"法人営業でテレアポ",achievements:"月20件",strengths:"ヒアリング",pcSkills:"表計算",pcEnvironment:"Windows",networkEnvironment:"光回線",crmTools:["kintone"],chatTools:["Slack"],timeWindow:"平日9時〜18時",daysPerWeek:"週3日",monthlyHours:"月80時間",availableFrom:"11月中旬",workStyle:"在宅",sideJob:"副業",desiredHourlyRate:"2000円/時",interviewAvailability:"火曜日午後"}),profile(other,{workHistory:"別の担当の専門商材"})];
 const groups=groupCandidates([row,other],"registration-desc"),before=structuredClone({groups,profiles});
 for(const query of ["法人営業 テレアポ","月20件","ヒアリング","表計算","Windows kintone","Slack","平日9時","週3日 月80時間","11月中旬","在宅 副業","2000円/時","火曜日午後"]){const matches=filterCandidateGroups(groups,{...all,search:query},"2026-11-05",profiles);assert.deepEqual(matches.map(group=>group.playerId),["ND-001"],query);}
 assert.equal(filterCandidateGroups(groups,{...all,owner:"ND-001",search:"別の担当の専門商材"},"2026-11-05",profiles).length,0);
 assert.equal(filterCandidateGroups(groups,{...all,search:"紹介文だけの内容"},"2026-11-05",profiles).length,0);
 assert.deepEqual({groups,profiles},before,"searching does not change saved profiles or proposals");
 const stale={...profiles[0],profileId:"stale-profile"};assert.equal(filterCandidateGroups(groups,{...all,search:"法人営業"},"2026-11-05",[stale]).length,0);
 const wrongOwner={...profiles[0],playerId:"ND-002"};assert.equal(filterCandidateGroups(groups,{...all,search:"法人営業"},"2026-11-05",[wrongOwner]).length,0);
 const ambiguous=[profiles[0],{...profiles[0],version:"duplicate"}];assert.equal(filterCandidateGroups(groups,{...all,search:"法人営業"},"2026-11-05",ambiguous).length,0);
 const noLink={...profiles[0],recordIds:[other.recordId]};assert.equal(filterCandidateGroups(groups,{...all,search:"法人営業"},"2026-11-05",[noLink]).length,0);
});

test("manual tool and condition filters must match the same proposal as its company and progress",()=>{
 const first={...record("professional-a","候補者","ND-001",2),profileId:"profile-a"},second={...record("professional-b","候補者","ND-001",3),profileId:"profile-b"};
 first.values[1]="会社A";first.values[6]="提案候補";second.values[1]="会社B";second.values[6]="提案完了";
 const profiles=[profile(first,{pcEnvironment:"Windows",crmTools:["kintone"],workHistory:"法人営業を担当",strengths:"ヒアリング",timeWindow:"平日",daysPerWeek:"週3日"}),profile(second,{pcEnvironment:"MacBook",crmTools:["Salesforce"],workHistory:"カスタマーサポート",timeWindow:"土日"})];
 const groups=groupCandidates([first,second],"registration-desc"),filter={...all,company:"会社A",status:"提案候補",pcEnvironment:"Windows",crmTool:"kintone",experienceKeyword:"法人営業 ヒアリング",availabilityKeyword:"平日 週3日"};
 assert.equal(candidateFilterCount(filter),6);
 const result=filterCandidateGroups(groups,filter,"2026-11-05",profiles);assert.equal(result.length,1);assert.equal(result[0].records.length,2,"all proposal history remains visible");
 for(const change of [{company:"会社B"},{status:"提案完了"},{pcEnvironment:"MacBook"},{crmTool:"Salesforce"},{experienceKeyword:"カスタマーサポート"},{availabilityKeyword:"土日"}])assert.equal(filterCandidateGroups(groups,{...filter,...change},"2026-11-05",profiles).length,0,JSON.stringify(change));
});

test("free-text negation cannot become registered CRM experience or inferred candidate suitability",()=>{
 const row={...record("unexperienced","候補者"),profileId:"profile-no-experience"},profiles=[profile(row,{workHistory:"営業未経験。コールセンターは未経験。",crmOther:"Salesforce未経験",attendanceConcerns:"社内だけの個人事情",additionalNotes:"社内だけの補足",interviewMemo:"社内だけの面談メモ",selfReflection:"担当者の反省",interviewAdvice:"以前のAI助言",age:"99歳",gender:"検索対象外の属性"})],groups=groupCandidates([row],"registration-desc");
 assert.equal(filterCandidateGroups(groups,{...all,experienceKeyword:"営業未経験"},"2026-11-05",profiles).length,1,"literal recorded words may be searched");
 assert.equal(filterCandidateGroups(groups,{...all,experienceKeyword:"営業経験あり"},"2026-11-05",profiles).length,0);
 assert.equal(filterCandidateGroups(groups,{...all,crmTool:"Salesforce"},"2026-11-05",profiles).length,0,"mentioning a tool in prose does not select that experience");
 for(const query of ["社内だけの個人事情","社内だけの補足","社内だけの面談メモ","担当者の反省","以前のAI助言","99歳","検索対象外の属性"])assert.equal(filterCandidateGroups(groups,{...all,search:query},"2026-11-05",profiles).length,0,query);
});

test("missing tool filters include missing linked profiles while positive filters require a recorded value",()=>{
 const blank=record("blank-profile","記載なし"),noProfile=record("no-profile","基本情報なし"),known=record("known-profile","記載あり"),profiles=[profile(blank,{}),profile(known,{pcEnvironment:"Windows",crmTools:["kintone"]})],groups=groupCandidates([blank,noProfile,known],"registration-desc");
 for(const filter of [{pcEnvironment:null},{crmTool:null}])assert.deepEqual(filterCandidateGroups(groups,{...all,...filter},"2026-11-05",profiles).map(group=>group.name).sort(),["基本情報なし","記載なし"].sort());
 assert.deepEqual(filterCandidateGroups(groups,{...all,pcEnvironment:"Windows"},"2026-11-05",profiles).map(group=>group.name),["記載あり"]);
 assert.equal(filterCandidateGroups(groups,{...all,pcEnvironment:"MacBook"},"2026-11-05",profiles).length,0);
 assert.equal(candidateFilterCount({...all,experienceKeyword:"   ",availabilityKeyword:"\t"}),0);
});

test("tomorrow prepares unfinished appointments across year and leap-month boundaries",()=>{
 const make=(id:string,date:string,kind=10)=>{const row=record(id,id);row.values[kind-1]=date;return row;};
 const nextYear=make("next-year","2027-01-01"),later=make("later","2027-01-02"),today=make("today","2026-12-31"),done=make("done","2027-01-01");done.values[16]="2027-01-01";
 assert.deepEqual(filterCandidateGroups(groupCandidates([nextYear,later,today,done],"registration-desc"),{...all,appointment:"tomorrow"},"2026-12-31").map(group=>group.name),["next-year"]);
 const leap=make("leap","2028-02-29",18),march=make("march","2028-03-01",23),groups=groupCandidates([leap,march],"registration-desc");
 assert.deepEqual(filterCandidateGroups(groups,{...all,appointment:"tomorrow"},"2028-02-28").map(group=>group.name),["leap"]);
 assert.deepEqual(filterCandidateGroups(groups,{...all,appointment:"tomorrow"},"2028-02-29").map(group=>group.name),["march"]);
});

test('header name and history conditions combine before pagination and retain all matching proposals',()=>{
 const a=record('head-a','山田太郎'),b=record('head-b','山田太郎'),c=record('head-c','山田花子');a.values[1]='会社A';b.values[1]='会社B';c.values[1]='会社A';
 const groups=groupCandidates([a,b,c],'registration-desc');
 const selected=filterCandidateGroups(groups,{...all,name:'山田',history:'multiple',company:'会社A'});
 assert.equal(selected.length,1);assert.equal(selected[0].name,'山田太郎');assert.equal(selected[0].records.length,2);
 assert.equal(filterCandidateGroups(groups,{...all,name:'花子',history:'single'}).length,1);
 assert.equal(filterCandidateGroups(groups,{...all,name:'太郎',history:'single'}).length,0);
 assert.equal(candidateFilterCount({...all,name:'山田',history:'multiple',company:'会社A'}),3);
});

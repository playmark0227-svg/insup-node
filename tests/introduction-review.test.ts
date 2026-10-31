import test from 'node:test';
import assert from 'node:assert/strict';
import {blankInterviewFields} from '../lib/candidate-intake.ts';
import {reviewIntroductionSource,introductionEvidenceIssues,introductionDocument} from '../lib/introduction-review.ts';

const source=()=>({...blankInterviewFields(),workHistory:'ほうじんえいぎょうで、てれあぽを6か月担当。ひありんぐとりすとさくせい。',achievements:'1位',desiredHourlyRate:'3000',availableFrom:'2026-11-01',timeWindow:'9:00〜12:00',daysPerWeek:'週2日',monthlyHours:'月100時間'});
test('source review proposes business spelling without replacing original or guessing names and places',()=>{
 const raw={...source(),residence:'さっぽろし',crmOther:'せーるすふぉーす',additionalNotes:'社内のてれあぽメモ',interviewMemo:'非公開のほうじんえいぎょうメモ'},before=structuredClone(raw),result=reviewIntroductionSource(raw);
 assert.deepEqual(raw,before);assert.equal(result.fields.workHistory,'法人営業で、テレアポを6か月担当。ヒアリングとリスト作成。');assert.equal(result.fields.residence,'さっぽろし');assert.equal(result.fields.crmOther,'Salesforce');assert.equal(result.fields.additionalNotes,raw.additionalNotes);assert.equal(result.fields.interviewMemo,raw.interviewMemo);
 assert.ok(result.revisions.some(r=>r.field==='workHistory'&&r.before===raw.workHistory&&r.after===result.fields.workHistory));assert.ok(result.notes.some(note=>note.includes('開始可能日')));
});
test('unclear pay is a separate confirmation item and never guessed into client-facing evidence',()=>{
 for(const value of ['3000','3,000円','単位未確認','月・時給のどちらか3000']){const raw={...blankInterviewFields(),workHistory:'営業を担当。',desiredHourlyRate:value},result=reviewIntroductionSource(raw);assert.equal(result.fields.desiredHourlyRate,'');assert.ok(result.checks.some(check=>check.code==='rate-unit'));assert.equal(raw.desiredHourlyRate,value);}
 for(const value of ['2,000円/時','時給2,000円','3000円／時間','月3000円','月額3,000円','3,000円/月','日給1万円','年俸300万円','応相談']){const result=reviewIntroductionSource({...blankInterviewFields(),workHistory:'営業を担当。',desiredHourlyRate:value});assert.equal(result.fields.desiredHourlyRate,value,value);assert.ok(!result.checks.some(check=>check.code==='rate-unit'),value);}
});
test('scheduling contradictions are concrete checks and withheld rather than silently repaired',()=>{
 const result=reviewIntroductionSource(source());assert.ok(result.checks.some(check=>check.code==='hours-consistency'));for(const key of ['timeWindow','daysPerWeek','monthlyHours'] as const)assert.equal(result.fields[key],'');
 const impossible=reviewIntroductionSource({...blankInterviewFields(),daysPerWeek:'週8日',monthlyHours:'月800時間',workHistory:'担当経験'});assert.ok(impossible.checks.some(c=>c.code==='weekly-days'));assert.ok(impossible.checks.some(c=>c.code==='monthly-hours'));assert.equal(impossible.fields.daysPerWeek,'');assert.equal(impossible.fields.monthlyHours,'');
 const wrongPeriod=reviewIntroductionSource({...blankInterviewFields(),monthlyHours:'週80時間',workHistory:'担当経験'});assert.ok(wrongPeriod.checks.some(c=>c.code==='hours-unit'));assert.equal(wrongPeriod.fields.monthlyHours,'');
 const normal=reviewIntroductionSource({...blankInterviewFields(),timeWindow:'9:00〜17:00',daysPerWeek:'週5日',monthlyHours:'月160時間',workHistory:'担当経験'});assert.ok(!normal.checks.some(c=>c.code.startsWith('hours')));assert.equal(normal.fields.monthlyHours,'月160時間');
});
test('experience gaps, rank context and long original histories are visible without creating facts',()=>{
 const minimal=reviewIntroductionSource(blankInterviewFields());assert.ok(minimal.checks.some(c=>c.code==='experience-missing'));
 const rank=reviewIntroductionSource({...blankInterviewFields(),workHistory:'営業を担当',achievements:'営業1位'});assert.ok(rank.checks.some(c=>c.code==='achievement-scope'));
 const scoped=reviewIntroductionSource({...blankInterviewFields(),workHistory:'営業を担当',achievements:'2025年4月、社内20名中1位'});assert.ok(!scoped.checks.some(c=>c.code==='achievement-scope'));
 const text='本人確認済みの担当業務。'.repeat(280),long=reviewIntroductionSource({...blankInterviewFields(),workHistory:text});assert.equal(long.fields.workHistory,text);assert.ok(long.notes.some(note=>note.includes('原文')));
});
test('grounded normal Japanese paragraphs may rephrase facts without changing number format',()=>{
 const fields={...blankInterviewFields(),workHistory:'法人営業のテレアポを6か月担当。',achievements:'2025年4月、20名中1位。',desiredHourlyRate:'2,000円/時',daysPerWeek:'週5日',monthlyHours:'80時間',availableFrom:'2026-11-01',crmTools:['Salesforce']};
 for(const draft of ['やまだたろうさんは、法人営業におけるテレアポを6ヶ月担当しました。希望単価は時給2000円で、週5日、月80時間の稼働を希望しています。稼働開始可能日は2026年11月1日です。Salesforceの使用経験があります。','やまだたろうさんの営業実績は、2025年4月に20名中一位です。','やまだたろうさんは、法人向けに電話で営業活動を行っていました。'])assert.deepEqual(introductionEvidenceIssues(draft,'やまだたろう',fields),[],draft);
});
test('material number, tool, employment and time-period inventions are rejected',()=>{
 const fields={...blankInterviewFields(),workHistory:'営業を6か月担当。',desiredHourlyRate:'月額3000円',daysPerWeek:'週5日',monthlyHours:'80時間',availableFrom:'2026-11-01'};
 for(const [draft,issue] of [['候補者は営業を10年担当。','source-number'],['候補者は営業を十年担当。','source-number'],['候補者はSalesforceを使用。','source-tool'],['候補者は正社員です。','employment-type'],['候補者は週80時間を希望。','time-unit-changed'],['候補者の希望単価は時給3000円です。','rate-unit-changed'],['候補者は稼働を開始しました。','availability-as-start']] as const)assert.ok(introductionEvidenceIssues(draft,'候補者',fields).includes(issue),draft);
 assert.deepEqual(introductionEvidenceIssues('候補者の希望単価は月3000円です。','候補者',fields),[]);
 assert.deepEqual(introductionEvidenceIssues('候補者は月80時間、週5日の稼働を希望。','候補者',fields),[]);
});
test('person-reported experience stays attributed and private notes never supply evidence',()=>{
 const fields={...blankInterviewFields(),workHistory:'本人申告：法人架電を6か月担当。',interviewAdvice:'99年の経験を記載する',selfReflection:'Salesforceが使えるとよさそう',attendanceConcerns:'999件の非公開情報'};
 assert.ok(introductionEvidenceIssues('候補者は法人架電を6か月担当。','候補者',fields).includes('self-report-removed'));
 assert.deepEqual(introductionEvidenceIssues('候補者から、法人架電を6か月担当したと伺っています。','候補者',fields),[]);
 assert.ok(introductionEvidenceIssues('候補者は99年の経験を持ちます。','候補者',fields).includes('source-number'));assert.ok(introductionEvidenceIssues('候補者はSalesforceを使用。','候補者',fields).includes('source-tool'));
});
test('document presentation preserves source order and renders arbitrary strings as text, not markup',()=>{
 assert.deepEqual(introductionDocument('前文\n\n【基本情報】\n氏名：やまだ\n\n【総評】\n<script>例</script>'),[{heading:'',body:'前文'},{heading:'基本情報',body:'氏名：やまだ'},{heading:'総評',body:'<script>例</script>'}]);
 assert.deepEqual(introductionDocument(''),[]);
});

test('spelling proposals preserve marked company names quoted names and the complete candidate name',()=>{
 const raw={...blankInterviewFields(),workHistory:'株式会社てれあぽで勤務。ほうじんえいぎょうを担当。会社名：ほうじんえいぎょう\n「ひありんぐ」事業も担当。てれあぽさんへ引き継ぎ。'},review=reviewIntroductionSource(raw,['てれあぽさん']);assert.match(review.fields.workHistory,/株式会社てれあぽで勤務/);assert.match(review.fields.workHistory,/法人営業を担当/);assert.match(review.fields.workHistory,/会社名：ほうじんえいぎょう/);assert.match(review.fields.workHistory,/「ひありんぐ」/);assert.match(review.fields.workHistory,/てれあぽさんへ/);
});

test('flexible day and monthly hour ranges do not create false scheduling contradictions',()=>{
 const fields={...blankInterviewFields(),workHistory:'担当経験',daysPerWeek:'週2〜3日',timeWindow:'9:00〜12:00',monthlyHours:'月40時間'};assert.ok(!reviewIntroductionSource(fields).checks.some(c=>c.code==='hours-consistency'));
 const monthlyRange={...fields,daysPerWeek:'週2日',monthlyHours:'月20〜40時間'};assert.ok(!reviewIntroductionSource(monthlyRange).checks.some(c=>c.code==='hours-consistency'));
 const negative=reviewIntroductionSource({...fields,daysPerWeek:'週-1日',monthlyHours:'-80時間'});assert.ok(negative.checks.some(c=>c.code==='weekly-days'));assert.ok(negative.checks.some(c=>c.code==='monthly-hours'));
});
test('kanji digit years compare to the actual source year rather than their last character',()=>{
 const fields={...blankInterviewFields(),availableFrom:'2026-11-01',workHistory:'6か月の担当経験'};assert.deepEqual(introductionEvidenceIssues('候補者の稼働開始可能日は二〇二六年11月1日です。','候補者',fields),[]);assert.ok(introductionEvidenceIssues('候補者の稼働開始可能日は二〇二七年11月1日です。','候補者',fields).includes('source-number'));
});

// Independent fictional fixtures: neither source references nor production
// candidate records are used for these semantic regressions.
const metricSource=(achievements:string,workHistory='法人向けの営業を担当。')=>({...blankInterviewFields(),workHistory,achievements});
test('counts and rates preserve readable daily monthly and hourly denominators, including natural Japanese rewrites',()=>{
 const examples=[
  ['日次の架電は94件。','候補者は1日あたり94件の架電を担当しました。','候補者は月94件の架電を担当しました。'],
  ['月次のアポイントは18件。','候補者のアポイントは1か月あたり18件です。','候補者のアポイントは日次18件です。'],
  ['1時間あたり43件の架電。','候補者は43件/時間の架電を担当。','候補者は1日あたり43件の架電を担当。'],
  ['月間のアポイント率は6%。','候補者のアポイント率は月次で6パーセント。','候補者のアポイント率は日次で6%。'],
  ['日94件の架電。','候補者は一日当たり94件の架電を担当。','候補者には94件の架電実績があります。'],
 ] as const;
 for(const [source,good,bad] of examples){assert.deepEqual(introductionEvidenceIssues(good,'候補者',metricSource(source)),[],good);assert.ok(introductionEvidenceIssues(bad,'候補者',metricSource(source)).includes('metric-period-changed'),bad);}
});
test('explicit call and appointment shorthand allows count-word rewrites without changing the denominator or business metric',()=>{
 for(const [source,draft] of [
  ['76コール/1日。','候補者は1日あたり76件の架電を担当。'],
  ['日次架電数：76件。','候補者は日次76通の架電を担当。'],
  ['7アポ/日。','候補者のアポイントは日次7件です。'],
  ['架電は日76通。','候補者の架電数は76コール/1日です。'],
 ] as const)assert.deepEqual(introductionEvidenceIssues(draft,'候補者',metricSource(source)),[],draft);
 const fields=metricSource('76コール/1日。7アポ/日。');assert.ok(introductionEvidenceIssues('候補者は月76件の架電を担当。','候補者',fields).includes('metric-period-changed'));assert.ok(introductionEvidenceIssues('候補者のアポイントは日次76件です。','候補者',fields).includes('metric-context-changed'));
 const separated=reviewIntroductionSource({...blankInterviewFields(),workHistory:Array.from({length:65},()=> '法人向け架電。1日あたり平均73件を担当。').join('\n'),desiredHourlyRate:'時給1,850円'}).fields;assert.deepEqual(introductionEvidenceIssues('【基本情報】\n氏名：架空検証\n【営業経験・職務経歴】\n法人向け架電を1日あたり平均73件担当。','架空検証',separated),[]);
});
test('maximum average target and actual counts cannot exchange values or lose their limiting meaning',()=>{
 const fields=metricSource('月間のアポイントは最大34件、平均13件。目標は月40件。実績は月19件。');
 for(const draft of ['候補者のアポイントは月平均34件、月最大13件です。','候補者は月34件のアポイント実績があります。','候補者のアポイント実績は月40件です。','候補者の月間アポイント目標は19件です。'])assert.ok(introductionEvidenceIssues(draft,'候補者',fields).includes('metric-qualifier-changed'),draft);
 for(const draft of ['候補者のアポイント実績は月間最大34件、平均13件です。','候補者は月40件を目標としており、実績は月19件です。','候補者のアポイントは月平均13件です。'])assert.deepEqual(introductionEvidenceIssues(draft,'候補者',fields),[],draft);
 const approximate=metricSource('月間の架電は約640件。');assert.ok(introductionEvidenceIssues('候補者の架電実績は月640件です。','候補者',approximate).includes('metric-qualifier-changed'));assert.deepEqual(introductionEvidenceIssues('候補者の架電は月640件程度です。','候補者',approximate),[]);
});
test('explicit company metrics remain attributed while a grounded summary can omit the company name',()=>{
 const fields=metricSource('株式会社星環ラボで月17件、株式会社南風ラボで月29件の成約。');
 const wrong='候補者は株式会社星環ラボで月29件、株式会社南風ラボで月17件の成約実績があります。';
 assert.ok(introductionEvidenceIssues(wrong,'候補者',fields).includes('company-metric-changed'));
 for(const draft of ['候補者は株式会社星環ラボで月17件、株式会社南風ラボで月29件の成約実績があります。','候補者には月29件の成約実績があります。','【職歴】\n■ 株式会社星環ラボ\n月17件の成約。\n■ 株式会社南風ラボ\n月29件の成約。\n【総評】\n候補者は月17件の成約実績も持っています。'])assert.deepEqual(introductionEvidenceIssues(draft,'候補者',fields),[],draft);
 const separate={...blankInterviewFields(),workHistory:'株式会社星環ラボで月17件の成約。',achievements:'株式会社南風ラボで月29件の成約。'};assert.ok(introductionEvidenceIssues(wrong,'候補者',separate).includes('company-metric-changed'));
 const short=metricSource('X社で月17件、Y社で月29件の成約。');assert.ok(introductionEvidenceIssues('候補者はX社で月29件の成約。','候補者',short).includes('company-metric-changed'));
 for(const workHistory of ['株式会社星環ラボで、月17件の成約。','株式会社星環ラボで法人営業を担当。月17件の成約。','株式会社星環ラボに入社。月17件の成約。'])assert.deepEqual(introductionEvidenceIssues('候補者は株式会社星環ラボで月17件の成約。','候補者',{...blankInterviewFields(),workHistory}),[],workHistory);
});
test('numeric facts cannot be reassigned to a different business metric or changed from a count into a rate',()=>{
 const fields=metricSource('月間の架電は730件。月間のアポイントは21件。');
 for(const draft of ['候補者の架電は月21件、アポイントは月730件です。','候補者のアポイント率は月21%です。'])assert.ok(introductionEvidenceIssues(draft,'候補者',fields).includes('metric-context-changed'),draft);
 assert.deepEqual(introductionEvidenceIssues('候補者は月730件の架電を担当し、アポイントは月21件です。','候補者',fields),[]);
 const nonCounts={...blankInterviewFields(),age:'27歳',monthlyHours:'80時間'};for(const draft of ['候補者は月27件のアポイントを獲得。','候補者は月80件の架電を担当。'])assert.ok(introductionEvidenceIssues(draft,'候補者',nonCounts).includes('metric-context-changed'),draft);
});
test('explicitly absent experience and tools cannot become affirmative experience, but negatives and open questions remain valid',()=>{
 const fields={...blankInterviewFields(),workHistory:'営業未経験。',pcSkills:'Salesforceの使用経験なし。kintoneを使用した経験があります。'};
 for(const draft of ['候補者は営業経験があります。','候補者はSalesforceを使用できます。','候補者はSalesforceの使用経験があります。'])assert.ok(introductionEvidenceIssues(draft,'候補者',fields).includes('experience-negation-changed'),draft);
 for(const draft of ['候補者は営業未経験で、Salesforceの使用経験はありません。','候補者はkintoneの使用経験があります。','候補者のSalesforceの経験は要確認です。'])assert.deepEqual(introductionEvidenceIssues(draft,'候補者',fields),[],draft);
 const moreTools={...fields,pcSkills:'Salesforceを使ったことがありません。'};assert.ok(introductionEvidenceIssues('候補者はSalesforceを活用できます。','候補者',moreTools).includes('experience-negation-changed'));
});
test('compact negative tool and CRM labels never become usage claims, while explicit contrary experience stays ambiguous',()=>{
 for(const [source,draft] of [
  ['Salesforce：なし','候補者はSalesforceを使用できます。'],
  ['Slack：未経験','候補者はSlackの利用経験があります。'],
  ['テレアポ経験はありません。','候補者にはテレアポ経験があります。'],
  ['CRM経験：なし','候補者はSalesforceを使用できます。'],
 ] as const){const fields={...blankInterviewFields(),workHistory:source};assert.ok(introductionEvidenceIssues(draft,'候補者',fields).includes('experience-negation-changed'),draft);assert.deepEqual(introductionEvidenceIssues(`候補者の記録は「${source}」です。`,'候補者',fields),[]);}
 const contradictory={...blankInterviewFields(),workHistory:'CRM経験：なし',pcSkills:'Salesforceの使用経験があります。'};assert.ok(!introductionEvidenceIssues('候補者はSalesforceを使用できます。','候補者',contradictory).includes('experience-negation-changed'));
});
test('BtoB shorthand changes preserve experience meaning without denying a separately stated business type',()=>{
 const fields={...blankInterviewFields(),workHistory:'BtoB営業の経験あり。BtoC営業は未経験。日次の架電は94件。'};
 for(const draft of ['候補者はtoB営業の経験があり、1日あたり94件の架電を担当。','候補者はB2B営業の経験があり、日94件の架電を担当。','候補者は法人向けの営業経験があります。'])assert.deepEqual(introductionEvidenceIssues(draft,'候補者',fields),[],draft);
 assert.ok(introductionEvidenceIssues('候補者はtoC営業の経験があります。','候補者',fields).includes('experience-negation-changed'));
});
test('unsupported concrete career events are rejected without requiring source-identical prose',()=>{
 const fields={...blankInterviewFields(),workHistory:'法人向けの架電とヒアリングを担当。'};
 for(const draft of ['候補者は研修を修了しました。','候補者はテレアポ研修で実績があります。','候補者は資格を取得しています。','候補者はリーダーとして営業を担当。','候補者には受賞経験があります。'])assert.ok(introductionEvidenceIssues(draft,'候補者',fields).includes('source-achievement'),draft);
 assert.deepEqual(introductionEvidenceIssues('候補者は法人向けに電話をかけ、ヒアリングを行っていました。','候補者',fields),[]);
 const grounded={...fields,achievements:'テレアポ研修を修了。資格を保有。チームリーダーとして勤務。社内表彰を受けた。'};assert.deepEqual(introductionEvidenceIssues('候補者は研修を修了し、資格を取得しています。リーダーとして勤務した経験と表彰を受けた経験があります。','候補者',grounded),[]);
});
test('declining an optional personal attribute only removes it from prepared sharing evidence',()=>{
 for(const gender of ['回答しない','回答を控える','未回答']){const raw={...blankInterviewFields(),workHistory:'営業を担当。',gender},before=structuredClone(raw),review=reviewIntroductionSource(raw);assert.equal(review.fields.gender,'');assert.deepEqual(raw,before);}
 const raw={...blankInterviewFields(),gender:'女性'};assert.equal(reviewIntroductionSource(raw).fields.gender,'女性');assert.equal(raw.gender,'女性');
});

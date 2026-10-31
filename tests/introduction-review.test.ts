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

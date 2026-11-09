import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {renderToStaticMarkup} from "react-dom/server";
import * as workflow from "../lib/sales-workflow.ts";
import * as jobContext from "../lib/introduction-job-context.ts";

const require=createRequire(import.meta.url);
const source=readFileSync(new URL("../components/sales-workflow.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
runInNewContext(compiled,{exports:module.exports,module,require:specifier=>{
 if(specifier.endsWith(".css"))return {};
 if(specifier==="@/lib/sales-workflow")return workflow;
 if(specifier==="@/lib/introduction-job-context")return jobContext;
 if(specifier==="@/lib/sheets-client")return {isUncertainWrite:()=>false};
 return require(specifier);
}});
const {WorkJobFilterControls}=module.exports;
const children=node=>!node?[]:Array.isArray(node)?node.flatMap(children):typeof node==="object"&&node.props?[node,...children(node.props.children)]:[];
const control=(tree,label)=>{const element=children(tree).find(node=>node.props["aria-label"]===label);assert.ok(element,`Missing control: ${label}`);return element;};
const button=(tree,text)=>{const element=children(tree).find(node=>node.type==="button"&&node.props.children===text);assert.ok(element,`Missing button: ${text}`);return element;};

// Run the actual JSX event handlers. The tests deliberately avoid a parallel
// implementation of the controls or string-only checks for their behavior.
test("job filter controls combine edits, preserve other choices on the preset, and reset to open jobs",()=>{
 let filters=workflow.blankWorkJobListFilters();
 const view=()=>WorkJobFilterControls({filters,onChange:next=>{filters=structuredClone(next);},total:8,matched:2,unknownCount:1});
 control(view(),"案件を検索").props.onChange({target:{value:"SaaS 法人"}});
 control(view(),"案件の勤務形態").props.onChange({target:{value:"remote"}});
 control(view(),"案件の土日稼働").props.onChange({target:{value:"allowed"}});
 control(view(),"週の最低稼働日数の上限").props.onChange({target:{value:"2.5"}});
 control(view(),"案件の募集状態").props.onChange({target:{value:""}});
 button(view(),"月100時間未満").props.onClick();
 assert.deepEqual(filters,{...workflow.blankWorkJobListFilters(),query:"SaaS 法人",status:"",workMode:"remote",weekendPolicy:"allowed",weeklyDaysMax:2.5,monthlyHoursMax:100});
 control(view(),"月の最低稼働時間の境界").props.onChange({target:{value:"lte"}});
 control(view(),"月の最低稼働時間の上限").props.onChange({target:{value:"0"}});
 assert.equal(filters.monthlyHoursMax,0);assert.equal(filters.monthlyHoursOperator,"lte");
 const checkbox=children(view()).find(node=>node.type==="input"&&node.props.type==="checkbox");
 checkbox.props.onChange({target:{checked:true}});assert.equal(filters.includeUnknown,true);
 button(view(),"条件をリセット").props.onClick();
 assert.deepEqual(filters,workflow.blankWorkJobListFilters());
 assert.equal(button(view(),"条件をリセット").props.disabled,true);
});

test("job filters expose accessible counts, unknown facts, invalid bounds and empty numeric values",()=>{
 let filters={...workflow.blankWorkJobListFilters(),monthlyHoursMax:100,includeUnknown:true};
 const view=()=>WorkJobFilterControls({filters,onChange:next=>{filters=structuredClone(next);},total:8,matched:2,unknownCount:1});
 let html=renderToStaticMarkup(view());
 assert.match(html,/aria-live="polite"/);assert.match(html,/<strong>2件<\/strong> \/ 全8件/);
 assert.match(html,/選択条件が未確認 1件/);assert.match(html,/未確認は条件を満たすとは限りません/);
 control(view(),"月の最低稼働時間の上限").props.onChange({target:{value:""}});
 assert.equal(filters.monthlyHoursMax,null);
 control(view(),"週の最低稼働日数の上限").props.onChange({target:{value:"8"}});
 html=renderToStaticMarkup(view());assert.match(html,/role="alert"/);assert.match(html,/週の日数は0〜7/);assert.match(html,/aria-invalid="true"/);
 filters=workflow.blankWorkJobListFilters();html=renderToStaticMarkup(view());assert.match(html,/未確認の案件は除外/);
});

test("sales workflow keeps job handoff and report discussion callbacks scoped to selected records",()=>{
 assert.match(source,/onComposeIntroduction\?\:\(context:IntroductionJobContext\)=>void/);
 assert.match(source,/onComposeIntroduction\(introductionJobContext\(selectedRecord\.recordId,comparisonJob,crypto\.randomUUID\(\)\)\)/);
 assert.match(source,/selectedRecord&&<>[\s\S]*この案件の企業向け紹介文/);
 assert.match(source,/案件と確認する候補者[\s\S]*?disabled=\{blocked\|\|proposalDirty\|\|reportDirty\}/);
 assert.match(source,/reportCommentsEnabled&&onOpenReportDiscussion&&<button[^>]*onClick=\{\(\)=>onOpenReportDiscussion\(p\)\}/);
});

test("filter layout has a compact phone layout and allows long handoff buttons to wrap",()=>{
 const css=readFileSync(new URL("../components/sales-workflow.css",import.meta.url),"utf8");
 assert.match(css,/@media\(max-width:620px\)\{\.sales-filter-grid\{grid-template-columns:1fr\}/);
 assert.match(css,/\.sales-comparison-actions>button\{white-space:normal/);
});

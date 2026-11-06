import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {allowedWorkspaceViews} from '../lib/workspace-purpose.ts';

const workspace=ts.createSourceFile('node-workspace.tsx',fs.readFileSync(new URL('../components/node-workspace.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const helper=workspace.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='availableWorkspaceViews');
assert.ok(helper,'the workspace must resolve feature support before offering a destination');
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const resolve=vm.runInNewContext(`${compile(helper.getText(workspace))}\navailableWorkspaceViews`,{allowedWorkspaceViews});
let homeExpression,navigateExpression,fallbackEffect;
function find(node){
 if(ts.isJsxExpression(node)&&node.expression?.getText(workspace).startsWith('view==="home"&&(availableViews.includes'))homeExpression=node.expression.getText(workspace);
 if(ts.isVariableDeclaration(node)&&node.name.getText(workspace)==='navigate')navigateExpression=node.initializer.getText(workspace);
 if(ts.isCallExpression(node)&&node.expression.getText(workspace)==='useEffect'&&node.arguments[0]?.getText(workspace).includes('!availableViews.includes(view)'))fallbackEffect=node.arguments[0].getText(workspace);
 ts.forEachChild(node,find);
}
find(workspace);
assert.ok(homeExpression&&navigateExpression&&fallbackEffect,'navigation, quick links and a withdrawn-feature fallback must use the same availability');
const jsx=(type,props)=>({type,props:props||{}});
const home=vm.runInNewContext(`${compile(`function render(view,availableViews,navigate){return ${homeExpression};}`)}\nrender`,{exports:{},Target:'Target',BriefcaseBusiness:'BriefcaseBusiness',require:name=>{assert.equal(name,'react/jsx-runtime');return {jsx,jsxs:jsx};}});
const nodes=tree=>tree&&typeof tree==='object'?(Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]):[];
const text=tree=>tree==null||typeof tree==='boolean'?'':typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);

for(const admin of [false,true])test(`${admin?'admin':'player'} navigation requires each supported live feature independently`,()=>{
 const original=allowedWorkspaceViews(admin);
 for(const snapshot of [undefined,{}, {metricGoalsFeature:false,salesWorkflowFeature:false}]){
  const available=Array.from(resolve(admin,true,snapshot));
  assert.deepEqual(available,original.filter(view=>!['metric-goals','sales'].includes(view)));
  assert.ok(available.includes('home')&&available.includes('records'));
 }
 for(const flag of ['metricGoalsFeature','salesWorkflowFeature']){
  const enabled=flag==='metricGoalsFeature'?'metric-goals':'sales',disabled=enabled==='sales'?'metric-goals':'sales';
  assert.ok(resolve(admin,true,{[flag]:true}).includes(enabled));
  assert.ok(!resolve(admin,true,{[flag]:true}).includes(disabled));
 }
 // Both the registered verification copy and activated Firestore advertise these booleans.
 assert.deepEqual(Array.from(resolve(admin,true,{metricGoalsFeature:true,salesWorkflowFeature:true})),original);
 assert.ok(!resolve(admin,false,{metricGoalsFeature:true,salesWorkflowFeature:true}).includes('sales'),'demo cannot offer a live-only form');
 for(const page of ['players','workbook','connection'])assert.equal(resolve(false,true,{metricGoalsFeature:true,salesWorkflowFeature:true}).includes(page),false);
});

test('home quick links display and navigate only to advertised destinations',()=>{
 const calls=[];
 assert.equal(home('home',resolve(false,true,{}),view=>calls.push(view)),false);
 for(const [flags,expected] of [[{metricGoalsFeature:true},['metric-goals']],[{salesWorkflowFeature:true},['sales']],[{metricGoalsFeature:true,salesWorkflowFeature:true},['metric-goals','sales']]]){
  calls.length=0;
  const tree=home('home',resolve(false,true,flags),view=>calls.push(view)),buttons=nodes(tree).filter(node=>node.type==='button');
  assert.equal(buttons.length,expected.length);
  buttons.forEach(button=>button.props.onClick());
  assert.deepEqual(calls,expected);
  assert.equal(text(tree).includes('月別7工程'),expected.includes('metric-goals'));
  assert.equal(text(tree).includes('提案先・案件'),expected.includes('sales'));
 }
 assert.equal(home('records',resolve(false,true,{salesWorkflowFeature:true}),()=>assert.fail('not clicked')),false);
});

test('a withdrawn feature returns home while retaining mounted drafts and pending work',()=>{
 for(const view of ['metric-goals','sales']){
  const calls=[],availableViews=resolve(false,true,{});
  vm.runInNewContext(compile(`const run=${fallbackEffect};run();`),{availableViews,view,setView:value=>calls.push(['view',value]),setMobileMenuOpen:value=>calls.push(['menu',value])});
  assert.deepEqual(calls,[['view','home'],['menu',false]]);
 }
 const calls=[];
 vm.runInNewContext(compile(`const run=${fallbackEffect};run();`),{availableViews:resolve(false,true,{metricGoalsFeature:true}),view:'metric-goals',setView:value=>calls.push(value),setMobileMenuOpen:value=>calls.push(value)});
 assert.deepEqual(calls,[]);
});

test('stale callbacks cannot reopen an unsupported feature or an admin-only page',()=>{
 const calls=[];
 const navigate=vm.runInNewContext(compile(`const navigate=${navigateExpression};\nnavigate;`),{
  availableViews:resolve(false,true,{}),setFocusRecord:value=>calls.push(['focus',value]),setReviewFocus:value=>calls.push(['review',value]),setCreateRequested:value=>calls.push(['create',value]),setView:value=>calls.push(['view',value]),setSearch:value=>calls.push(['search',value]),setPage:value=>calls.push(['page',value]),setMobileMenuOpen:value=>calls.push(['menu',value]),window:{scrollTo:()=>calls.push(['scroll'])}
 });
 for(const view of ['metric-goals','sales','players','workbook'])navigate(view);
 assert.deepEqual(calls,[]);
 navigate('records');
 assert.ok(calls.some(call=>call[0]==='view'&&call[1]==='records'));
});

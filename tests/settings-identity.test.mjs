import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const workspace=ts.createSourceFile('node-workspace.tsx',fs.readFileSync(new URL('../components/node-workspace.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const panels=[];
function visit(node){
 if(ts.isJsxExpression(node)&&node.expression&&ts.isBinaryExpression(node.expression)){
  const expression=node.expression.getText(workspace);
  if(expression.startsWith('view==="security"')&&(/<AccountSecurity\b/.test(expression)||/<OperationalTools\b/.test(expression)))panels.push(expression);
 }
 ts.forEachChild(node,visit);
}
visit(workspace);
assert.equal(panels.length,2);
const source=ts.transpileModule(`export function renderSettings(identity,admin){const view="security",live=true,writeBusy=false,opsPending=false,goalsPending=false,unsavedDrafts=false;const sheet={snapshot:{securityFeature:true,operationsFeature:true}};return [${panels.join(',')}];}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};vm.runInNewContext(source,{exports,module:{exports},AccountSecurity:'AccountSecurity',OperationalTools:'OperationalTools',require:name=>{assert.equal(name,'react/jsx-runtime');return {jsx:(type,props,key)=>({type,props,key})};}});

test('security and export remain separate sibling identities across workspace updates and account changes',()=>{
 for(const identity of ['admin:ADMIN','player:ND-001','']){
  const first=exports.renderSettings(identity,true).filter(Boolean),again=exports.renderSettings(identity,true).filter(Boolean);
  assert.equal(first.length,2);
  assert.equal(new Set(first.map(panel=>panel.key)).size,2,'duplicate sibling keys can accumulate account settings on refresh');
  assert.deepEqual(first.map(panel=>panel.key),again.map(panel=>panel.key));
  assert.equal(exports.renderSettings(identity,false).filter(Boolean).length,1);
 }
 const before=exports.renderSettings('admin:ADMIN',true),after=exports.renderSettings('admin:OTHER',true);
 assert.ok(before.every((panel,index)=>panel.key!==after[index].key),'a different account must mount fresh settings');
});

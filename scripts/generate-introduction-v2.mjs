import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {rolldown} from 'rolldown';
import ts from 'typescript';

// Share the exact factual renderer and input validation with the browser.
// The local AI runner is deliberately excluded from this backend bundle.
const root=new URL('../',import.meta.url);
const build=await rolldown({input:fileURLToPath(new URL('lib/introduction-v2.ts',root)),platform:'neutral',treeshake:true,plugins:[{
 name:'pure-typescript',transform(code,id){if(!id.endsWith('.ts'))return null;return ts.transpileModule(code,{fileName:id,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;}
}]});
let code;
try{const {output}=await build.generate({format:'iife',name:'NODE_INTRODUCTION_V2',banner:'/* Generated from the shared introduction V2 renderer. Do not edit. */'});assert.equal(output.length,1);code=output[0].code;}finally{await build.close();}
const source=ts.createSourceFile('IntroductionV2.bundle.gs',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const forbidden=new Set(['window','document','navigator','fetch','crypto','localStorage','sessionStorage','process','Buffer','require','setTimeout','setInterval']);
function inspect(node){assert.ok(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node),'Backend renderer must be self contained.');if(ts.isIdentifier(node))assert.ok(!forbidden.has(node.text),'Unavailable backend dependency: '+node.text);ts.forEachChild(node,inspect);}inspect(source);
const target=new URL('google-apps-script/IntroductionV2.bundle.gs',root);
if(process.argv.includes('--check'))assert.equal(readFileSync(target,'utf8'),code,'Regenerate the introduction V2 backend bundle.');else writeFileSync(target,code);

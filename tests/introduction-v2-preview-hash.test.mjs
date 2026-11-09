import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {introductionPreviewHash} from '../lib/introduction-preview-hash.ts';

test('browser preview digest matches the server UTF-8 SHA-256 base64url format without normalizing displayed bytes',async()=>{
 for(const body of ['氏名\n\n【基本情報】\n希望単価：2,000円／時','候補😀の紹介文\r\n原文','😀'.repeat(20000)])assert.equal(await introductionPreviewHash(body),createHash('sha256').update(body,'utf8').digest('base64url'));
 assert.notEqual(await introductionPreviewHash('本文\n改行'),await introductionPreviewHash('本文\r\n改行'));assert.notEqual(await introductionPreviewHash('１００件'),await introductionPreviewHash('100件'));await assert.rejects(()=>introductionPreviewHash('😀'.repeat(20001)),/20,000/);
});
test('a device without a secure digest gets an actionable error and no fallback confirmation hash',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'crypto');try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});await assert.rejects(()=>introductionPreviewHash('保存済みの本文'),/一致を確認できません/);}finally{if(previous)Object.defineProperty(globalThis,'crypto',previous);else Reflect.deleteProperty(globalThis,'crypto');}
});

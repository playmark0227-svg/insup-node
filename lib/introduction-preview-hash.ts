import {unicodeLength} from "./candidate-intake.ts";
import {introductionV2MaxLength} from "./introduction-v2.ts";

/** Browser-only confirmation binding, not an authorization token. Hash the
 * exact displayed text: UTF-8 SHA-256, unpadded base64url, matching GAS hash_. */
export async function introductionPreviewHash(value:string):Promise<string>{
 if(typeof value!=="string"||unicodeLength(value)>introductionV2MaxLength)throw new Error("紹介文が20,000文字を超えています。入力は保持されています。");
 if(!globalThis.crypto?.subtle)throw new Error("共有内容を確認できませんでした。公開アプリを開き直してお試しください。下書きは残っています。");
 const digest=new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
 const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";let result="";
 for(let index=0;index<digest.length;index+=3){const bits=(digest[index]<<16)|((digest[index+1]??0)<<8)|(digest[index+2]??0);result+=alphabet[(bits>>>18)&63]+alphabet[(bits>>>12)&63];if(index+1<digest.length)result+=alphabet[(bits>>>6)&63];if(index+2<digest.length)result+=alphabet[bits&63];}
 return result;
}

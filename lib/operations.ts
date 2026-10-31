export type ManagedAccount = {id:string;name:string;team:string;role:"admin"|"player";active:boolean;sheetNames:string[];target:number;version:string;hasCredentials:boolean};
export type AccountManagement = {checkedAt:string;accounts:ManagedAccount[];canManageAccounts:boolean};
export type AccountAction = "stop"|"resume"|"revokeSessions";
export type AccountCommand = {playerId:string;action:AccountAction;expectedVersion:string};
export type AccountResult = {managed:true;operationId:string;playerId:string;action:AccountAction;active:boolean;version:string;replayed:boolean};
export type OperationEntry = {row:number;committedAt:string;actorId:string;action:string;summary:string};
export type OperationHistory = {checkedAt:string;entries:OperationEntry[];nextCursor:number|null};
export type OperationalRead = <T>(action:"readAccountManagement"|"readOperationHistory"|"readDataExport",payload?:unknown)=>Promise<T>;

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function assertAccountManagement(value:unknown):asserts value is AccountManagement {
 if(!object(value)||typeof value.canManageAccounts!=="boolean"||typeof value.checkedAt!=="string"||!Array.isArray(value.accounts)||value.accounts.length>1000)throw new Error("利用状況を確認できませんでした。再取得してください。");
 const ids=new Set<string>();
 for(const a of value.accounts){if(!object(a)||typeof a.id!=="string"||!a.id||ids.has(a.id)||typeof a.name!=="string"||typeof a.team!=="string"||!["admin","player"].includes(String(a.role))||typeof a.active!=="boolean"||typeof a.version!=="string"||!a.version||typeof a.hasCredentials!=="boolean"||!Number.isSafeInteger(a.target)||!Array.isArray(a.sheetNames)||a.sheetNames.some(v=>typeof v!=="string"))throw new Error("利用状況の形式を確認できませんでした。");ids.add(a.id);}
}
export function assertAccountResult(value:unknown,command:AccountCommand,operationId:string):asserts value is AccountResult {
 if(!object(value)||value.managed!==true||value.operationId!==operationId||value.playerId!==command.playerId||value.action!==command.action||typeof value.active!=="boolean"||typeof value.version!=="string"||typeof value.replayed!=="boolean")throw new Error("操作結果を確認できませんでした。同じ操作で結果を確認してください。");
}
export function assertOperationHistory(value:unknown):asserts value is OperationHistory {
 if(!object(value)||typeof value.checkedAt!=="string"||!Array.isArray(value.entries)||value.entries.length>50||!(value.nextCursor===null||Number.isSafeInteger(value.nextCursor)&&Number(value.nextCursor)>=2))throw new Error("操作履歴の形式を確認できませんでした。");
 for(const row of value.entries)if(!object(row)||!Number.isSafeInteger(row.row)||Number(row.row)<2||["committedAt","actorId","action","summary"].some(k=>typeof row[k]!=="string"))throw new Error("操作履歴を確認できませんでした。");
}

/** Export is data for safekeeping, never an executable workbook or credential backup. */
export function validateDataExport(value:unknown):Record<string,unknown> {
 if(!object(value)||value.schemaVersion!==1||value.scope!=="application-data"||typeof value.exportedAt!=="string"||!object(value.snapshot)||!Array.isArray(value.managementTables)||!object(value.limits))throw new Error("書き出しデータの形式を確認できませんでした。");
 const allowed=["schemaVersion","exportedAt","scope","snapshot","managementTables","limits"];
 if(Object.keys(value).some(k=>!allowed.includes(k)))throw new Error("書き出しに想定外の情報が含まれています。");
 const forbidden=new Set(["outboxKey","destination","credentials","password","token","deviceToken","pepper","apiKey","authRecord","cacheAccess","secret"]);
 const stack:{value:unknown;depth:number}[]=[{value,depth:0}];let visited=0;
 while(stack.length){const item=stack.pop()!;if(++visited>1000000||item.depth>32)throw new Error("書き出しデータが上限を超えています。");if(item.value&&typeof item.value==="object")for(const [key,child] of Object.entries(item.value)){if(forbidden.has(key))throw new Error("認証情報を含むデータは書き出せません。");stack.push({value:child,depth:item.depth+1});}}
 if(JSON.stringify(value).length>2000000)throw new Error("書き出しデータが上限を超えています。");
 return value;
}
export const accountActionLabels:Record<AccountAction,string>={stop:"利用を停止",resume:"利用を再開",revokeSessions:"全端末からログアウト"};
export const operationLabels:Record<string,string>={saveActivity:"成果登録",updateStatus:"進捗更新",updateProfile:"プロフィール更新",createPlayer:"ID発行",createCandidate:"候補者登録",updateRecord:"候補者の記録更新",deleteCandidate:"候補者削除",cancelAchievement:"成果の取り消し",restoreChange:"変更の復元",saveManagementRow:"管理表更新",saveInterviewReview:"振り返り保存",saveCandidateProfile:"基本情報保存",saveClient:"取引先更新",manageAccount:"利用状況の変更",saveMonthlyTarget:"月別目標の保存"};

import {lazy,Suspense,type ComponentType} from 'react';
/** Keep infrequent workspaces out of the login path and retain surrounding navigation while they load. */
export function deferredFeature<P extends object>(load:()=>Promise<{default:ComponentType<P>}>){
 const Feature=lazy(load);
 return function DeferredFeature(props:P){return <Suspense fallback={<div role="status" className="info-box" aria-live="polite">画面を準備しています…</div>}><Feature {...props}/></Suspense>;};
}

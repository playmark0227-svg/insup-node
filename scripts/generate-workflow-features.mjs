import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('../google-apps-script/Code.gs',import.meta.url),start='/* BEGIN GENERATED WORKFLOW FEATURES */',end='/* END GENERATED WORKFLOW FEATURES */';
let source=readFileSync(path,'utf8');const at=source.indexOf(start),legacy=source.indexOf('/* BEGIN MIGRATION WORKSPACE:');
if(at>=0)source=source.slice(0,at).trimEnd();else if(legacy>=0)source=source.slice(0,legacy).trimEnd();else source=source.trimEnd();
const body=['Migration.fragment.gs','Rewards.fragment.gs','Firestore.fragment.gs','FirestoreMigration.fragment.gs','MetricGoals.fragment.gs','SalesWorkflow.fragment.gs','MatchReportComments.fragment.gs','IntroductionV2.bundle.gs','IntroductionV2.fragment.gs','MatchEvidence.fragment.gs','ExportWorkflow.fragment.gs'].map(file=>readFileSync(new URL('../google-apps-script/'+file,import.meta.url),'utf8').trim()).join('\n\n');
const next=source+'\n\n'+start+'\n'+body+'\n'+end+'\n';if(readFileSync(path,'utf8')!==next)writeFileSync(path,next);

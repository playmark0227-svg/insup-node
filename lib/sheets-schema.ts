// Observed read-only in the user's Chrome on 2026-10-04. No original rows are bundled.
export const sheetSource = {
 spreadsheetId: "1AnyvEoUtgUSTnuuJjIjA80XGHw_DaL9fSUoNCrYZ36s",
 matching: { sheetId:286330650, title:"2期目マッチングDB" },
 kpi: { sheetId:2007683505, title:"2期目月間KPI・KGI", writable:false },
 verifiedReadOnly: true,
 writeEnabled: false,
} as const;
export const inputColumns = [
 {column:"A",field:"interviewDate",label:"面談実施"},
 {column:"B",field:"companyName",label:"会社名"},
 {column:"C",field:"candidateName",label:"候補者氏名（スペースなし）"},
 {column:"D",field:"playerName",label:"担当"},
 {column:"F",field:"position",label:"担当ポジ"},
 {column:"G",field:"status",label:"ステータス"},
 {column:"H",field:"proposalCompletedDate",label:"提案完了日"},
 {column:"I",field:"clientInterviewBookedDate",label:"C面談予約獲得日"},
 {column:"J",field:"clientInterviewScheduledDate",label:"C面談予定日"},
 {column:"K",field:"clientInterviewScheduledTime",label:"C面談予定開始時刻"},
 {column:"L",field:"forecastGrade",label:"ヨミ確度"},
 {column:"M",field:"note",label:"メモ"},
 {column:"Q",field:"clientInterviewActualDate",label:"C面談実施日"},
 {column:"U",field:"clientOfferDate",label:"クライアント側オファー日＝合格日"},
 {column:"V",field:"candidateAcceptedDate",label:"候補者承諾日＝マッチ日"},
 {column:"W",field:"workScheduledStartDate",label:"稼働開始予定日"},
 {column:"X",field:"workActualStartDate",label:"稼働開始日"},
 {column:"Y",field:"exitScheduledDate",label:"離脱予定日"},
 {column:"Z",field:"exitActualDate",label:"離脱日"},
] as const;
export const excludedColumns = ["E","N","O","P","R","S","T"] as const;
// A dry-run patch is a review aid, never a write permission or a Google API request.
export function previewCellPatch(row:number, values:Partial<Record<typeof inputColumns[number]["field"],string>>) {
 if(!Number.isSafeInteger(row)||row<2)throw new Error("Invalid destination row");
 return inputColumns.filter(c=>Object.hasOwn(values,c.field)).map(c=>({range:`'${sheetSource.matching.title}'!${c.column}${row}`,value:values[c.field],mode:"dry-run" as const}));
}

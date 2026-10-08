import type { Stage } from "./node-data";

// Display labels follow the management workbook; API stage values stay compatible.
export const performanceMetrics = [
  { stage: "候補者面談", label: "面談実施", dateLabel: "候補者と面談した日", description: "候補者との面談を記録します。同日・同担当・同候補者は1件です。" },
  { stage: "提案", label: "提案数", dateLabel: "クライアントへ提案した日", description: "候補者をクライアントに提案した実績を記録します。提案行ごとに1件です。" },
  { stage: "C面談予約", label: "C面談予約", dateLabel: "C面談の予約を獲得した日", description: "予約を獲得した日を記録します。面談の予定日時は別に入力できます。" },
  { stage: "クライアント面談", label: "C面談実施", dateLabel: "C面談を実施した日", description: "クライアントとの面談が実施された日を記録します。" },
  { stage: "内定承諾", label: "マッチ数", dateLabel: "候補者が承諾した日", description: "候補者の承諾をマッチとして記録します。内定のみではマッチに計上されません。" },
  { stage: "稼働開始", label: "稼働開始", dateLabel: "実際に稼働を開始した日", description: "実際の稼働開始を記録します。稼働開始予定とは別の実績です。" },
] as const satisfies ReadonlyArray<{ stage: Stage; label: string; dateLabel: string; description: string }>;

export function stageLabel(stage: Stage): string {
  return performanceMetrics.find(metric => metric.stage === stage)?.label || stage;
}

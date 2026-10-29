export type WorkspaceView = "home" | "ranking" | "records" | "profile" | "players" | "connection" | "workbook" | "reviews" | "insights" | "security";
export type WorkspacePurpose = { title: string; goal: string; steps: string[]; links: { view: WorkspaceView; label: string }[] };
const purposes: Record<WorkspaceView, WorkspacePurpose> = {
  home: { title: "ホーム", goal: "今日確認する提案と、今月の成果をひとつの場所で確認します。", steps: ["「今日の確認」から対象の会社・提案を開きます。", "実施した工程の日付を記録すると、成果とランキングに反映されます。", "保存状況は右上で確認できます。同期中も別の作業を続けられます。"], links: [{view:"records",label:"候補者・提案を開く"},{view:"insights",label:"確認対象をすべて見る"}] },
  records: { title: "候補者・提案", goal: "候補者の基本情報と、会社ごとの提案・進捗・実績を管理します。", steps: ["初めての人は「候補者を登録」から追加します。", "基本情報・紹介文はその人の条件や職歴、提案の履歴は会社ごとの状況を確認する場所です。", "面談・提案・合格・承諾・稼働開始は、実際に進んだ工程の日付を記録します。予定日と実績日は分けます。", "同じ人を複数社へ提案しても、候補者リストは一人ひとつ。会社ごとの履歴から対象を選んで編集します。"], links: [{view:"reviews",label:"不成立の理由を振り返る"},{view:"ranking",label:"登録した成果を見る"}] },
  ranking: { title: "ランキング", goal: "同じ期間・同じ指標で、チームの実績を比較します。", steps: ["今日・月別・累計から比較する期間を選びます。", "提案数、C面談、マッチ数など比較したい指標を選びます。", "同じ件数は同順位です。面談は候補者単位、提案以降は会社への提案行単位で数えます。"], links: [{view:"records",label:"成果の元になった記録を見る"}] },
  reviews: { title: "面談の振り返り", goal: "C面談後にマッチしなかった理由を残し、次の対応につなげます。", steps: ["対象期間から、振り返る会社への提案を選びます。", "確認できた理由と、推測を分けて記録します。結果待ちは不成立と決めつけません。", "AIは保存された理由の分類・件数から改善案を整理します。必要な案だけ下書きへ入れ、確認して保存します。"], links: [{view:"records",label:"対象の候補者・提案を確認"},{view:"insights",label:"次の対応を確認"}] },
  insights: { title: "次の対応・AI支援", goal: "予定日や記録から確認対象を見つけ、改善や会議の準備を進めます。", steps: ["「次の対応」は予定日・実施日・結果の記録から抽出した確認リストです。対応済みかを推測で決めません。", "個人の改善案と会議準備は、選択した期間の集計をAIで整理します。", "特定の候補者について質問する場合は、候補者リストの「AI相談」を使います。"], links: [{view:"records",label:"候補者ごとにAIへ相談"},{view:"reviews",label:"面談の理由を記録"}] },
  profile: { title: "マイプロフィール", goal: "自分の表示名・ひとこと・現在の月間提案目標を設定します。", steps: ["累計実績と今月の順位を確認します。", "プロフィール編集から表示名・ひとこと・提案目標を変更できます。", "候補者の基本情報はこの画面ではなく、候補者リストから編集します。"], links: [{view:"security",label:"パスワードを変更する"}] },
  players: { title: "プレイヤー管理", goal: "メンバーのログインID、表示名・目標、シート上の担当名を管理します。", steps: ["新しいメンバーにはIDを発行します。パスワードは一度だけ表示されます。", "表示名・目標と、既存シートの担当名の対応を確認します。", "担当名の対応を変えると閲覧・集計の対象が変わります。別の人の名前を推測で入れないでください。"], links: [{view:"security",label:"アクセスの状態を確認"}] },
  workbook: { title: "業務管理表", goal: "候補者リスト以外の案件・エージェント・稼働者などを表形式で管理します。", steps: ["目的の管理表を選び、対象の行を開きます。", "編集可能な項目だけ変更して保存します。数式・読み取り専用のセルは保護されます。", "候補者の提案・実績は、候補者リストからの編集が分かりやすくなっています。"], links: [{view:"records",label:"候補者・提案を開く"}] },
  connection: { title: "データ連携", goal: "接続先と同期状態を確認するための管理者用設定です。", steps: ["接続中の管理シートと、書き込みが有効かを確認します。", "通常の入力は候補者・提案や実績登録から行います。毎回ここで同期する必要はありません。", "右上の保存状況で、端末保存・同期中・シート保存完了を確認できます。"], links: [{view:"records",label:"通常の入力へ戻る"},{view:"security",label:"アクセス状態を確認"}] },
  security: { title: "アカウント・安全設定", goal: "自分のパスワードと、利用できるアクセスの状態を確認します。", steps: ["パスワード変更は本人のアカウントに適用されます。", "変更後は他の端末もログアウトされるため、新しいパスワードで再ログインします。", "未同期の入力がある場合は、右上の保存状況を確認してからログアウトします。"], links: [{view:"home",label:"ホームに戻る"}] },
};
export function allowedWorkspaceViews(admin: boolean): WorkspaceView[] {
  return admin ? ["home","ranking","records","reviews","insights","players","workbook","connection","security"] : ["home","ranking","records","reviews","insights","profile","security"];
}
export function workspacePurpose(view: WorkspaceView, admin: boolean): WorkspacePurpose {
  const selected = allowedWorkspaceViews(admin).includes(view) ? view : "home";
  const purpose = purposes[selected];
  const value = selected === "home" && admin ? { ...purpose, title: "成果ミーティング", goal: "全員の数字を同じ期間で比較し、一人ずつの発表・振り返りを進めます。", steps: ["今日・月別・累計から、発表する実績の期間を選びます。", "全員の比較で差や目標を確認し、一人ずつの発表に切り替えます。", "不足している実績は対象の記録を確認して修正します。現在の目標設定は、過去月の保存済み目標ではありません。"] } : purpose;
  return { ...value, links: value.links.filter(link => allowedWorkspaceViews(admin).includes(link.view)) };
}
export const workspaceNavigationGroups = [
  { label: "成果の確認", views: ["home","ranking"] },
  { label: "日々の営業", views: ["records","reviews","insights"] },
  { label: "管理・設定", views: ["profile","players","workbook","connection","security"] },
] as const;

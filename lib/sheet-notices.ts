/** Keep setup details out of daily screens, while preserving actionable errors. */
export function sheetNotices(warnings: readonly string[]) {
  let unassignedRows = 0;
  const alerts = warnings.filter(warning => {
    const unassigned = warning.match(/^担当者IDに対応しない行が(\d+)行あります。/);
    if (unassigned) {
      unassignedRows = Math.max(unassignedRows, Number(unassigned[1]));
      return false;
    }
    return warning !== '「停止」など日付以外の値は実績集計から除外しています。'
      && warning !== '紹介元の保存列が未確認のため、アプリの行メタデータに保存します。E列には書き込みません。'
      && warning !== '現在の接続先は登録済みの新しい管理シートです。';
  });
  return { alerts, unassignedRows };
}

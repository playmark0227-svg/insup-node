/** Reusable structure recovered from the approved examples. Contains no candidate facts. */
export const introductionHeadings = {
  basic: "基本情報", experience: "営業経験・職務経歴", results: "営業における強み",
  tools: "使用ツール", availability: "面談可能日", summary: "総評",
} as const;

export const introductionStyleGuide = [
  "保存済みの紹介文書式を毎回使用してください。参考文の再入力は不要です。",
  "見出しは【基本情報】【営業経験・職務経歴】【営業における強み】【使用ツール】【面談可能日】【総評】です。項目順と省略は文章設定に従ってください。",
  "基本情報は氏名・年齢・居住地・稼働条件などの入力済み項目を『項目：内容』で改行して記載します。",
  "営業経験・職務経歴は在籍企業や期間が入力されている場合だけ『■ 企業名・期間』で区切ります。商材・営業手法・〈主な業務〉・〈営業実績〉も、入力に事実がある場合だけ使います。",
  "営業における強みは入力済みの実績・強みだけを『・』で列挙し、使用ツールは入力された名称を『／』で区切ります。",
  "総評は経験・担当業務・稼働条件など入力済みの事実を2〜4文程度で自然につなぎます。情報が少ない場合は短くし、人物の評価・推薦・新しい実績を作らないでください。",
  "Markdownの太字やコードは使わず、そのままクライアントへ送れる日本語の本文にしてください。",
].join("\n");

const headingAliases: Record<string, string> = {
  ...Object.fromEntries(Object.values(introductionHeadings).map(heading => [heading, heading])),
  "基本情報・稼働条件": introductionHeadings.basic,
  "営業経験・職歴": introductionHeadings.experience,
  "確認済みの実績・強み": introductionHeadings.results,
  "実績・強み": introductionHeadings.results,
  "PC・使用ツール": introductionHeadings.tools,
  "PC・利用ツール": introductionHeadings.tools,
  "事実の紹介概要": introductionHeadings.summary,
  "紹介概要": introductionHeadings.summary,
};
export const knownIntroductionHeadings = Object.keys(headingAliases);

/** Format known headings/bullet markers only. Never rewrite candidate facts. */
export function formatIntroductionHeadings(value: string): string {
  return value.split(/\r?\n/).map(line => {
    const match = line.trim().match(/^【([^】]+)】$|^#{1,6}[\t ]*([^#].*?)\s*#*$|^\*\*([^*]+)\*\*$/);
    const heading = match && headingAliases[(match[1] || match[2] || match[3]).trim()];
    if (heading) return `【${heading}】`;
    return line.replace(/^[\t ]*[-*•][\t ]+/, "・");
  }).join("\n");
}

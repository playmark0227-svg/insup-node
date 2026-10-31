/** Reusable structure recovered from the approved examples. Contains no candidate facts. */
export const introductionHeadings = {
  basic: "基本情報", experience: "営業経験・職務経歴", results: "営業における強み",
  tools: "使用ツール", availability: "面談可能日", summary: "総評",
} as const;

export const introductionStyleGuide = [
  "保存済みの紹介文書式を毎回使用してください。参考文の再入力は不要です。",
  "見出しは【基本情報】【営業経験・職務経歴】【営業における強み】【使用ツール】【面談可能日】【総評】です。項目順と省略は文章設定に従ってください。",
  "基本情報は氏名・年齢・居住地・稼働条件などの入力済み項目を『項目：内容』で改行して記載します。",
  "営業経験・職務経歴は在籍企業や期間が入力されている場合だけ『■ 企業名・期間』で区切ります。商材・営業手法・〈主な業務〉・〈営業実績〉も、入力に事実がある場合だけ使います。商材、対象（BtoB・BtoC等）、営業手法、担当した主な業務、営業実績を分け、別の会社・期間の情報を混ぜないでください。",
  "営業における強みは入力済みの実績・強みだけを『・』で列挙します。確認・記録・準備・聞き方など、入力された具体的な行動や工夫を根拠にして書き、抽象的な能力評価へ膨らませないでください。本人の強みの申告は、自己申告であることを残してください。",
  "使用ツールは入力された名称を『／』で区切り、使用経験あり・使用経験なし・未確認を区別してください。PC環境があるだけでツールを使えると判断せず、ツール名から業務経験や習熟度を補わないでください。未確認の欄を共有本文へ列挙する必要はありません。",
  "面談可能日・面談予定は、入力にある候補日・時間帯・調整中の条件だけをまとめてください。未確定の候補を確定予定に変えず、稼働開始可能日とも混同しないでください。",
  "総評は経験領域、代表的な実績、具体的な工夫、稼働条件の順を基本に、入力済みの事実を2〜4文程度で自然につなぎます。情報が少ない場合は短くし、人物の評価・推薦・新しい実績を作らないでください。材料がない要素は省略し、前の欄と同じ箇条書きやラベルを反復するだけの文章にはしないでください。",
  "『約』『最大』『平均』『日次』『時間あたり』『目標』『実績』『本人申告』など、数字の意味・集計期間・対象を限定する修飾を厳密に残してください。目標を達成実績に、最大を平均に、日次を月次に置き換えないでください。月と日、期間と日時を取り違えないでください。",
  "経験月数の合算、達成率やアポ率の算出、時間単価への換算は、元の入力に結果が明記されていない限り行わないでください。空白の単位や比較対象を推測して埋めないでください。",
  "未経験を『ポテンシャルがある』『成長が期待できる』などと自動評価せず、勤怠・定着・人物像・適性も推測しないでください。未経験という事実と、確認済みの担当業務・希望条件を分けて伝えてください。",
  "『即戦力』『確実にチームを牽引する』などの断定や、年齢からの評価は紹介文の型として採用しないでください。PCの所持状況や稼働の制約は確認済みの条件として扱い、その背景にある家庭・健康の事情は共有本文へ入れないでください。",
  "口語・誤字は意味が確実な範囲だけ自然なビジネス文へ整えてください。人名・企業名・地名、数値、期間、否定、条件の範囲を変えないでください。曖昧な表記は勝手に確定せず、確認事項へ分けてください。",
  "共有本文には空の見出しや『記載なし』『情報なし』を出さず、入力のない項目は省略してください。社内のヒアリング漏れ、提案先についての相談、担当者の主観、内部の確認作業は、クライアント向け本文へ入れないでください。",
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

/** Format headings, bullets and the leading tools-list delimiter only. Never rewrite facts. */
export function formatIntroductionHeadings(value: string): string {
  let section: string | null = null;
  return value.split(/\r?\n/).map(line => {
    const match = line.trim().match(/^【([^】]+)】$|^#{1,6}[\t ]*([^#].*?)\s*#*$|^\*\*([^*]+)\*\*$/);
    const heading = match && headingAliases[(match[1] || match[2] || match[3]).trim()];
    // Any heading ends the previous section, including an unknown custom heading.
    if (match) section = heading || null;
    if (heading) return `【${heading}】`;
    if (section === introductionHeadings.tools && /^[\t \u3000]*／/.test(line)) return line.replace(/^([\t \u3000]*)／+[\t \u3000]*/, "$1");
    return line.replace(/^[\t ]*[-*•][\t ]+/, "・");
  }).join("\n");
}

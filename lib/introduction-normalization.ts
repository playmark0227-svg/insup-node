/** Deterministic presentation changes only. Keep `raw` beside the result; an
 * ambiguous number is a question, never a guessed candidate fact. */
export type IntroductionNormalizationField = "timeWindow" | "rate" | "monthlyHours" | "age" | "residence" |
  "availableFrom" | "pcEnvironment" | "networkEnvironment" | "attendanceNote" | "tool" | "freeText";
export type IntroductionNormalizedValue = {
  raw: string; value: string; status: "unchanged" | "normalized" | "needs-confirmation";
  question?: string; kind?: "time" | "money";
};
const rangeSeparator = /\s*(?:[〜～~－ー−–—-]|から)\s*/;
const currency = (value: string): string => Number(value.replace(/,/g, "")).toLocaleString("en-US", { maximumFractionDigits: 8 }) + "円";
const timePart = (raw: string): { minutes: number; text: string } | null => {
  const part = raw.trim().replace(/時(?=\d)/, ":").replace(/時$/, "").replace(/分$/, "");
  let h: number, m: number;
  if (/^\d{1,2}:\d{2}$/.test(part)) [h, m] = part.split(":").map(Number);
  else if (/^\d{1,2}$/.test(part)) { h = Number(part); m = 0; }
  else if (/^\d{3,4}$/.test(part)) { h = Number(part.slice(0, -2)); m = Number(part.slice(-2)); }
  else return null;
  if (h > 23 || m > 59) return null;
  return { minutes: h * 60 + m, text: `${h}:${String(m).padStart(2, "0")}` };
};
function clockRange(value: string): string | null {
  let parts = value.split(rangeSeparator);
  // Only a time field may interpret an unseparated 9001800 / 09001800.
  if (parts.length === 1 && /^\d{6,8}$/.test(value)) {
    const split = value.length === 8 ? 4 : 3;
    parts = [value.slice(0, split), value.slice(split)];
  }
  if (parts.length === 1) return timePart(value)?.text ?? null;
  if (parts.length !== 2) return null;
  const start = timePart(parts[0]), end = timePart(parts[1]);
  if (!start || !end || end.minutes <= start.minutes) return null;
  return `${start.text}〜${end.text}`;
}
function money(value: string): string | null {
  const plain = value.replace(/^(?:希望(?:単価)?|単価)\s*[：:]?\s*/, "").replace(/円/g, "").trim();
  const parts = plain.split(rangeSeparator);
  if (parts.length > 2 || parts.some(part => !/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,4})?$/.test(part))) return null;
  if (parts.some(part => !Number.isFinite(Number(part.replace(/,/g, ""))) || Number(part.replace(/,/g, "")) > 1e12)) return null;
  if (parts.length === 2 && Number(parts[0].replace(/,/g, "")) > Number(parts[1].replace(/,/g, ""))) return null;
  return parts.map(currency).join("〜");
}
const prefectures: Record<string, string> = {
  東京: "東京都", 京都: "京都府", 大阪: "大阪府", 北海道: "北海道",
  ...Object.fromEntries("青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄".split(" ").map(name => [name, `${name}県`])),
};
const toolNames: Record<string, string> = { sf: "Salesforce", salesforce: "Salesforce", kintone: "kintone", hubspot: "HubSpot", slack: "Slack", chatwork: "Chatwork", teams: "Microsoft Teams", zoom: "Zoom", googlemeet: "Google Meet" };

export function normalizeIntroductionValue(field: IntroductionNormalizationField, raw: string): IntroductionNormalizedValue {
  const original = typeof raw === "string" ? raw : "";
  const text = original.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  const result = (value: string, kind?: "time" | "money"): IntroductionNormalizedValue => ({ raw: original, value, status: value === original ? "unchanged" : "normalized", ...(kind ? { kind } : {}) });
  const ask = (question: string): IntroductionNormalizedValue => ({ raw: original, value: original, status: "needs-confirmation", question });
  if (!text) return result("");
  if (field === "timeWindow") {
    const time = clockRange(text);
    if (time) return result(time, "time");
    // Sentences and explicit overnight schedules remain intact. Only malformed
    // numeric clock entries need correction; no source text is discarded.
    if (/^[\d\s:時分〜～~－ー−–—-]+$/.test(text) || /^\d.*から\d/.test(text)) return ask("実在する開始・終了時刻を確認してください。日をまたぐ場合は「翌」を記入してください。");
    return result(text);
  }
  if (field === "rate") {
    const amount = money(text);
    return amount ? result(amount, "money") : result(text);
  }
  if (field === "freeText") {
    if (/^(?:希望(?:単価)?|単価)\s*[：:]?\s*\d/.test(text)) {
      const amount = money(text); if (amount) return result(amount, "money");
    }
    const parts = text.split(rangeSeparator);
    if (parts.length === 2 && parts.every(part => /^\d{1,4}$/.test(part))) {
      const start = timePart(parts[0]), end = timePart(parts[1]);
      if (/^\d{4}$/.test(parts[0]) && !parts[0].startsWith("0") && start && end) return ask("この数値は稼働時間ですか、希望単価の幅ですか？");
      if (/^0\d{3}$/.test(parts[0]) && start && end && end.minutes > start.minutes) return result(`${start.text}〜${end.text}`, "time");
      if (parts[0].length === 3 && start && end && end.minutes > start.minutes) return result(`${start.text}〜${end.text}`, "time");
      if (!start && !end) { const amount = money(text); if (amount) return result(amount, "money"); }
      return ask("この数値は稼働時間ですか、希望単価の幅ですか？");
    }
    if (/^\d{1,8}$/.test(text)) return ask("この数値が表す項目と単位を確認してください。");
    return result(text);
  }
  if (field === "monthlyHours" && /^(?:月\s*)?\d+(?:\.\d+)?(?:\s*時間)?$/.test(text)) {
    const amount = text.match(/\d+(?:\.\d+)?/)![0];
    if (Number(amount) > 744) return ask("月間稼働時間が744時間を超えています。単位と数値を確認してください。");
    return result(`${amount}時間`);
  }
  if (field === "age" && /^\d+(?:\s*歳)?$/.test(text)) {
    const n = Number(text.match(/\d+/)![0]);
    return n > 120 ? ask("年齢の数値を確認してください。") : result(`${n}歳`);
  }
  if (field === "residence") return result(prefectures[text] ?? text);
  if (field === "availableFrom") {
    const match = text.match(/^(?:(\d{4})[\/.-])?(\d{1,2})[\/.-](\d{1,2})(?:から)?$/);
    if (match) {
      const year = match[1] ? Number(match[1]) : 2000, month = Number(match[2]), day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return ask("実在する稼働開始日を確認してください。");
      return result(`${match[1] ? `${match[1]}年` : ""}${month}月${day}日`);
    }
    return result(text);
  }
  if (field === "pcEnvironment") return result(({ win: "Windows", windows: "Windows", mac: "Mac", macbook: "MacBook" } as Record<string, string>)[text.toLowerCase()] ?? text);
  if (field === "networkEnvironment" && /^(?:OK|回線OK)$/i.test(text)) return result("問題なし");
  if (field === "attendanceNote" && /^(?:なし|懸念なし)$/.test(text)) return result("特になし");
  if (field === "tool") return result(toolNames[text.toLowerCase().replace(/\s/g, "")] ?? text);
  return result(text);
}

/** Only a year explicitly present in the source may be compared with today. */
export function introductionStartDateState(raw: string, now = new Date()): "past" | "not-past" | "year-unknown" | "unparsed" {
  const text = normalizeIntroductionValue("availableFrom", raw).value;
  const match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (!match) return /^\d{1,2}月\d{1,2}日$/.test(text) ? "year-unknown" : "unparsed";
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return date < today ? "past" : "not-past";
}

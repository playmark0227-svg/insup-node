/* Generated from the shared introduction V2 renderer. Do not edit. */
var NODE_INTRODUCTION_V2 = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region lib/introduction-style.ts
	/** Reusable structure recovered from the approved examples. Contains no candidate facts. */
	const introductionHeadings = {
		basic: "基本情報",
		experience: "営業経験・職務経歴",
		results: "営業における強み",
		tools: "使用ツール",
		availability: "面談可能日",
		summary: "総評"
	};
	[
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
		"Markdownの太字やコードは使わず、そのままクライアントへ送れる日本語の本文にしてください。"
	].join("\n");
	const headingAliases = {
		...Object.fromEntries(Object.values(introductionHeadings).map((heading) => [heading, heading])),
		"基本情報・稼働条件": introductionHeadings.basic,
		"営業経験・職歴": introductionHeadings.experience,
		"確認済みの実績・強み": introductionHeadings.results,
		"実績・強み": introductionHeadings.results,
		"PC・使用ツール": introductionHeadings.tools,
		"PC・利用ツール": introductionHeadings.tools,
		"事実の紹介概要": introductionHeadings.summary,
		"紹介概要": introductionHeadings.summary
	};
	Object.keys(headingAliases);
	//#endregion
	//#region lib/candidate-intake.ts
	/** Candidate information is formatted in this browser. No external service is called. */
	const interviewStringFields = [
		"age",
		"gender",
		"residence",
		"availableFrom",
		"timeWindow",
		"daysPerWeek",
		"monthlyHours",
		"sideJob",
		"desiredHourlyRate",
		"pcEnvironment",
		"networkEnvironment",
		"attendanceConcerns",
		"workHistory",
		"achievements",
		"strengths",
		"crmOther",
		"chatOther",
		"interviewAvailability",
		"workStyle",
		"pcSkills",
		"additionalNotes",
		"interviewMemo",
		"selfReflection",
		"interviewAdvice"
	];
	function blankInterviewFields() {
		return Object.assign(Object.fromEntries(interviewStringFields.map((key) => [key, ""])), {
			crmTools: [],
			chatTools: []
		});
	}
	/** Normalizes the known schema without shortening source information. */
	function normalizeInterviewFields(value) {
		const result = blankInterviewFields();
		if (!value || typeof value !== "object" || Array.isArray(value)) return result;
		const source = value;
		for (const key of interviewStringFields) if (typeof source[key] === "string") result[key] = source[key].replace(/\r\n?/g, "\n");
		for (const key of ["crmTools", "chatTools"]) if (Array.isArray(source[key])) result[key] = [...new Set(source[key].filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
		return result;
	}
	function unicodeLength(value) {
		return Array.from(value).length;
	}
	//#endregion
	//#region lib/introduction-review.ts
	const numericText = (value) => value.normalize("NFKC").replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
	const ratePatterns = [
		/(?:時給|(?:円|万円)\s*[\/／]\s*(?:時(?:間)?|h)|(?:時(?:間)?)\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|\/hour\b)/i,
		/(?:日給|(?:円|万円)\s*[\/／]\s*日|日\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|日\s*\d[\d,]*\s*(?:円|万円)|\/day\b)/i,
		/(?:月給|月額|(?:円|万円)\s*[\/／]\s*月|月\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|月\s*\d[\d,]*\s*(?:円|万円)|\/month\b)/i,
		/(?:年収|年俸|(?:円|万円)\s*[\/／]\s*年|年\s*(?:単価|(?:あたり|当たり)(?=\s*(?:約)?\d[\d,]*\s*(?:円|万円)))|\/year\b)/i
	];
	const personalDetail = /(?:持病(?:で|が|の治療|を治療|あり|有り)|通院(?:しています|しております|しており|しているため|をしています|をしております|中です|予定です)|(?:毎週|定期的に|週\d+回|月\d+回)[^。\n]{0,8}通院|(?:家族|両親|親|父|母|祖父|祖母)の介護(?:で|のため|があり|中|をして|に伴|により|に専念|が必要|と両立|による)|(?:子ども|子供|お子様|息子|娘)(?:の|が)[^。\n]{0,10}(?:発熱|体調不良|送迎|通院|入院)(?:で|のため|があり|あり|への対応|によ|をして|をする|が必要|など|[：:]|$))/;
	const rankMention = /(?:[0-9０-９一二三四五六七八九十]+\s*位|トップ|top\s*\d+|No[.．]?\s*[0-9０-９]+|ナンバーワン|首位)/i;
	/** Preserve only uncertainty already written alongside a rank, never invent its
	* period, comparison group, or a supposedly verified achievement. */
	function introductionRankQualifications(value) {
		if (!rankMention.test(value)) return [];
		return [...new Set(value.split(/[。\n]/).map((part) => part.trim()).filter((part) => /(?:未確認|不明|確認中|要確認)/.test(part) && /(?:期間|時期|比較|人数|対象|名中|人中)/.test(part)))];
	}
	function missingIntroductionRankQualification(body, qualifications) {
		if (!rankMention.test(body) || !qualifications.length) return false;
		const retained = introductionRankQualifications(body).join("\n"), source = qualifications.join("\n");
		return /期間|時期/.test(source) && !/期間|時期/.test(retained) || /比較|人数|対象|名中|人中/.test(source) && !/比較|人数|対象|名中|人中/.test(retained);
	}
	function kanjiNumber(value) {
		const digits = {
			〇: 0,
			零: 0,
			一: 1,
			二: 2,
			三: 3,
			四: 4,
			五: 5,
			六: 6,
			七: 7,
			八: 8,
			九: 9
		}, units = {
			十: 10,
			百: 100,
			千: 1e3
		};
		if (!/[十百千]/.test(value)) return Number([...value].map((char) => digits[char]).join(""));
		let number = 0, digit = 0;
		for (const char of value) if (char in digits) digit = digits[char];
		else {
			number += (digit || 1) * units[char];
			digit = 0;
		}
		return number + digit;
	}
	const evidenceText = (text) => numericText(text).replace(/\bB2([BC])\b/gi, "Bto$1").replace(/[〇零一二三四五六七八九十百千]+(?=\s*(?:年|か月|ヶ月|ケ月|月|週間?|日|時間|件|通|本|回|コール|アポ|社|人|円|位|代|%|パーセント))/g, (value) => String(kanjiNumber(value)));
	const numbers = (text) => new Set((evidenceText(text).replace(/(?<!\d)1\s*(?:日|週間?|か月|ヶ月|ケ月|時間|年)\s*(?:あたり|当たり|につき)|[\/／]\s*1\s*(?:日|週間?|か月|ヶ月|ケ月|月|時間|年)/g, "").match(/\d+(?:\.\d+)?/g) || []).map((value) => String(Number(value))));
	const factualFields = (fields) => Object.entries(fields).filter(([key]) => ![
		"attendanceConcerns",
		"additionalNotes",
		"interviewMemo",
		"selfReflection",
		"interviewAdvice"
	].includes(key)).map(([, value]) => Array.isArray(value) ? value.join(" ") : value).join("\n");
	const tools = [
		"Salesforce",
		"kintone",
		"HubSpot",
		"Excel",
		"Word",
		"PowerPoint",
		"Chatwork",
		"Slack",
		"MacBook",
		"Windows",
		"Claude",
		"ChatGPT",
		"Photoshop",
		"Illustrator"
	];
	function timeQuantities(text) {
		const result = /* @__PURE__ */ new Set(), value = numericText(text);
		for (const match of value.matchAll(/(?<![\d年月日])(週|月|日)(?:間)?\s*(\d+(?:\.\d+)?)\s*(時間|h|日)|(?<!\d)(\d+(?:\.\d+)?)\s*(時間|h)\s*[\/／]\s*(週|月|日)/gi)) result.add(`${match[1] || match[6]}:${Number(match[2] || match[4])}:${/^(?:時間|h)$/i.test(match[3] || match[5]) ? "hours" : "days"}`);
		return result;
	}
	const periodPatterns = [
		["day", /(?:1\s*日\s*(?:あたり|当たり|につき)|日次|日間|毎日|日ごと|(?<![\d年月])日(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?日)/],
		["week", /(?:1\s*週間?\s*(?:あたり|当たり|につき)|週次|週間|毎週|週ごと|週(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?週)/],
		["month", /(?:1\s*(?:か月|ヶ月|ケ月)\s*(?:あたり|当たり|につき)|月次|月間|毎月|月ごと|(?<![\d年])月(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?月)/],
		["year", /(?:1\s*年\s*(?:あたり|当たり|につき)|年次|年間|毎年|年ごと|(?<!\d)年(?=\s*(?:約|およそ|最大|最高|最多|平均|目標|実績|\d))|[\/／]\s*(?:1\s*)?年)/],
		["hour", /(?:1\s*時間\s*(?:あたり|当たり|につき)|時間(?:あたり|当たり)|[\/／]\s*(?:1\s*)?(?:時間|時|h\b))/i]
	];
	const metricPatterns = [
		["call", /架電|発信|コール|テレアポ|電話営業/],
		["appointment", /(?<!テレ)アポ(?:イント)?(?!インター)|商談設定|商談獲得/],
		["contract", /成約|受注|契約獲得/],
		["meeting", /商談(?!設定|獲得)|面談/],
		["sales", /売上|売り上げ/],
		["achievement-rate", /達成率/]
	];
	const uniqueMarker = (text, patterns) => {
		const found = patterns.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
		return found.length === 1 ? found[0] : null;
	};
	function metricQualifier(text) {
		const limited = [
			["maximum", /最大|最多|最高/],
			["average", /平均|アベレージ/],
			["target", /(?:目標|ノルマ)(?!達成|比|に対)/]
		].filter(([, pattern]) => pattern.test(text));
		return limited.length === 1 ? limited[0][0] : limited.length ? null : /実績|実際/.test(text) ? "actual" : null;
	}
	function companyMentions(text) {
		const result = [];
		const pattern = new RegExp(`(?:株式会社|有限会社|合同会社)[^\\s、,。;；:：（）()【】〈〉■「」]{1,40}?(?=(?:で(?:は|の)?(?=[\\s、,]|月|日|週|年|1|最大|平均|目標|実績|架電|営業|法人|個人|新規|既存|テレアポ|コール|電話|Bto|toB|成約|受注|勤務|担当|\\d)|に(?:て|おいて|勤務|所属|入社)|の(?:勤務|営業|実績)|[\\s、,。;；:：（）()【】〈〉■「」]|$))|(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9-]{0,24}社(?![A-Za-z])`, "g");
		for (const match of text.matchAll(pattern)) result.push({
			start: match.index,
			name: match[0]
		});
		for (const match of text.matchAll(/(?:^|[\n\s、,。:：■「])([^\s、,。:：（）()【】〈〉■「」]{1,30}(?:株式会社|有限会社|合同会社))/g)) if (!result.some((item) => item.name === match[1] && Math.abs(item.start - match.index) < 2)) result.push({
			start: match.index + match[0].indexOf(match[1]),
			name: match[1]
		});
		return result.sort((a, b) => a.start - b.start);
	}
	function metricClaims(raw) {
		const text = evidenceText(raw), matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(件|通|本|回|人|社|%|パーセント|コール|アポイント|アポ(?!インター))/g)], companies = companyMentions(text), result = [];
		for (let index = 0; index < matches.length; index++) {
			const match = matches[index], start = match.index, end = start + match[0].length;
			const sentenceStart = Math.max(text.lastIndexOf("。", start - 1), text.lastIndexOf("\n", start - 1), text.lastIndexOf(";", start - 1), text.lastIndexOf("；", start - 1)) + 1;
			const nextStop = text.slice(end).search(/[。\n;；]/), sentenceEnd = nextStop < 0 ? text.length : end + nextStop;
			const previousEnd = index && matches[index - 1].index >= sentenceStart ? matches[index - 1].index + matches[index - 1][0].length : sentenceStart;
			const nextStart = matches[index + 1]?.index ?? text.length;
			const before = text.slice(previousEnd, start).split(/[、,]/).at(-1) ?? "";
			const after = text.slice(end, Math.min(sentenceEnd, nextStart)).split(/[、,]/)[0];
			const local = before + match[0] + after, sentence = text.slice(sentenceStart, sentenceEnd);
			const period = uniqueMarker(local, periodPatterns) ?? uniqueMarker(sentence, periodPatterns);
			const metric = match[2] === "コール" ? "call" : /^アポ/.test(match[2]) ? "appointment" : uniqueMarker(local, metricPatterns) ?? uniqueMarker(sentence, metricPatterns);
			const summaryStart = [...text.slice(0, start).matchAll(/【(?:総評|まとめ|基本情報|稼働[^】]*)】/g)].at(-1)?.index ?? -1;
			const company = companies.filter((item) => item.start < start && item.start > summaryStart).at(-1)?.name ?? null;
			const meaning = companies.reduce((value, item) => value.replaceAll(item.name, ""), local);
			const approximate = /(?:(?<!成|契)約|およそ)\s*(?:(?:日|月|週|年|時間)(?:間)?\s*)?$/.test(before) || /^\s*(?:程度|ほど|前後)/.test(after);
			const unit = match[2] === "コール" || /^アポ/.test(match[2]) ? "件" : match[2] === "パーセント" ? "%" : match[2];
			result.push({
				value: String(Number(match[1])),
				unit,
				period,
				metric,
				qualifier: metricQualifier(meaning),
				approximate,
				company
			});
		}
		return result;
	}
	function metricEvidenceIssues(draft, sources) {
		const known = sources.flatMap(metricClaims), knownNumbers = numbers(sources.join("\n")), issues = [];
		for (const claim of metricClaims(draft)) {
			let candidates = known.filter((source) => source.value === claim.value && (source.unit === claim.unit || source.metric === "call" && claim.metric === "call" && ["件", "通"].includes(source.unit) && ["件", "通"].includes(claim.unit)));
			if (!candidates.length) {
				if (knownNumbers.has(claim.value)) issues.push("metric-context-changed");
				continue;
			}
			if (claim.company && candidates.some((source) => source.company)) {
				const own = candidates.filter((source) => source.company === claim.company);
				if (!own.length) {
					issues.push("company-metric-changed");
					continue;
				}
				candidates = own;
			}
			if (claim.metric && candidates.some((source) => source.metric)) {
				const sameMetric = candidates.filter((source) => !source.metric || source.metric === claim.metric);
				if (!sameMetric.length) {
					issues.push("metric-context-changed");
					continue;
				}
				candidates = sameMetric;
			}
			const samePeriod = candidates.filter((source) => source.period === claim.period);
			if (!samePeriod.length && candidates.some((source) => source.period || claim.period)) {
				issues.push("metric-period-changed");
				continue;
			}
			if (samePeriod.length) candidates = samePeriod;
			if (!candidates.some((source) => (source.qualifier === claim.qualifier || !source.qualifier && claim.qualifier === "actual") && (!source.approximate || claim.approximate))) issues.push("metric-qualifier-changed");
		}
		return issues;
	}
	const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	function experiencePolarity(text, subject) {
		let negative = false, positive = false;
		const pattern = new RegExp(escapePattern(subject), "gi");
		for (const match of text.matchAll(pattern)) {
			const tail = text.slice(match.index + match[0].length).split(/[。\n、,;；]/)[0].slice(0, 65);
			const before = text.slice(Math.max(0, match.index - 16), match.index);
			if (/^(?:(?:の|での|を|は|について|に関して|[・:：\s])*)(?:(?:使用|利用|実務|操作|営業|業務|担当|活用)(?:の)?)?(?:経験(?:は|が|[：:\s])*(?:ない|なし|ありません)|未経験|未使用|なし|ありません|を?使ったこと(?:は|が)?(?:ない|なし|ありません)|を?使用したこと(?:は|が)?(?:ない|なし|ありません))/.test(tail) || /^(?:(?:の|を|は|[・:：\s])*)(?:使用|利用|操作|活用)(?:経験)?(?:は|が)?(?:ない|なし|未経験|できない|ありません|できません)/.test(tail)) negative = true;
			else if (!/未確認|確認中|要確認|不明|経験を確認|経験の確認|使えるか|利用できるか/.test(tail)) {
				if (/^(?:(?:の|での|を|は|について|[・:：\s])*)(?:(?:使用|利用|実務|操作|営業|業務|担当|活用)(?:の)?)?(?:経験(?:が|は|を)?(?:ある|あり|あります|持|有)|経験者|を?使(?:え|用)|を?(?:使った|使用した)こと(?:が|は)?(?:ある|あり)|を?使用|を?利用|を?活用|を?担当|が?使える|が?使用できる|が?利用できる|に?対応(?:可能|でき))/.test(tail) || /^(?:(?:を|が|は|[・:：\s])*)(?:使用|利用|活用|操作)(?:でき|可能|して|経験|あり)/.test(tail) || /(?:使用可能|利用可能|経験あり|経験済み|使用ツール|利用ツール)[：:\s]*$/.test(before)) positive = true;
			}
		}
		return {
			negative,
			positive
		};
	}
	function negatedExperienceIssues(draft, sources) {
		const subjects = [
			...tools,
			"法人営業",
			"個人営業",
			"BtoB営業",
			"toB営業",
			"BtoC営業",
			"toC営業",
			"テレアポ",
			"営業"
		];
		const canonical = (text) => evidenceText(text).replace(/\bBto([BC])\b/gi, "to$1");
		for (const subject of subjects) {
			const key = canonical(subject), states = sources.map(canonical).map((value) => experiencePolarity(key === "営業" ? value.replace(/(?:法人|個人|to[BC])営業/g, "") : value, key));
			if (!states.some((state) => state.negative) || states.some((state) => state.positive)) continue;
			const target = canonical(draft);
			if (experiencePolarity(key === "営業" ? target.replace(/(?:法人|個人|to[BC])営業/g, "") : target, key).positive) return true;
		}
		const texts = sources.map(canonical), crmStates = texts.map((text) => experiencePolarity(text, "CRM"));
		if (crmStates.some((state) => state.negative) && !crmStates.some((state) => state.positive)) {
			for (const tool of [
				"Salesforce",
				"kintone",
				"HubSpot"
			]) if (experiencePolarity(canonical(draft), tool).positive && !texts.some((text) => experiencePolarity(text, tool).positive)) return true;
		}
		return false;
	}
	function experienceDurations(raw) {
		const text = evidenceText(raw), companies = companyMentions(text), claims = [];
		for (const match of text.matchAll(/(?<![\d.年月])(\d+(?:\.\d+)?)\s*(年(?:間)?|か月|ヶ月|ケ月|カ月|ヵ月)(半)?(?![\d年月日])/g)) {
			if (Number(match[1]) > 100 || /^\s*(?:あたり|当たり|につき)/.test(text.slice(match.index + match[0].length)) || /[\/／]\s*$/.test(text.slice(0, match.index))) continue;
			const boundary = [...text.slice(0, match.index).matchAll(/【[^】]+】/g)].at(-1)?.index ?? -1;
			const company = companies.filter((item) => item.start < match.index && item.start > boundary).at(-1)?.name ?? null;
			const before = text.slice(Math.max(0, match.index - 12), match.index), after = text.slice(match.index + match[0].length);
			const approximate = /(?:約|およそ|概ね)\s*$/.test(before) || /^\s*(?:程度|ほど|前後)/.test(after);
			const limit = after.match(/^\s*(以上|以下|未満|超)/)?.[1] ?? before.match(/(最大|最長|最低|最短)\s*$/)?.[1] ?? null;
			claims.push({
				quantity: String(Number(match[1])),
				unit: match[2].startsWith("年") ? "year" : "month",
				half: !!match[3],
				company,
				approximate,
				limit
			});
		}
		return claims;
	}
	function changedExperiencePeriod(draft, sources) {
		const known = sources.flatMap(experienceDurations);
		return experienceDurations(draft).some((claim) => {
			let candidates = known.filter((source) => source.quantity === claim.quantity && source.unit === claim.unit && source.half === claim.half);
			if (claim.company && candidates.some((source) => source.company)) candidates = candidates.filter((source) => source.company === claim.company);
			return !candidates.some((source) => (!source.approximate || claim.approximate) && source.limit === claim.limit);
		});
	}
	function unsupportedAchievement(draft, source) {
		return [
			[/(?:研修|講習|講座)(?:を)?(?:受講|修了)|(?:研修|講習|講座)で(?:の)?(?:実績|受賞|成績)/, /研修|講習|講座/],
			[/(?:資格|免許)(?:を)?(?:取得|保有|持って)|(?:認定資格|有資格者)/, /資格|免許|認定/],
			[/(?:受賞|表彰)(?:歴|経験|され|を受け|実績|があり)|(?:賞|表彰)を(?:受|獲得)/, /受賞|表彰|賞を|賞に/],
			[/(?:管理職|マネージャー|部長|課長|リーダー)(?:として|を(?:担当|経験|務め)|の経験|経験)/, /管理職|マネージャー|部長|課長|リーダー/]
		].some(([claim, evidence]) => claim.test(draft) && !evidence.test(source));
	}
	/** Concrete additions observed in small-model introductions. Only explicit
	* source claims can support these outcomes; ordinary work is not their proof. */
	function unsupportedNarrativeAssessment(draft, source) {
		if (/(?:今後|将来|これから)[^。\n]{0,50}(?:貢献|寄与|活躍|期待)|(?:貢献|寄与|活躍)(?:すること|できること)?(?:が|を)?(?:期待|見込)|(?:貢献|寄与|活躍)できる(?:可能性|と考え|と思い)/.test(draft)) return true;
		return [
			/長け(?:て|る)/,
			/秀で(?:て|る)/,
			/卓越(?:した|する)/,
			/高度な能力/,
			/高度なスキル/,
			/高い能力/,
			/高い専門性/,
			/高い適応力/,
			/顧客満足(?:度)?[^。\n]{0,12}(?:向上|改善)/,
			...[
				"課題(?:の|を)?解決",
				"チーム",
				"組織",
				"事業",
				"売上",
				"利益",
				"成果",
				"業績",
				"生産性"
			].map((topic) => new RegExp(`${topic}[^。\\n]{0,20}(?:貢献|寄与)`))
		].some((pattern) => pattern.test(draft) && !pattern.test(source));
	}
	/** Conservative, deterministic checks for material inventions; this is not a factual guarantee. */
	function introductionEvidenceIssues(draft, candidateName, prepared, memo = "") {
		const source = [
			candidateName,
			factualFields(prepared),
			memo
		].join("\n"), knownNumbers = numbers(source), issues = introductionContentIssues(draft);
		const sourceParts = [...Object.entries(prepared).filter(([key]) => ![
			"attendanceConcerns",
			"additionalNotes",
			"interviewMemo",
			"selfReflection",
			"interviewAdvice"
		].includes(key)).map(([, value]) => Array.isArray(value) ? value.join(" ") : value), memo];
		if ([...numbers(draft)].some((value) => !knownNumbers.has(value))) issues.push("source-number");
		const lower = source.toLowerCase();
		if (tools.some((tool) => draft.toLowerCase().includes(tool.toLowerCase()) && !lower.includes(tool.toLowerCase()))) issues.push("source-tool");
		if (prepared.availableFrom.trim() && /(?:稼働|就業|勤務)(?:を)?(?:開始済み|開始しています|開始しました|開始した|中です|中である)/.test(draft) && !/(?:稼働|就業|勤務)(?:を)?(?:開始済み|開始しています|開始しました|開始した|中です|中である)/.test(source)) issues.push("availability-as-start");
		const knownTime = timeQuantities([
			source,
			prepared.monthlyHours ? `月${prepared.monthlyHours}` : "",
			prepared.daysPerWeek ? `週${prepared.daysPerWeek}` : ""
		].join("\n"));
		if ([...timeQuantities(draft)].some((quantity) => !knownTime.has(quantity))) issues.push("time-unit-changed");
		if ([
			"正社員",
			"契約社員",
			"派遣社員",
			"業務委託",
			"アルバイト",
			"パート"
		].some((term) => draft.includes(term) && !source.includes(term))) issues.push("employment-type");
		for (const pattern of ratePatterns) if (pattern.test(numericText(draft)) && !pattern.test(numericText(source))) issues.push("rate-unit-changed");
		if (/本人申告/.test(source) && !/(?:本人申告|本人による|本人から|と伺|と聞|とのこと|との申告)/.test(draft) && /(?:経験|担当|実績|達成|勤務)/.test(draft)) issues.push("self-report-removed");
		issues.push(...metricEvidenceIssues(draft, sourceParts));
		if (negatedExperienceIssues(draft, sourceParts)) issues.push("experience-negation-changed");
		if (changedExperiencePeriod(draft, sourceParts)) issues.push("experience-period-changed");
		if (unsupportedAchievement(draft, source)) issues.push("source-achievement");
		if (unsupportedNarrativeAssessment(draft, source)) issues.push("source-assessment");
		const rankQualifications = sourceParts.flatMap(introductionRankQualifications);
		if (draft.split(/【[^】\n]+】|(?:^|\n)[\t ]*(?:#{1,6}[\t ]+|\*\*)[^\n]+/).some((part) => missingIntroductionRankQualification(part, rankQualifications))) issues.push("rank-scope-removed");
		return [...new Set(issues)];
	}
	/** Apply the same content boundary to a model draft or a manually polished candidate. */
	function introductionContentIssues(draft) {
		const issues = [];
		if (personalDetail.test(draft)) issues.push("source-private-detail");
		if (/採用(?:すべき|を推奨|適性|可否)|不採用(?:を推奨|にすべき)|(?:能力|適性|人物)(?:評価|スコア|点数)|\d+\s*点満点|即戦力(?:です|として|と判断|人材|の人材)|優秀な(?:人材|候補者)|ポテンシャル(?:が高|の高|に期待)|成長が期待/.test(draft)) issues.push("source-assessment");
		if (/(?<![〇零一二三四五六七八九十百千万億0-9０-９])[〇○◯●□]{2,}(?![〇零一二三四五六七八九十百千万億0-9０-９])|(?:\b|[：:])X{2,}(?=\b|[位件円年名社])/i.test(draft)) issues.push("source-format");
		const schemaArtifact = /["'](?:\$schema|properties|required|additionalProperties|responseConstraint|minLength|maxLength|minItems|maxItems|draft|summary|questions|actions)["']\s*:|["']type["']\s*:\s*["'](?:object|array|string|integer|number|boolean|null)["']|```(?:json)?\s*[\[{]/i;
		let decoded = draft;
		for (let depth = 0; depth < 3; depth++) {
			if (schemaArtifact.test(decoded)) {
				issues.push("source-format");
				break;
			}
			try {
				const value = JSON.parse(decoded);
				if (value !== null && typeof value === "object") {
					issues.push("source-format");
					break;
				}
				if (typeof value !== "string" || value === decoded) break;
				decoded = value;
			} catch {
				break;
			}
		}
		return issues;
	}
	//#endregion
	//#region lib/introduction-normalization.ts
	const rangeSeparator = /\s*(?:[〜～~－ー−–—-]|から)\s*/;
	const currency = (value) => Number(value.replace(/,/g, "")).toLocaleString("en-US", { maximumFractionDigits: 8 }) + "円";
	const timePart = (raw) => {
		const part = raw.trim().replace(/時(?=\d)/, ":").replace(/時$/, "").replace(/分$/, "");
		let h, m;
		if (/^\d{1,2}:\d{2}$/.test(part)) [h, m] = part.split(":").map(Number);
		else if (/^\d{1,2}$/.test(part)) {
			h = Number(part);
			m = 0;
		} else if (/^\d{3,4}$/.test(part)) {
			h = Number(part.slice(0, -2));
			m = Number(part.slice(-2));
		} else return null;
		if (h > 23 || m > 59) return null;
		return {
			minutes: h * 60 + m,
			text: `${h}:${String(m).padStart(2, "0")}`
		};
	};
	function clockRange(value) {
		let parts = value.split(rangeSeparator);
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
	function money(value) {
		const parts = value.replace(/^(?:希望(?:単価)?|単価)\s*[：:]?\s*/, "").replace(/円/g, "").trim().split(rangeSeparator);
		if (parts.length > 2 || parts.some((part) => !/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,4})?$/.test(part))) return null;
		if (parts.some((part) => !Number.isFinite(Number(part.replace(/,/g, ""))) || Number(part.replace(/,/g, "")) > 0xe8d4a51000)) return null;
		if (parts.length === 2 && Number(parts[0].replace(/,/g, "")) > Number(parts[1].replace(/,/g, ""))) return null;
		return parts.map(currency).join("〜");
	}
	const prefectures = {
		東京: "東京都",
		京都: "京都府",
		大阪: "大阪府",
		北海道: "北海道",
		...Object.fromEntries("青森 岩手 宮城 秋田 山形 福島 茨城 栃木 群馬 埼玉 千葉 神奈川 新潟 富山 石川 福井 山梨 長野 岐阜 静岡 愛知 三重 滋賀 兵庫 奈良 和歌山 鳥取 島根 岡山 広島 山口 徳島 香川 愛媛 高知 福岡 佐賀 長崎 熊本 大分 宮崎 鹿児島 沖縄".split(" ").map((name) => [name, `${name}県`]))
	};
	const toolNames = {
		sf: "Salesforce",
		salesforce: "Salesforce",
		kintone: "kintone",
		hubspot: "HubSpot",
		slack: "Slack",
		chatwork: "Chatwork",
		teams: "Microsoft Teams",
		zoom: "Zoom",
		googlemeet: "Google Meet"
	};
	const salesStyleNames = {
		てれあぽ: "テレアポ",
		てれま: "テレマーケティング",
		テレマ: "テレマーケティング",
		いんさいどせーるす: "インサイドセールス",
		ふぃーるどせーるす: "フィールドセールス",
		かすたまーさくせす: "カスタマーサクセス",
		あぽいんたー: "アポインター",
		ほうじんえいぎょう: "法人営業",
		こじんえいぎょう: "個人営業",
		b2b: "BtoB",
		btob: "BtoB",
		b2c: "BtoC",
		btoc: "BtoC"
	};
	function normalizeIntroductionValue(field, raw) {
		const original = typeof raw === "string" ? raw : "";
		const text = original.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
		const result = (value, kind) => ({
			raw: original,
			value,
			status: value === original ? "unchanged" : "normalized",
			...kind ? { kind } : {}
		});
		const ask = (question) => ({
			raw: original,
			value: original,
			status: "needs-confirmation",
			question
		});
		if (!text) return result("");
		if (field === "timeWindow") {
			const time = clockRange(text);
			if (time) return result(time, "time");
			if (/^[\d\s:時分〜～~－ー−–—-]+$/.test(text) || /^\d.*から\d/.test(text)) return ask("実在する開始・終了時刻を確認してください。日をまたぐ場合は「翌」を記入してください。");
			return result(text);
		}
		if (field === "rate") {
			const amount = money(text);
			return amount ? result(amount, "money") : result(text);
		}
		if (field === "freeText") {
			if (/^(?:希望(?:単価)?|単価)\s*[：:]?\s*\d/.test(text)) {
				const amount = money(text);
				if (amount) return result(amount, "money");
			}
			const parts = text.split(rangeSeparator);
			if (parts.length === 2 && parts.every((part) => /^\d{1,4}$/.test(part))) {
				const start = timePart(parts[0]), end = timePart(parts[1]);
				if (/^\d{4}$/.test(parts[0]) && !parts[0].startsWith("0") && start && end) return ask("この数値は稼働時間ですか、希望単価の幅ですか？");
				if (/^0\d{3}$/.test(parts[0]) && start && end && end.minutes > start.minutes) return result(`${start.text}〜${end.text}`, "time");
				if (parts[0].length === 3 && start && end && end.minutes > start.minutes) return result(`${start.text}〜${end.text}`, "time");
				if (!start && !end) {
					const amount = money(text);
					if (amount) return result(amount, "money");
				}
				return ask("この数値は稼働時間ですか、希望単価の幅ですか？");
			}
			if (/^\d{1,8}$/.test(text)) return ask("この数値が表す項目と単位を確認してください。");
			return result(text);
		}
		if (field === "monthlyHours" && /^(?:月\s*)?\d+(?:\.\d+)?(?:\s*時間)?$/.test(text)) {
			const amount = text.match(/\d+(?:\.\d+)?/)[0];
			if (Number(amount) > 744) return ask("月間稼働時間が744時間を超えています。単位と数値を確認してください。");
			return result(`${amount}時間`);
		}
		if (field === "age" && /^\d+(?:\s*歳)?$/.test(text)) {
			const n = Number(text.match(/\d+/)[0]);
			return n > 120 ? ask("年齢の数値を確認してください。") : result(`${n}歳`);
		}
		if (field === "residence") return result(prefectures[text] ?? text);
		if (field === "availableFrom") {
			const match = text.match(/^(?:(\d{4})[\/.-])?(\d{1,2})[\/.-](\d{1,2})(?:から)?$/);
			if (match) {
				const year = match[1] ? Number(match[1]) : 2e3, month = Number(match[2]), day = Number(match[3]);
				const date = new Date(Date.UTC(year, month - 1, day));
				if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return ask("実在する稼働開始日を確認してください。");
				return result(`${match[1] ? `${match[1]}年` : ""}${month}月${day}日`);
			}
			return result(text);
		}
		if (field === "pcEnvironment") return result({
			win: "Windows",
			windows: "Windows",
			mac: "Mac",
			macbook: "MacBook"
		}[text.toLowerCase()] ?? text);
		if (field === "networkEnvironment" && /^(?:OK|回線OK)$/i.test(text)) return result("問題なし");
		if (field === "attendanceNote" && /^(?:なし|懸念なし)$/.test(text)) return result("特になし");
		if (field === "tool") return result(toolNames[text.toLowerCase().replace(/\s/g, "")] ?? text);
		if (field === "salesStyle") return result(text.split(/([・、,／/\n]+)/).map((part) => salesStyleNames[part.trim().toLowerCase()] ?? part).join(""));
		return result(text);
	}
	/** Only a year explicitly present in the source may be compared with today. */
	function introductionStartDateState(raw, now = /* @__PURE__ */ new Date()) {
		const text = normalizeIntroductionValue("availableFrom", raw).value;
		const match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
		if (!match) return /^\d{1,2}月\d{1,2}日$/.test(text) ? "year-unknown" : "unparsed";
		return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` < new Intl.DateTimeFormat("sv-SE", {
			timeZone: "Asia/Tokyo",
			year: "numeric",
			month: "2-digit",
			day: "2-digit"
		}).format(now) ? "past" : "not-past";
	}
	//#endregion
	//#region lib/introduction-v2.ts
	const introductionV2Version = "2026-11-06";
	/** A safety/storage limit, not a writing target. Facts are never cut to fit it. */
	const introductionV2MaxLength = 2e4;
	const introductionV2Headings = [
		"基本情報",
		"営業経験・職務経歴",
		"成果を出すための工夫",
		"使用ツール・環境",
		"総評"
	];
	const blankIntroductionRate = () => ({
		amount: "",
		unit: "unknown",
		tax: "unknown"
	});
	const blankIntroductionV2Settings = () => ({
		version: "initial",
		sources: [],
		sourceAliases: {},
		blockedTerms: [],
		clients: []
	});
	function blankIntroductionCareer(id) {
		return {
			id,
			company: "",
			product: "",
			period: "",
			salesStyle: "",
			duties: [],
			achievements: [],
			tips: []
		};
	}
	function blankIntroductionV2Profile(candidateName = "") {
		return {
			schemaVersion: 2,
			candidateName,
			source: "",
			basic: {
				furigana: "",
				age: "",
				residence: "",
				availableFrom: "",
				timeWindow: "",
				monthlyHours: "",
				desiredRate: blankIntroductionRate(),
				pcEnvironment: "",
				networkEnvironment: "",
				shareableAttendanceNote: "",
				daysPerWeek: "",
				weekdays: "",
				sideJob: "",
				pcCamera: ""
			},
			careers: [],
			experienceTotal: "",
			tips: [],
			tools: [],
			interviewAvailability: "",
			internalMemo: ""
		};
	}
	function parseIntroductionRate(raw) {
		const value = raw.normalize("NFKC").trim();
		const unit = /時給|(?:円\s*)?[\/／]\s*(?:時(?:間)?|h)/i.test(value) ? "hour" : /日給|(?:円\s*)?[\/／]\s*日/.test(value) ? "day" : /月給|月額|(?:円\s*)?[\/／]\s*月/.test(value) ? "month" : /案件|一式|件単価|円\s*[\/／]\s*件/.test(value) ? "project" : "unknown";
		const tax = /税込/.test(value) ? "inclusive" : /税抜|税別/.test(value) ? "exclusive" : "unknown";
		return {
			amount: normalizeIntroductionValue("rate", value.replace(/(?:時給|日給|月給|月額|件単価|希望単価|希望)/g, "").replace(/[（(]?(?:税込|税抜|税別)[）)]?/g, "").replace(/[\/／]\s*(?:時間|時|日|月|件|h)/gi, "").trim()).value,
			unit,
			tax
		};
	}
	/** An explicit import adapter, not a data migration. Private legacy fields stay private. */
	function introductionV2FromLegacy(candidateName, raw, source = "") {
		const fields = normalizeInterviewFields(raw), profile = blankIntroductionV2Profile(candidateName);
		profile.source = source;
		for (const key of [
			"age",
			"residence",
			"availableFrom",
			"timeWindow",
			"monthlyHours",
			"pcEnvironment",
			"networkEnvironment",
			"daysPerWeek",
			"sideJob"
		]) profile.basic[key] = fields[key];
		profile.basic.desiredRate = parseIntroductionRate(fields.desiredHourlyRate);
		if (fields.workHistory.trim() || fields.achievements.trim()) profile.careers = [{
			...blankIntroductionCareer("legacy-career"),
			duties: fields.workHistory.trim() ? [fields.workHistory] : [],
			achievements: fields.achievements.trim() ? [fields.achievements] : []
		}];
		profile.tips = fields.strengths.trim() ? [fields.strengths] : [];
		profile.tools = [
			...fields.crmTools.filter((tool) => tool !== "その他"),
			fields.crmOther,
			...fields.chatTools.filter((tool) => tool !== "その他"),
			fields.chatOther,
			fields.pcSkills
		].filter((value) => value.trim());
		profile.interviewAvailability = fields.interviewAvailability;
		profile.internalMemo = [
			fields.attendanceConcerns,
			fields.additionalNotes,
			fields.interviewMemo,
			fields.selfReflection,
			fields.interviewAdvice
		].filter((value) => value.trim()).join("\n");
		return profile;
	}
	const record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
	const text = (value, limit = 6e3) => typeof value === "string" && unicodeLength(value) <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
	const list = (value, count = 30) => Array.isArray(value) && value.length <= count && value.every((item) => text(item));
	function validIntroductionRate(value) {
		return record(value) && text(value.amount, 200) && !/[\r\n]/.test(value.amount) && [
			"hour",
			"day",
			"month",
			"project",
			"unknown"
		].includes(String(value.unit)) && [
			"exclusive",
			"inclusive",
			"unknown"
		].includes(String(value.tax));
	}
	/** Whitelist persisted fields. Unknown properties, especially copied source documents,
	* are not retained in the returned object. Invalid payloads fail rather than truncate. */
	function parseIntroductionV2Profile(value) {
		if (!record(value) || value.schemaVersion !== 2 || !record(value.basic) || !Array.isArray(value.careers) || value.careers.length > 30) return null;
		const result = blankIntroductionV2Profile();
		for (const key of [
			"candidateName",
			"source",
			"experienceTotal",
			"interviewAvailability",
			"internalMemo"
		]) {
			if (!text(value[key]) || ["candidateName", "source"].includes(key) && /[\r\n]/.test(value[key])) return null;
			result[key] = value[key];
		}
		for (const key of Object.keys(result.basic)) if (key === "desiredRate") {
			if (!validIntroductionRate(value.basic[key])) return null;
			result.basic.desiredRate = {
				amount: value.basic[key].amount,
				unit: value.basic[key].unit,
				tax: value.basic[key].tax
			};
		} else {
			if (!text(value.basic[key])) return null;
			result.basic[key] = value.basic[key];
		}
		for (const key of ["tips", "tools"]) {
			if (!list(value[key])) return null;
			result[key] = [...value[key]];
		}
		const ids = /* @__PURE__ */ new Set();
		for (const item of value.careers) {
			if (!record(item) || !text(item.id, 120) || !item.id.trim() || ids.has(item.id)) return null;
			ids.add(item.id);
			const career = blankIntroductionCareer(item.id);
			for (const key of [
				"company",
				"product",
				"period",
				"salesStyle"
			]) {
				if (!text(item[key])) return null;
				career[key] = item[key];
			}
			for (const key of [
				"duties",
				"achievements",
				"tips"
			]) {
				if (!list(item[key])) return null;
				career[key] = [...item[key]];
			}
			result.careers.push(career);
		}
		if (value.narrativeEdits !== void 0) {
			const revision = parseIntroductionNarrativeRevision(value.narrativeEdits);
			if (!revision) return null;
			result.narrativeEdits = revision;
		}
		return unicodeLength(JSON.stringify(result)) <= 1e5 ? result : null;
	}
	function parseIntroductionV2Settings(value) {
		if (!record(value) || !text(value.version, 200) || !list(value.sources, 300) || !list(value.blockedTerms, 500) || !record(value.sourceAliases) || Object.keys(value.sourceAliases).length > 500 || !Array.isArray(value.clients) || value.clients.length > 500) return null;
		const aliases = {};
		for (const [key, item] of Object.entries(value.sourceAliases)) {
			if (!text(key, 200) || !text(item, 200) || [
				"__proto__",
				"prototype",
				"constructor"
			].includes(key)) return null;
			aliases[key] = item;
		}
		const clients = [], ids = /* @__PURE__ */ new Set();
		for (const item of value.clients) {
			if (!record(item) || !text(item.id, 200) || !item.id.trim() || ids.has(item.id) || !text(item.name, 200) || !list(item.mentions, 50) || item.rate !== void 0 && !validIntroductionRate(item.rate)) return null;
			ids.add(item.id);
			clients.push({
				id: item.id,
				name: item.name,
				mentions: [...item.mentions],
				...item.rate ? { rate: {
					amount: item.rate.amount,
					unit: item.rate.unit,
					tax: item.rate.tax
				} } : {}
			});
		}
		return {
			version: value.version,
			sources: [...value.sources],
			sourceAliases: aliases,
			blockedTerms: [...value.blockedTerms],
			clients
		};
	}
	const unitLabels = {
		hour: "／時",
		day: "／日",
		month: "／月",
		project: "／件",
		unknown: "（単位未確認）"
	};
	function formatIntroductionRate(rate) {
		if (!rate.amount.trim()) return "未確認";
		return `${normalizeIntroductionValue("rate", rate.amount).value}${unitLabels[rate.unit]}${rate.tax === "unknown" ? "（税区分未確認）" : rate.tax === "inclusive" ? "（税込）" : "（税抜）"}`;
	}
	/** Not an authentication hash. A compact local freshness key avoids putting
	* private notes into document metadata as literal JSON. */
	function introductionV2SourceKey(profile, settings, clientId = "") {
		const { narrativeEdits: _revision, ...original } = profile;
		const source = JSON.stringify([
			original,
			settings,
			clientId
		]);
		let a = 2166136261, b = 2654435769;
		for (const char of source) {
			const code = char.codePointAt(0);
			a = Math.imul(a ^ code, 16777619);
			b = Math.imul(b ^ code, 2246822519);
		}
		return `v2:${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
	}
	function resolveIntroductionSource(source, settings) {
		const raw = source.trim();
		return Object.hasOwn(settings.sourceAliases, raw) ? settings.sourceAliases[raw].trim() : raw;
	}
	const filled = (values) => values.map((value) => value.trim()).filter(Boolean);
	const line = (label, value) => `${label}：${value.trim() || "未確認"}`;
	const factId = (path) => `introduction:${path}`;
	function introductionV2NarrativeFacts(profile) {
		const facts = [];
		for (const career of profile.careers) for (const [key, kind] of [["duties", "duty"], ["tips", "tip"]]) career[key].forEach((value, index) => {
			if (value.trim() && !introductionContentIssues(value).includes("source-private-detail")) facts.push({
				factId: factId(`careers.${career.id}.${key}.${index}`),
				careerId: career.id,
				kind,
				sourceText: value.trim()
			});
		});
		profile.tips.forEach((value, index) => {
			if (value.trim() && !introductionContentIssues(value).includes("source-private-detail")) facts.push({
				factId: factId(`tips.${index}`),
				careerId: "candidate",
				kind: "tip",
				sourceText: value.trim()
			});
		});
		return facts;
	}
	function composeIntroductionV2(raw, rawSettings = blankIntroductionV2Settings(), clientId = "", now = /* @__PURE__ */ new Date(), edits) {
		const profile = parseIntroductionV2Profile(raw), settings = parseIntroductionV2Settings(rawSettings);
		if (!profile || !settings) throw new Error("紹介文の入力または設定の形式を確認してください。原文は保持してください。");
		const checks = [], questions = [], factRefs = [];
		const question = (field, label, prompt, required = true, careerId) => {
			const id = `${careerId ?? "basic"}:${field}`;
			if (!questions.some((item) => item.id === id)) questions.push({
				id,
				field,
				label,
				prompt,
				required,
				...careerId ? { careerId } : {}
			});
		};
		const fixed = (path, rawValue, normField) => {
			const normalized = normField ? normalizeIntroductionValue(normField, rawValue) : {
				raw: rawValue,
				value: rawValue.trim(),
				status: "unchanged"
			};
			if (normalized.status === "needs-confirmation") {
				checks.push({
					code: "normalization",
					severity: "review",
					field: path,
					sourceRef: factId(path),
					message: normalized.question
				});
				question(path, path, normalized.question);
			}
			if (normalized.value.trim()) factRefs.push({
				id: factId(path),
				path,
				value: normalized.value,
				original: rawValue
			});
			return normalized.value.trim();
		};
		const selectedEdits = edits ?? getStoredIntroductionNarrativeEdits(profile, settings);
		if (edits === void 0 && profile.narrativeEdits && !isIntroductionNarrativeRevisionCurrent(profile, settings)) checks.push({
			code: "narrative-stale",
			severity: "review",
			message: "原文または共有設定が変わったため、以前の整文を使わず原文を表示しています。必要に応じて整え直して保存してください。"
		});
		const acceptedEdits = /* @__PURE__ */ new Map(), seenEdits = /* @__PURE__ */ new Set();
		for (const edit of selectedEdits) {
			if (!seenEdits.has(edit.factId) && validateIntroductionNarrativeEdit(edit, profile, settings)) acceptedEdits.set(edit.factId, edit.text.trim());
			else checks.push({
				code: "narrative-rejected",
				severity: "review",
				sourceRef: edit.factId,
				message: "根拠を確認できなかった文章は、その項目の原文を使っています。"
			});
			seenEdits.add(edit.factId);
		}
		const narrativeValue = (path, value) => {
			const original = fixed(path, value);
			return acceptedEdits.get(factId(path)) ?? original;
		};
		const name = fixed("candidateName", profile.candidateName);
		if (!name) question("candidateName", "氏名", "候補者の氏名を確認してください。");
		const source = resolveIntroductionSource(profile.source, settings);
		if (!source) question("source", "紹介元", "紹介元を選択してください。未登録の選択肢は管理者に確認してください。");
		if (source && settings.sources.length && !settings.sources.includes(source)) checks.push({
			code: "source-unregistered",
			severity: "review",
			field: "source",
			message: "紹介元が登録済みの選択肢と一致していません。正式な表記を確認してください。"
		});
		if (source) factRefs.push({
			id: factId("source"),
			path: "source",
			value: source,
			original: profile.source
		});
		const basic = profile.basic;
		const basicValues = {
			age: fixed("basic.age", basic.age, "age"),
			residence: fixed("basic.residence", basic.residence, "residence"),
			availableFrom: fixed("basic.availableFrom", basic.availableFrom, "availableFrom"),
			timeWindow: fixed("basic.timeWindow", basic.timeWindow, "timeWindow"),
			monthlyHours: fixed("basic.monthlyHours", basic.monthlyHours, "monthlyHours"),
			pcEnvironment: fixed("basic.pcEnvironment", basic.pcEnvironment, "pcEnvironment"),
			networkEnvironment: fixed("basic.networkEnvironment", basic.networkEnvironment, "networkEnvironment"),
			shareableAttendanceNote: fixed("basic.shareableAttendanceNote", basic.shareableAttendanceNote, "attendanceNote")
		};
		const requiredLabels = {
			age: "年齢",
			residence: "居住地",
			availableFrom: "稼働開始",
			timeWindow: "稼働時間",
			monthlyHours: "月間稼働時間",
			pcEnvironment: "PC環境",
			networkEnvironment: "ネット環境",
			shareableAttendanceNote: "勤怠懸念"
		};
		for (const key of Object.keys(basicValues)) if (!basicValues[key]) question(`basic.${key}`, requiredLabels[key], `${requiredLabels[key]}を確認してください。分からなければ未確認のまま進められます。`);
		fixed("basic.desiredRate.amount", basic.desiredRate.amount, "rate");
		if (!basic.desiredRate.amount.trim()) question("basic.desiredRate.amount", "希望単価", "希望単価の数値と、時給・日給・月額などの単位を確認してください。");
		if (basic.desiredRate.amount.trim() && basic.desiredRate.unit === "unknown") question("basic.desiredRate.unit", "単価の単位", "この希望単価は時給・日給・月額・案件単価のどれですか？");
		if (basic.desiredRate.amount.trim() && basic.desiredRate.tax === "unknown") checks.push({
			code: "tax-unknown",
			severity: "review",
			field: "basic.desiredRate.tax",
			message: "希望単価の税込・税抜が未確認です。企業提示条件とあわせて確認してください。"
		});
		const dateState = introductionStartDateState(basic.availableFrom, now);
		if (dateState === "past") checks.push({
			code: "start-date-past",
			severity: "review",
			field: "basic.availableFrom",
			message: "稼働開始日が過去です。現在の予定を確認してください。"
		});
		if (dateState === "year-unknown") question("basic.availableFrom.year", "稼働開始の年", "稼働開始の年は何年ですか？年を推測せず、入力どおりの月日で表示しています。", false);
		if (basic.sideJob.trim() && !basic.shareableAttendanceNote.trim()) question("basic.shareableAttendanceNote", "副業の稼働への影響", "副業によって連絡可能時間や勤務時間に影響はありますか？個人的な事情ではなく、共有できる稼働上の影響だけを記入してください。");
		const baseLines = [
			line("氏名", name),
			...basic.furigana.trim() ? [line("ふりがな", fixed("basic.furigana", basic.furigana))] : [],
			line("年齢", basicValues.age),
			line("居住地", basicValues.residence),
			line("稼働開始", basicValues.availableFrom),
			line("稼働時間", basicValues.timeWindow),
			line("月間稼働時間", basicValues.monthlyHours),
			line("希望単価", formatIntroductionRate(basic.desiredRate)),
			line("PC環境", basicValues.pcEnvironment),
			line("ネット環境", basicValues.networkEnvironment),
			line("勤怠懸念", basicValues.shareableAttendanceNote)
		];
		for (const [key, label] of [
			["daysPerWeek", "週の稼働数"],
			["weekdays", "稼働曜日"],
			["sideJob", "副業"],
			["pcCamera", "PCカメラの有無"]
		]) if (basic[key].trim()) baseLines.push(line(label, fixed(`basic.${key}`, basic[key])));
		const experience = fixed("experienceTotal", profile.experienceTotal);
		if (!experience) question("experienceTotal", "営業経験の通算", "通算の営業経験はどのくらいですか？重複する職歴期間を二重に数えず確認してください。", false);
		const careerBlocks = [], tips = profile.tips.map((value, index) => narrativeValue(`tips.${index}`, value)).filter(Boolean);
		for (const career of profile.careers) {
			const prefix = `careers.${career.id}`, company = fixed(`${prefix}.company`, career.company), product = fixed(`${prefix}.product`, career.product), period = fixed(`${prefix}.period`, career.period), style = fixed(`${prefix}.salesStyle`, career.salesStyle, "salesStyle");
			const duties = career.duties.map((value, index) => narrativeValue(`${prefix}.duties.${index}`, value)).filter(Boolean);
			const achievements = career.achievements.map((value, index) => fixed(`${prefix}.achievements.${index}`, value)).filter(Boolean);
			tips.push(...career.tips.map((value, index) => narrativeValue(`${prefix}.tips.${index}`, value)).filter(Boolean));
			for (const [key, label, prompt] of [
				[
					"period",
					"期間",
					"開始・終了の年月を確認してください。"
				],
				[
					"product",
					"商材",
					"扱った商品・サービスを確認してください。"
				],
				[
					"salesStyle",
					"営業スタイル",
					"BtoB/BtoCと、テレアポ・商談などの手法を確認してください。"
				],
				[
					"duties",
					"業務内容",
					"実際に担当した業務を確認してください。"
				],
				[
					"achievements",
					"実績",
					"架電数・アポ数などを、単位と期間を含めて確認してください。"
				]
			]) if (Array.isArray(career[key]) ? !filled(career[key]).length : !career[key].trim()) question(`${prefix}.${key}`, label, `${company || product || "この職歴"}：${prompt}`, true, career.id);
			const metrics = achievements.join("\n");
			if (/(?:\d+\s*位|首位|トップ|No[.]?\s*\d+)/i.test(metrics) && (!/(?:\d+\s*(?:人|名|社)中|母数|比較対象|全\d+\s*(?:人|名|社))/.test(metrics) || !/(?:\d+年|\d+月|月間|年間|週間|日間|期間)/.test(metrics))) question(`${prefix}.rankContext`, "順位の比較対象と期間", `${company || "この職歴"}の順位について、何人・何社中か、いつの実績かを確認してください。未確認の母数や期間は補いません。`, false, career.id);
			careerBlocks.push([
				`■${company || "社名不明"}${product ? `／${product}` : ""}`,
				line("期間", period),
				line("商材", product),
				line("営業スタイル", style),
				"業務内容：",
				...(duties.length ? duties : ["未確認"]).map((value) => `・${value}`),
				"実績：",
				...(achievements.length ? achievements : ["未確認"]).map((value) => `・${value}`)
			].join("\n"));
		}
		if (!profile.careers.length) {
			question("careers", "職歴", "営業経験・職歴について、会社・商材・期間・担当業務を確認してください。");
			careerBlocks.push("■社名不明\n期間：未確認\n商材：未確認\n営業スタイル：未確認\n業務内容：\n・未確認\n実績：\n・未確認");
		}
		if (tips.length < 2) question("tips", "成果を出すための工夫", "成果につながった具体的な行動を確認してください。例文を事実として足さず、分かる範囲を記入してください。", true);
		const tools = [...new Set(profile.tools.map((value, index) => fixed(`tools.${index}`, value, "tool")).filter(Boolean))];
		if (!tools.length) question("tools", "使用ツール", "CRM・チャット・表計算など、実際に使用したツールを確認してください。");
		const summary = renderIntroductionSummary(profile);
		const sections = [
			`【基本情報】\n${baseLines.join("\n")}`,
			`【営業経験・職務経歴】\n${line("営業経験", experience)}\n${careerBlocks.join("\n\n")}`,
			`【成果を出すための工夫】\n${(tips.length ? tips : ["未確認"]).map((value) => `・${value}`).join("\n")}`,
			`【使用ツール・環境】\n${(tools.length ? tools : ["未確認"]).map((value) => `・${value}`).join("\n")}`,
			...profile.interviewAvailability.trim() ? [`【面談可能日】\n${fixed("interviewAvailability", profile.interviewAvailability)}`] : [],
			`【総評】\n${summary}`
		];
		const internalBody = sections.join("\n\n"), client = settings.clients.find((item) => item.id === clientId);
		if (clientId && !client) checks.push({
			code: "client-not-found",
			severity: "block",
			field: "clientId",
			message: "選択した企業の設定が見つかりません。企業を選び直してください。"
		});
		let body = internalBody;
		if (client?.rate) {
			const rateIndex = baseLines.indexOf(line("希望単価", formatIntroductionRate(basic.desiredRate)));
			body = [`【基本情報】\n${baseLines.map((value, index) => index === rateIndex ? line("希望単価", formatIntroductionRate(client.rate)) : value).join("\n")}`, ...sections.slice(1)].join("\n\n");
			if (!client.rate.amount.trim()) checks.push({
				code: "client-rate-empty",
				severity: "review",
				message: "企業別の提示単価が未登録です。"
			});
			if (client.rate.tax === "unknown" || client.rate.unit === "unknown") checks.push({
				code: "client-rate-unconfirmed",
				severity: "review",
				message: "企業別の提示単価の単位または税区分が未確認です。"
			});
		}
		const headingLine = `${name || "未確認"}（${source || "紹介元未確認"}）`;
		const greeting = "お世話になっております。\n下記の人員をご紹介させていただきます。", closing = "ご検討のほどよろしくお願いいたします。";
		const recommendation = renderIntroductionRecommendation(profile);
		const mentions = client?.mentions.map((value) => value.trim()).filter(Boolean).join("\n") ?? "";
		const clientText = [
			mentions,
			greeting,
			recommendation,
			closing,
			headingLine,
			body
		].filter(Boolean).join("\n\n");
		checks.push(...inspectIntroductionV2ClientText(clientText, profile, settings));
		if (!compareIntroductionV2Bodies(internalBody, body, basic.desiredRate, client?.rate)) checks.push({
			code: "client-fact-mismatch",
			severity: "block",
			message: "設定された単価以外の情報が社内版と企業向け版で異なります。"
		});
		const bodyChars = unicodeLength(internalBody), bodyLines = internalBody.split("\n").length;
		if (bodyChars > 2e4 || unicodeLength(clientText) > 2e4) checks.push({
			code: "document-length",
			severity: "block",
			message: "文章が保存可能な長さを超えています。原文を削らず、職歴を確認してください。"
		});
		return {
			schemaVersion: 2,
			templateVersion: introductionV2Version,
			headingLine,
			internalBody,
			client: {
				clientId,
				mentions,
				greeting,
				recommendation,
				closing,
				body,
				text: clientText
			},
			checks,
			questions,
			factRefs,
			sourceKey: introductionV2SourceKey(profile, settings, clientId),
			canCopyClient: !checks.some((check) => check.severity === "block"),
			volume: {
				bodyChars,
				bodyLines,
				withinTarget: bodyChars >= 764 && bodyChars <= 1125 && bodyLines >= 40 && bodyLines <= 58
			}
		};
	}
	/** The actual achievements remain verbatim in the career block. The summary
	* selects existing evidence; it never creates a total, rate, rank or strength. */
	function renderIntroductionSummary(profile) {
		const careers = profile.careers.filter((career) => career.duties.some((value) => value.trim()) || career.product.trim());
		if (!careers.length) return "営業経験・職務経歴と具体的な取り組みは未確認です。確認できた情報をもとに内容を整えます。";
		const statements = [];
		if (profile.experienceTotal.trim()) statements.push(`営業経験は${profile.experienceTotal.trim()}です。`);
		for (const career of careers) {
			const subject = [career.company, career.product].map((value) => value.trim()).filter(Boolean).join("の");
			if (subject || career.salesStyle.trim()) statements.push(`${subject ? `${subject}で` : ""}${normalizeIntroductionValue("salesStyle", career.salesStyle).value || "記載の業務"}の経験があります。`);
		}
		const achievement = careers.flatMap((career) => filled(career.achievements))[0];
		if (achievement) statements.push(`実績として「${achievement}」が記録されています。`);
		const tip = [...filled(profile.tips), ...careers.flatMap((career) => filled(career.tips))][0];
		if (tip) statements.push(`具体的な取り組みは「${tip}」です。`);
		statements.push("同様の業務を紹介する際は、記載の経験と稼働条件をもとに、案件との具体的な接点を確認できます。");
		return statements.join("");
	}
	function renderIntroductionRecommendation(profile) {
		const first = profile.careers.find((career) => career.product.trim() || career.salesStyle.trim());
		if (!first) return "候補者の基本情報を下記にまとめております。未確認の項目は確認を進めております。";
		const experience = profile.experienceTotal.trim() ? `${profile.experienceTotal.trim()}の営業経験があり、` : "";
		const fact = [first.product.trim(), normalizeIntroductionValue("salesStyle", first.salesStyle).value].filter(Boolean).join("・");
		const achievement = filled(first.achievements)[0];
		const tip = [...filled(first.tips), ...filled(profile.tips)][0];
		return `${experience}${fact}の経験がある方です。${achievement ? `実績として「${achievement}」が記録されています。` : ""}${tip ? `「${tip}」という取り組みをされています。` : ""}`;
	}
	function compareIntroductionV2Bodies(internalBody, clientBody, sourceRate, clientRate) {
		if (!clientRate) return internalBody === clientBody;
		const sourceLine = line("希望単価", formatIntroductionRate(sourceRate)), clientLine = line("希望単価", formatIntroductionRate(clientRate));
		const masked = (body, expectedLine) => {
			const lines = body.split("\n"), index = lines.indexOf(expectedLine);
			if (index < 0) return null;
			lines[index] = "希望単価：__configured_rate__";
			return lines.join("\n");
		};
		const sourceMasked = masked(internalBody, sourceLine), clientMasked = masked(clientBody, clientLine);
		return sourceMasked !== null && clientMasked !== null && sourceMasked === clientMasked;
	}
	/** Call again immediately before copying or sharing manually edited prose. */
	function inspectIntroductionV2ClientText(value, profile, settings) {
		const comparable = (text) => text.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").toLocaleLowerCase("ja");
		const checks = [], normalized = comparable(value);
		for (const term of settings.blockedTerms.map((term) => term.trim()).filter(Boolean)) if (normalized.includes(comparable(term))) checks.push({
			code: "blocked-term",
			severity: "block",
			message: `企業向けに出力できない登録語句「${term}」が含まれています。`
		});
		if ([profile.internalMemo.trim(), ...profile.internalMemo.split(/[\n。]/).map((part) => part.trim())].filter((part) => Array.from(part).length >= 4 && !/^(?:特になし|なし|懸念なし|問題なし|未確認|不明|確認中)[。.]?$/.test(part)).some((part) => normalized.includes(comparable(part)))) checks.push({
			code: "private-memo-leak",
			severity: "block",
			message: "社内メモと一致する内容が企業向け文章に含まれています。共有する内容を確認してください。"
		});
		for (const issue of introductionContentIssues(value.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, ""))) checks.push({
			code: issue,
			severity: "block",
			message: issue === "source-private-detail" ? "個人的な事情が企業向け文章に含まれています。共有できる稼働条件だけを記載してください。" : "根拠のない人物評価、空の例示や機械向けの出力が含まれていないか確認してください。"
		});
		return checks;
	}
	/** Exact shape/size checking prevents a stored whole-document or private-field
	* payload from being smuggled into the atom revision. Legacy profiles omit it. */
	function parseIntroductionNarrativeRevision(value) {
		if (!record(value) || Object.keys(value).sort().join("|") !== "edits|schemaVersion|settingsVersion|sourceKey|templateVersion" || value.schemaVersion !== 1 || !text(value.templateVersion, 200) || !text(value.settingsVersion, 200) || !text(value.sourceKey, 80) || !/^v2:[a-f0-9]+$/.test(value.sourceKey) || !Array.isArray(value.edits) || value.edits.length > 60) return null;
		const edits = [], seen = /* @__PURE__ */ new Set();
		for (const edit of value.edits) {
			if (!record(edit) || Object.keys(edit).sort().join("|") !== "factId|text" || !text(edit.factId, 300) || !text(edit.text) || !edit.text.trim() || seen.has(edit.factId)) return null;
			seen.add(edit.factId);
			edits.push({
				factId: edit.factId,
				text: edit.text.trim()
			});
		}
		const revision = {
			schemaVersion: 1,
			templateVersion: value.templateVersion,
			sourceKey: value.sourceKey,
			settingsVersion: value.settingsVersion,
			edits
		};
		return unicodeLength(JSON.stringify(revision)) <= 6e4 ? revision : null;
	}
	const significantNarrativeQualifiers = [
		"未確認",
		"不明",
		"確認中",
		"本人申告",
		"希望",
		"予定",
		"候補",
		"最大",
		"最小",
		"平均",
		"約",
		"以上",
		"以下",
		"未満",
		"目標"
	];
	function introductionV2NarrativeIssues(candidate, source, otherEmployerNames = []) {
		const issues = [];
		if (!candidate.trim() || unicodeLength(candidate) > Math.max(400, unicodeLength(source) * 3) || !text(candidate)) issues.push("invalid-text");
		issues.push(...introductionEvidenceIssues(candidate, "", {
			...blankInterviewFields(),
			workHistory: source
		}));
		const normalize = (value) => value.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").toLocaleLowerCase("ja");
		const before = normalize(source), after = normalize(candidate);
		for (const name of otherEmployerNames.map((value) => value.trim()).filter(Boolean)) if (!before.includes(normalize(name)) && after.includes(normalize(name))) issues.push("employer-mixed");
		for (const identifier of candidate.match(/[A-Za-z][A-Za-z0-9.+-]{1,}/g) ?? []) if (!before.includes(identifier.toLowerCase())) issues.push("identifier-added");
		for (const qualifier of significantNarrativeQualifiers) if (before.includes(qualifier) && !after.includes(qualifier) && !(qualifier === "本人申告" && /本人から|本人による|との申告|と伺|とのこと/.test(candidate))) issues.push("qualification-removed");
		const numberKey = (value) => (normalize(value).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((item) => item.replace(/,/g, "")).join("|");
		if (numberKey(source) !== numberKey(candidate)) issues.push("number-omitted-or-changed");
		const negationScopes = (value) => {
			const scopes = [];
			for (const clause of normalize(value).split(/[。！？!?\n、,;；]/)) for (const match of clause.matchAll(/おりませんでした|おりません|おらず|おらない|いませんでした|いません|ありませんでした|ありません|ませんでした|ません|なかった|ない|なく|なし|せず|できず|未経験|未対応|未実施|未使用|不可|除く|以外/g)) {
				const context = clause.slice(0, match.index).match(/[一-龠々]{1,}|[ァ-ヴー]{2,}|[a-z]{2,}|\d+/g) ?? [];
				scopes.push(context.join("|"));
			}
			return scopes.join("\n");
		};
		if (negationScopes(source) !== negationScopes(candidate)) issues.push("negation-changed");
		const wordingParts = (value) => normalize(value).replace(/[^\S\n]/g, "").trim().replace(/。$/, "").split(/([。！？!?\n、,;；])/);
		const ending = (value) => {
			const negative = value.replace(/(?:しておりませんでした|していませんでした|しておらなかった)$/, "していなかった").replace(/(?:しておりません|していません|しておらず|しておらない)$/, "していない").replace(/(?:しませんでした)$/, "しなかった").replace(/(?:しません|せず)$/, "しない");
			const past = negative.match(/([一-龠々ァ-ヴー])(?:しておりました|していました|していた|しました|した)$/);
			if (past) return {
				base: negative.slice(0, past.index + 1),
				tense: "past"
			};
			const present = negative.match(/([一-龠々ァ-ヴー])(?:しております|しています|している|します|する)$/);
			if (present) return {
				base: negative.slice(0, present.index + 1),
				tense: "present"
			};
			return {
				base: negative,
				tense: "unspecified"
			};
		};
		const sourceParts = wordingParts(source), candidateParts = wordingParts(candidate);
		if (sourceParts.length !== candidateParts.length || sourceParts.some((part, index) => {
			if (index % 2) return part !== candidateParts[index];
			const original = ending(part), edited = ending(candidateParts[index]);
			return original.base !== edited.base || original.tense !== "unspecified" && original.tense !== edited.tense;
		})) issues.push("source-wording-changed");
		for (const term of candidate.match(/リーダー|マネジメント|マネージャー|管理職|教育担当|研修担当|責任者|チームを牽引|部下|自動化|効率化|受注|成約|達成|改善率/g) ?? []) if (!source.includes(term)) issues.push("role-or-result-added");
		const tokens = (value) => [...new Set(value.match(/[一-龠々]{2,}|[ァ-ヴー]{3,}|[A-Za-z]{2,}/g) ?? [])];
		const sourceTokens = tokens(before), targetTokens = tokens(after);
		if (targetTokens.some((token) => !before.includes(token))) issues.push("source-content-added");
		if (sourceTokens.some((token) => !after.includes(token) && !targetTokens.join("").includes(token))) issues.push("source-content-omitted");
		return [...new Set(issues)];
	}
	/** Atom relationship, every factual qualifier and sensitive values are checked
	* on the server too. No native-engine capability is accepted as proof. */
	function validateIntroductionNarrativeEdit(edit, profile, settings = blankIntroductionV2Settings()) {
		if (!record(edit) || Object.keys(edit).sort().join("|") !== "factId|text" || !text(edit.factId, 300) || !text(edit.text)) return false;
		const source = introductionV2NarrativeFacts(profile).find((fact) => fact.factId === edit.factId);
		if (!source) return false;
		const companies = profile.careers.filter((career) => career.id !== source.careerId).map((career) => career.company);
		return !introductionV2NarrativeIssues(edit.text, source.sourceText, companies).length && !inspectIntroductionV2ClientText(edit.text, profile, settings).some((check) => check.severity === "block");
	}
	function isIntroductionNarrativeRevisionCurrent(profile, settings) {
		const revision = profile.narrativeEdits;
		return !!revision && revision.templateVersion === "2026-11-06" && revision.settingsVersion === settings.version && revision.sourceKey === introductionV2SourceKey(profile, settings) && revision.edits.every((edit) => validateIntroductionNarrativeEdit(edit, profile, settings));
	}
	function getStoredIntroductionNarrativeEdits(profile, settings) {
		return isIntroductionNarrativeRevisionCurrent(profile, settings) ? profile.narrativeEdits.edits.map((edit) => ({ ...edit })) : [];
	}
	function withoutIntroductionNarrativeEdits(profile) {
		const { narrativeEdits: _revision, ...original } = profile;
		return original;
	}
	function withIntroductionNarrativeEdits(profile, settings, edits) {
		const original = withoutIntroductionNarrativeEdits(profile), seen = /* @__PURE__ */ new Set();
		if (edits.length > 60 || edits.some((edit) => seen.has(edit.factId) || (seen.add(edit.factId), !validateIntroductionNarrativeEdit(edit, original, settings)))) throw new Error("整文の根拠を確認できませんでした。原文は保持されています。");
		const revision = parseIntroductionNarrativeRevision({
			schemaVersion: 1,
			templateVersion: introductionV2Version,
			sourceKey: introductionV2SourceKey(original, settings),
			settingsVersion: settings.version,
			edits
		});
		if (!revision) throw new Error("整文が保存上限を超えています。原文は保持されています。");
		const parsed = parseIntroductionV2Profile({
			...original,
			narrativeEdits: revision
		});
		if (!parsed) throw new Error("紹介文が保存上限を超えています。原文は保持されています。");
		return parsed;
	}
	function markValidatedIntroductionNarrativeEdit(edit, _original) {
		return edit;
	}
	/** Suggestion only: the caller asks the user to confirm the derived total.
	* Inclusive month ranges are merged so overlapping jobs are not double-counted. */
	function suggestIntroductionExperienceTotal(careers) {
		if (!careers.length) return null;
		const ranges = [];
		for (const career of careers) {
			const match = career.period.normalize("NFKC").trim().match(/^(\d{4})[\/年.-](\d{1,2})月?\s*[〜～~－ー−–—-]\s*(\d{4})[\/年.-](\d{1,2})月?$/);
			if (!match) return null;
			const [, y1, m1, y2, m2] = match.map(Number);
			if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12) return null;
			const start = y1 * 12 + m1 - 1, end = y2 * 12 + m2 - 1;
			if (end < start) return null;
			ranges.push({
				start,
				end
			});
		}
		const merged = [];
		for (const range of ranges.sort((a, b) => a.start - b.start)) {
			const last = merged.at(-1);
			if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
			else merged.push({ ...range });
		}
		const months = merged.reduce((sum, range) => sum + range.end - range.start + 1, 0), years = Math.floor(months / 12), rest = months % 12;
		return {
			value: `${years ? `${years}年` : ""}${rest ? `${rest}か月` : ""}`,
			months,
			careerIds: careers.map((career) => career.id)
		};
	}
	//#endregion
	exports.blankIntroductionCareer = blankIntroductionCareer;
	exports.blankIntroductionRate = blankIntroductionRate;
	exports.blankIntroductionV2Profile = blankIntroductionV2Profile;
	exports.blankIntroductionV2Settings = blankIntroductionV2Settings;
	exports.compareIntroductionV2Bodies = compareIntroductionV2Bodies;
	exports.composeIntroductionV2 = composeIntroductionV2;
	exports.formatIntroductionRate = formatIntroductionRate;
	exports.getStoredIntroductionNarrativeEdits = getStoredIntroductionNarrativeEdits;
	exports.inspectIntroductionV2ClientText = inspectIntroductionV2ClientText;
	exports.introductionV2FromLegacy = introductionV2FromLegacy;
	exports.introductionV2Headings = introductionV2Headings;
	exports.introductionV2MaxLength = introductionV2MaxLength;
	exports.introductionV2NarrativeFacts = introductionV2NarrativeFacts;
	exports.introductionV2NarrativeIssues = introductionV2NarrativeIssues;
	exports.introductionV2SourceKey = introductionV2SourceKey;
	exports.introductionV2Version = introductionV2Version;
	exports.isIntroductionNarrativeRevisionCurrent = isIntroductionNarrativeRevisionCurrent;
	exports.markValidatedIntroductionNarrativeEdit = markValidatedIntroductionNarrativeEdit;
	exports.parseIntroductionNarrativeRevision = parseIntroductionNarrativeRevision;
	exports.parseIntroductionRate = parseIntroductionRate;
	exports.parseIntroductionV2Profile = parseIntroductionV2Profile;
	exports.parseIntroductionV2Settings = parseIntroductionV2Settings;
	exports.renderIntroductionRecommendation = renderIntroductionRecommendation;
	exports.renderIntroductionSummary = renderIntroductionSummary;
	exports.resolveIntroductionSource = resolveIntroductionSource;
	exports.suggestIntroductionExperienceTotal = suggestIntroductionExperienceTotal;
	exports.validIntroductionRate = validIntroductionRate;
	exports.validateIntroductionNarrativeEdit = validateIntroductionNarrativeEdit;
	exports.withIntroductionNarrativeEdits = withIntroductionNarrativeEdits;
	exports.withoutIntroductionNarrativeEdits = withoutIntroductionNarrativeEdits;
	return exports;
})({});

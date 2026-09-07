// Builds the paid bundle: both regimes in one table, plus the paperwork.
//
//   npm run build:bundle
//
// What is being sold is not the data. The data is MIT and PDL1.0 and stays free
// in both repositories, and the purchase page says so in the first line — a
// buyer who wants the JSON should take the JSON.
//
// What is being sold is the work a buyer would otherwise do: two agencies with
// two different record shapes reconciled into one table, every source URL in
// one list, and the licence position written as something that can be attached
// to an internal approval. That last one is the actual product. The files are
// how it is delivered.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { crc32 } from 'node:zlib';

const KEIHYO = `${process.env.HOME}/side-projects/keihyo-cases/data/cases.json`;
const cases = JSON.parse(readFileSync(KEIHYO, 'utf8'));
const actions = JSON.parse(readFileSync('data/actions.json', 'utf8'));

// One shape for both. Where a field exists on only one side it stays empty
// rather than being filled with something plausible — a buyer sorting by
// case_number needs the blanks to mean "the agency does not publish one".
const COLUMNS = [
  'id', 'regime', 'authority', 'date', 'fiscal_year', 'order_type',
  'subject_as_published', 'company', 'case_number', 'provisions',
  'product', 'penalty_amount', 'source_url', 'press_release_url', 'source',
];

const rows = [
  ...cases.map((c) => ({
    id: `keihyo-${c.id}`,
    regime: '景品表示法',
    authority: '消費者庁',
    date: c.published_date,
    fiscal_year: c.fiscal_year,
    order_type: c.order_type,
    subject_as_published: c.company,
    company: c.company,
    case_number: '',
    provisions: (c.provisions ?? []).join(' / '),
    product: c.product ?? '',
    penalty_amount: '',
    source_url: c.url,
    press_release_url: c.pdf_url ?? '',
    source: c.source,
  })),
  ...actions.map((a) => ({
    id: `jftc-${a.id}`,
    regime: a.stream === 'dk' ? '独占禁止法' : '取適法（旧下請法）',
    authority: '公正取引委員会',
    date: a.action_date,
    fiscal_year: a.fiscal_year,
    order_type: a.stream_label,
    subject_as_published: a.subject_as_published,
    company: a.company ?? '',
    case_number: a.case_number ?? '',
    provisions: (a.provisions ?? []).join(' / '),
    product: '',
    // Null everywhere, and the reason travels with it. A blank cell in a
    // spreadsheet reads as zero to whoever sorts the column.
    penalty_amount: '（公表一覧に金額の列が無いため未収録）',
    source_url: a.source_url,
    press_release_url: a.press_release_url ?? '',
    source: a.source,
  })),
].sort((x, y) => (x.date < y.date ? 1 : -1));

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
// BOM: without it Excel reads UTF-8 Japanese as mojibake, and the buyer's first
// impression of a paid file is a screen of garbage.
const csv = `﻿${[COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((k) => csvCell(r[k])).join(','))].join('\r\n')}\r\n`;

const sources = [...new Set(rows.map((r) => r.source_url))].sort();
const sourceList = `# 出典一覧

**全 ${rows.length} 件の出典URL（重複を除いて ${sources.length} 件）。**

各レコードの \`source_url\` 列と同じものです。監査や稟議で「どこから取ったか」を
一覧で示す必要があるときのために、1ファイルにまとめてあります。

| 所管 | 件数 |
|---|---|
| 消費者庁（景品表示法） | ${rows.filter((r) => r.authority === '消費者庁').length} |
| 公正取引委員会（独占禁止法・取適法） | ${rows.filter((r) => r.authority === '公正取引委員会').length} |

${sources.map((u) => `- <${u}>`).join('\n')}
`;

const licence = `# 商用利用についての確認書

**発行日：${new Date().toISOString().slice(0, 10)}**
**対象：本バンドルに含まれる ${rows.length} 件の処分記録（景品表示法・独占禁止法・取適法）**

## 元データの利用条件

| 出どころ | 規約 | 商用利用 |
|---|---|---|
| 消費者庁 | [公共データ利用規約（第1.0版）](https://www.caa.go.jp/terms_of_use/)準拠 | **可** |
| 公正取引委員会 | [同規約](https://www.jftc.go.jp/kiyaku/index.html)準拠 | **可（「商用利用も可能です」と明記）** |

公共データ利用規約は複製・公衆送信・翻案を認め、CC BY 4.0 と互換であるとしています。
条件は3つで、本バンドルはいずれも満たしています。

1. **出典の記載** — 全レコードの \`source\` 列と \`source_url\` 列、および出典一覧
2. **編集・加工した旨の明示** — 下記
3. **国が作成したかのような態様で公表しないこと** — 下記

> **本データは、消費者庁および公正取引委員会が公表した資料から事実項目を抽出・構造化したものであり、
> 両庁が作成・公表したものではありません。**

## 同じデータは無料で配布しています

**この確認書は、データを使う権利を売るものではありません。**
元データは上記のとおり公共データ利用規約準拠で、**誰でも無料で商用利用できます。**

- <https://github.com/eoylab/keihyo-cases>（景品表示法・MIT / PDL1.0）
- <https://github.com/eoylab/jftc-actions>（公正取引委員会・MIT / PDL1.0）

**買っていただいたのは、2つの所管の異なる記録を1つの表に揃えた作業と、
出典を1ファイルにまとめた作業と、この確認書そのものです。**

## 収録していないもの

- **代表者氏名。** 処分の公表資料には記載がありますが、収録していません
- **課徴金額。** 公表されている一覧表に金額の列が無く、年によっては画像内の表にしか
  存在しないため、**OCR で読んで事実として出すことはしていません**（全件「未収録」）
- **記述本文。** 「内容」「概要」の文章は両庁が書いたものなので収録せず、出典URLを付けています

## 違反の判定はしていません

各レコードは**既に発出された処分の再記述**です。
「この表現は違反か」「この取引は違反か」を判断する情報は含まれていません。
広告表現や取引条件の適否は個別事案ごとの判断であり、
機械的な OK / NG の一覧はセーフハーバーとして誤用されます。
`;

const README = `# 処分記録 統合バンドル

**${rows.length}件**（景品表示法 ${rows.filter((r) => r.authority === '消費者庁').length} / 独占禁止法・取適法 ${rows.filter((r) => r.authority === '公正取引委員会').length}）
${rows.at(-1).date} 〜 ${rows[0].date}

| ファイル | 中身 |
|---|---|
| \`enforcement-combined.csv\` | 全件。**UTF-8 BOM 付きなので Excel でそのまま開けます** |
| \`SOURCES.md\` | 出典URLの一覧 |
| \`COMMERCIAL-USE.md\` | 商用利用についての確認書 |

## 列

${COLUMNS.map((c) => `- \`${c}\``).join('\n')}

**空欄は「その所管が公表していない」という意味です。** 0 でも「該当なし」でもありません。
例：\`case_number\` は公正取引委員会の勧告には付きません。

## 無料版

**同じ元データは無料で配っています。** JSON / JSONL / CSV と MCP サーバーが
<https://github.com/eoylab/keihyo-cases> と <https://github.com/eoylab/jftc-actions> にあります。
このバンドルが足しているのは、**2所管の統合・出典一覧・確認書**の3つだけです。
`;

// --- Pack -------------------------------------------------------------------
const FILES = [
  ['enforcement-combined.csv', Buffer.from(csv, 'utf8')],
  ['SOURCES.md', Buffer.from(sourceList, 'utf8')],
  ['COMMERCIAL-USE.md', Buffer.from(licence, 'utf8')],
  ['README.md', Buffer.from(README, 'utf8')],
];
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const locals = [];
const central = [];
let offset = 0;
for (const [name, content] of FILES) {
  const nb = Buffer.from(name, 'utf8');
  const sum = crc32(content);
  const local = Buffer.alloc(30 + nb.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(sum, 14); local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nb.length, 26);
  local.writeUInt16LE(0, 28); nb.copy(local, 30);
  locals.push(local, content);
  const entry = Buffer.alloc(46 + nb.length);
  entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(0, 10); entry.writeUInt16LE(0, 12);
  entry.writeUInt16LE(DOS_DATE, 14); entry.writeUInt32LE(sum, 16);
  entry.writeUInt32LE(content.length, 20); entry.writeUInt32LE(content.length, 24);
  entry.writeUInt16LE(nb.length, 28); entry.writeUInt32LE(0, 30); entry.writeUInt16LE(0, 34);
  entry.writeUInt16LE(0, 36); entry.writeUInt32LE(0o100644 * 0x10000, 38);
  entry.writeUInt32LE(offset, 42); nb.copy(entry, 46);
  central.push(entry);
  offset += local.length + content.length;
}
const dir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(FILES.length, 8); end.writeUInt16LE(FILES.length, 10);
end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);

rmSync('build', { recursive: true, force: true });
mkdirSync('build', { recursive: true });
const zip = Buffer.concat([...locals, dir, end]);
writeFileSync('build/enforcement-bundle.zip', zip);
console.log(`build/enforcement-bundle.zip  ${zip.length} bytes  ${rows.length} 件`);
console.log(`  sha256 ${createHash('sha256').update(zip).digest('hex').slice(0, 16)}…`);
console.log(`  出典 ${sources.length} 件 / 列 ${COLUMNS.length}`);

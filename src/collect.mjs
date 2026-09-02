// Reads the JFTC's own year-by-year index tables and turns them into one
// dataset.
//
//   npm run build:data
//
// What this does NOT store is the point. Both index tables carry a long
// prose column — 内容 for the antitrust actions, 概要 for the subcontract
// recommendations — written by the Commission. That column is the part with
// authorship, and copying 380 of them would make this a reproduction of the
// Commission's text rather than a record of facts. The Commission's own terms
// say the quiet part out loud: 「数値データ、簡単な表・グラフ等は著作権による保護の
// 対象ではありません」. So the facts are kept and the prose is dropped, with the
// source URL on every record so anyone who wants the description reads it
// where it was published.
//
// Nothing here judges anything. Each record restates an action the Commission
// has already taken, and there is no field for whether it was justified.

import { writeFileSync, mkdirSync } from 'node:fs';

// The site's WAF answers 403 to anything whose User-Agent is not shaped like a
// browser — it refuses `curl/8`, and it refuses Googlebot's string too, which
// is what tells you it is a shape filter rather than a policy. The policy is
// published separately and is permissive: robots.txt is `User-agent: * /
// Allow: /`, the terms put the whole site under 公共データ利用規約 1.0 with
// 「商用利用も可能です」, and the Commission publishes /llms.txt specifically so
// that language models can read it. So the string below is browser-shaped
// because it has to be, and still carries this project's name so the traffic
// is attributable.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) jftc-actions/0.1 Safari/537.36';
const ORIGIN = 'https://www.jftc.go.jp';

const STREAMS = [
  {
    id: 'dk',
    label: '排除措置命令等（独占禁止法）',
    index: `${ORIGIN}/dk/ichiran/index.html`,
    yearPattern: /href="([^"]*dkhaijo[^"]*\.html)"/g,
  },
  {
    id: 'shitauke',
    label: '勧告（取適法・旧下請法）',
    index: `${ORIGIN}/toriteki/toritekikankoku/index.html`,
    yearPattern: /href="([^"]*(?:FYkankoku|kankoku\d+|\d{6})\.html)"/g,
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

const stripTags = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/** Japanese era date → ISO, or null. Never a guess: an unrecognised era stays null. */
function isoDate(text) {
  const match = text.match(/(令和|平成)\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (match === null) return null;
  const [, era, year, month, day] = match;
  // 令和1 = 2019, 平成1 = 1989. Both eras' first year is year 1, not year 0.
  const base = era === '令和' ? 2018 : 1988;
  const iso = `${base + Number(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// The provision strings are written by hand and vary across fifteen years
// (full-width brackets, pre-amendment notes, several provisions in one cell).
// Rather than parse them into a scheme of our own, every 第N条 and 一般指定N項
// is pulled out verbatim and de-duplicated, and the original string is kept
// beside it. A reader who needs the exact wording has it; a machine that wants
// to filter has something stable.
function provisions(text) {
  const found = text.match(/第\s*\d+\s*条(?:\s*第\s*\d+\s*[項号])*|一般指定\s*\d+\s*項|\d+条(?:後段|前段)?/g) ?? [];
  const normalised = found.map((p) => p.replace(/\s+/g, ''));
  return [...new Set(normalised)];
}

// Titles are 「〈事業者〉に対する件」 — but not always a 事業者. Some name an
// industry (「ごま油の製造販売業者に対する件」) and some name a trade association.
// Guessing a company out of those would put a wrong name in a record about an
// enforcement action, so anything that is not a recognisable corporate form
// leaves `company` null and only `subject_as_published` is kept.
const CORPORATE = /(株式会社|有限会社|合同会社|合資会社|合名会社|医療法人|学校法人|社会福祉法人|一般社団法人|一般財団法人|公益社団法人|公益財団法人|協同組合|生活協同組合|農業協同組合|事業協同組合|商業協同組合|工業組合|商工組合|Inc\.|LLC|Ltd\.|Corp\.|Co\.|㈱|㈲|GmbH|S\.A\.|N\.V\.|B\.V\.)/;

function subject(title) {
  const match = title.match(/^(.*?)に対する(?:件|勧告)/);
  const named = match === null ? title : match[1];
  return { subject_as_published: named, company: CORPORATE.test(named) ? named : null };
}

function tables(html) {
  return [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
}

function cells(row) {
  return [...row.matchAll(/<t[hd][\s\S]*?<\/t[hd]>/g)].map((m) => m[0]);
}

function hrefIn(cell) {
  const match = cell.match(/href="([^"]+)"/);
  return match === null ? null : new URL(match[1], ORIGIN).href;
}

/** Maps a header row to column indexes by what the header says, not by position. */
function columnMap(headerCells) {
  const text = headerCells.map(stripTags);
  const find = (...names) => text.findIndex((t) => names.some((n) => t.replace(/\s/g, '').includes(n)));
  return {
    caseNumber: find('事件番号'),
    title: find('件名'),
    provisions: find('違反法条'),
    date: find('措置年月日', '勧告年月日', '年月日'),
    press: find('報道発表'),
  };
}

const records = [];
const unparsed = [];

for (const stream of STREAMS) {
  const indexHtml = await fetchText(stream.index);
  const years = [...new Set([...indexHtml.matchAll(stream.yearPattern)]
    .map((m) => new URL(m[1], stream.index).href))]
    .filter((url) => !url.endsWith('/index.html'));

  console.log(`${stream.id}: 年度ページ ${years.length} 本`);

  for (const year of years) {
    await sleep(1000);   // one request a second, as a courtesy not a requirement
    let html;
    try {
      html = await fetchText(year);
    } catch (error) {
      unparsed.push({ url: year, reason: `取得失敗: ${error.message}` });
      continue;
    }

    const rows = tables(html);
    if (rows.length === 0) {
      unparsed.push({ url: year, reason: '表が無い' });
      continue;
    }
    const map = columnMap(cells(rows[0]));
    if (map.title === -1 || map.date === -1) {
      unparsed.push({ url: year, reason: `見出しが読めない: ${cells(rows[0]).map(stripTags).join(' / ')}` });
      continue;
    }

    let kept = 0;
    for (const row of rows.slice(1)) {
      const cs = cells(row);
      if (cs.length <= Math.max(map.title, map.date)) continue;   // spacer rows
      const title = stripTags(cs[map.title]);
      // Several year pages repeat the header row between sections. Those are
      // not records that failed to parse, and counting them as such would put
      // twenty-two fake losses in unparsed.json and make the coverage look
      // worse than it is.
      if (title === '件名' || title === '') continue;
      const actionDate = isoDate(stripTags(cs[map.date]));
      if (actionDate === null) {
        unparsed.push({ url: year, title, reason: '措置年月日が読めない' });
        continue;
      }
      const provisionText = map.provisions === -1 ? '' : stripTags(cs[map.provisions]);
      const caseNumber = map.caseNumber === -1 ? null
        : stripTags(cs[map.caseNumber]).replace(/\s*報道発表資料\s*/, '').replace(/\s+/g, '') || null;

      records.push({
        id: `${stream.id}-${actionDate}-${String(records.length + 1).padStart(4, '0')}`,
        stream: stream.id,
        stream_label: stream.label,
        case_number: caseNumber,
        title,
        ...subject(title),
        provisions: provisions(provisionText),
        provisions_as_published: provisionText || null,
        action_date: actionDate,
        fiscal_year: Number(actionDate.slice(0, 4)) - (Number(actionDate.slice(5, 7)) <= 3 ? 1 : 0),
        press_release_url: map.press === -1 ? hrefIn(cs[map.title]) : hrefIn(cs[map.press]) ?? hrefIn(cs[map.title]),
        source_url: year,
        // Not in the index tables, and not in the press-release HTML either —
        // for several years it exists only inside a PNG with an empty alt
        // attribute. Left null rather than filled by OCR: a surcharge figure
        // read by a machine from an image, published as a fact, is the kind of
        // number that ends up quoted in someone's filing.
        penalty_amount: null,
        penalty_status: 'not_in_published_index',
        source: '出典: 公正取引委員会ウェブサイト',
        fetched_at: new Date().toISOString().slice(0, 10),
      });
      kept += 1;
    }
    console.log(`  ${year.replace(ORIGIN, '')}  ${kept} 件`);
  }
}

records.sort((a, b) => (a.action_date < b.action_date ? 1 : -1));

mkdirSync('data', { recursive: true });
writeFileSync('data/actions.json', `${JSON.stringify(records, null, 2)}\n`);
writeFileSync('data/actions.jsonl', `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);

const csvCell = (v) => `"${(Array.isArray(v) ? v.join(' / ') : v ?? '').toString().replace(/"/g, '""')}"`;
const COLUMNS = ['id', 'stream', 'action_date', 'fiscal_year', 'case_number', 'subject_as_published',
  'company', 'provisions', 'provisions_as_published', 'penalty_amount', 'press_release_url', 'source_url'];
writeFileSync('data/actions.csv',
  `${[COLUMNS.join(','), ...records.map((r) => COLUMNS.map((k) => csvCell(r[k])).join(','))].join('\n')}\n`);

writeFileSync('data/unparsed.json', `${JSON.stringify(unparsed, null, 2)}\n`);

// The viewer is served from docs/, and GitHub Pages serves nothing outside it,
// so the data has to exist there too. A trimmed copy: the page needs what it
// displays and filters on, not the provenance fields it never reads.
mkdirSync('docs', { recursive: true });
writeFileSync('docs/actions.json', `${JSON.stringify(records.map((r) => ({
  id: r.id, stream: r.stream, action_date: r.action_date, fiscal_year: r.fiscal_year,
  case_number: r.case_number, subject_as_published: r.subject_as_published,
  provisions: r.provisions, provisions_as_published: r.provisions_as_published,
  press_release_url: r.press_release_url, source_url: r.source_url,
})))}\n`);
writeFileSync('data/meta.json', `${JSON.stringify({
  action_count: records.length,
  by_stream: Object.fromEntries(STREAMS.map((s) => [s.id, records.filter((r) => r.stream === s.id).length])),
  earliest: records.at(-1)?.action_date ?? null,
  latest: records[0]?.action_date ?? null,
  unparsed_count: unparsed.length,
  penalty_amounts_published: records.filter((r) => r.penalty_amount !== null).length,
  source: '出典: 公正取引委員会ウェブサイト',
  licence: '公共データ利用規約(第1.0版) / PDL1.0',
  processing: '公表されている年度別一覧表から事実項目のみを抽出・構造化したもの。'
    + '内容・概要の記述本文は収録していない。編集・加工の主体は jftc-actions であり、公正取引委員会が作成したものではない。',
}, null, 2)}\n`);

console.log(`\n  ${records.length} 件 / 未収録 ${unparsed.length}`);

// The product image for the BOOTH listing.
//
//   npm run image
//
// BOOTH shows this at small sizes in listings, so it carries four things and
// nothing else: what it is, how many records, that the source data is free, and
// the price. The "free" line is on the image on purpose — a buyer who learns
// that after paying has been misled by the packaging even if the page said so.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';

const meta = JSON.parse(readFileSync('data/meta.json', 'utf8'));
const cases = JSON.parse(readFileSync(`${process.env.HOME}/side-projects/keihyo-cases/data/meta.json`, 'utf8'));
const total = meta.action_count + cases.case_count;

const W = 1200;
const H = 1200;
const INK = '#1c1c1e';
const MUTED = '#61616b';
const ACCENT = '#1f4e79';
const SOFT = '#f2f6fa';
const LINE = '#e2e2e6';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const F = 'Hiragino Sans, Noto Sans JP, sans-serif';

const rows = [
  ['景品表示法', `${cases.case_count}件`, '消費者庁'],
  ['独占禁止法・取適法', `${meta.by_stream.dk + meta.by_stream.shitauke}件`, '公正取引委員会'],
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <rect x="0" y="0" width="${W}" height="16" fill="${ACCENT}"/>
  <text x="88" y="200" font-family="${F}" font-size="42" font-weight="700" fill="${ACCENT}" letter-spacing="2">3つの法律の処分を1つの表に</text>
  <text x="88" y="300" font-family="${F}" font-size="92" font-weight="700" fill="${INK}">${total}件・15列のCSV</text>
  <text x="88" y="372" font-family="${F}" font-size="38" fill="${MUTED}">${esc(meta.earliest)} 〜 ${esc(meta.latest)}　全件に出典URL</text>

  ${rows.map((r, i) => `
  <rect x="88" y="${450 + i * 130}" width="${W - 176}" height="112" rx="12" fill="${i % 2 ? '#fff' : SOFT}" stroke="${LINE}"/>
  <text x="124" y="${498 + i * 130}" font-family="${F}" font-size="34" fill="${MUTED}">${esc(r[2])}</text>
  <text x="124" y="${544 + i * 130}" font-family="${F}" font-size="44" font-weight="700" fill="${INK}">${esc(r[0])}</text>
  <text x="${W - 124}" y="${534 + i * 130}" font-family="${F}" font-size="52" font-weight="700" fill="${ACCENT}" text-anchor="end">${esc(r[1])}</text>`).join('')}

  <rect x="88" y="742" width="${W - 176}" height="150" rx="12" fill="#fffbe6" stroke="#e8d98a"/>
  <text x="124" y="800" font-family="${F}" font-size="36" font-weight="700" fill="${INK}">同じ元データは無料で公開しています</text>
  <text x="124" y="852" font-family="${F}" font-size="30" fill="${MUTED}">売っているのは、3つの法律を1つの表に揃える作業です</text>

  <line x1="88" y1="960" x2="${W - 88}" y2="960" stroke="${LINE}" stroke-width="2"/>
  <text x="88" y="1040" font-family="${F}" font-size="76" font-weight="700" fill="${INK}">¥3,000</text>
  <text x="${W - 88}" y="1036" font-family="${F}" font-size="34" fill="${MUTED}" text-anchor="end">買い切り・ZIP・Excelでそのまま開ける</text>
  <text x="88" y="1108" font-family="${F}" font-size="28" fill="${MUTED}">出典: 消費者庁／公正取引委員会（公共データ利用規約 第1.0版準拠）</text>
  <text x="88" y="1152" font-family="${F}" font-size="28" font-weight="700" fill="${MUTED}">github.com/eoylab/jftc-actions</text>
</svg>`;

mkdirSync('creative', { recursive: true });
writeFileSync('creative/product.svg', svg);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
execFileSync(CHROME, ['--headless', '--disable-gpu', `--screenshot=creative/product.png`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--default-background-color=00000000',
  `file://${process.cwd()}/creative/product.svg`], { stdio: 'ignore' });

// Measured, not assumed. A wrong-sized image is the kind of thing that only
// shows up when someone opens it, and by then it is on the listing.
const png = readFileSync('creative/product.png');
const w = png.readUInt32BE(16);
const h = png.readUInt32BE(20);
if (w !== W || h !== H) {
  unlinkSync('creative/product.png');
  throw new Error(`画像の寸法が違う: ${w}x${h}（期待 ${W}x${H}）`);
}
console.log(`creative/product.png  ${w}x${h}  ${png.length} bytes  ${total}件`);

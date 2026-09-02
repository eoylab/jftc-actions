// The invariants that decide whether a record is safe to publish.
//
// Small on purpose. What matters here is not that the parser is clever but
// that it never invents: no natural person's name, no surcharge figure that
// was not published, no guessed company, no date that is not a date.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const actions = JSON.parse(readFileSync('data/actions.json', 'utf8'));
const meta = JSON.parse(readFileSync('data/meta.json', 'utf8'));

test('レコードがある', () => {
  assert.ok(actions.length > 100, `件数が少なすぎる: ${actions.length}`);
  assert.equal(actions.length, meta.action_count);
});

test('必須項目が欠けていない', () => {
  for (const a of actions) {
    for (const key of ['id', 'stream', 'title', 'action_date', 'source_url', 'source']) {
      assert.ok(typeof a[key] === 'string' && a[key] !== '', `${a.id}: ${key} が空`);
    }
    assert.match(a.action_date, /^\d{4}-\d{2}-\d{2}$/, `${a.id}: 日付の書式`);
    assert.ok(!Number.isNaN(Date.parse(a.action_date)), `${a.id}: 実在しない日付`);
    assert.ok(a.source_url.startsWith('https://www.jftc.go.jp/'), `${a.id}: 出典が公取委でない`);
  }
});

test('id が重複していない', () => {
  assert.equal(new Set(actions.map((a) => a.id)).size, actions.length);
});

// The description column is the Commission's prose and the part with
// authorship. Keeping it would make this a reproduction of their text rather
// than a record of facts, and their own terms say the factual table is not
// protected while saying nothing of the kind about the prose.
test('記述本文を持ち込んでいない', () => {
  for (const a of actions) {
    assert.ok(!('content' in a) && !('summary' in a) && !('description' in a),
      `${a.id}: 記述本文の項目がある`);
    for (const [key, value] of Object.entries(a)) {
      if (typeof value === 'string' && value.length > 220) {
        assert.fail(`${a.id}: ${key} が ${value.length} 文字（記述本文が混入している）`);
      }
    }
  }
});

// Every recommendation and order names a representative by name. Those are
// natural persons, and a searchable database of sanctions against identifiable
// individuals is a different thing from a record of corporate enforcement —
// see HC-4 in the venture ledger. There is no field for it, which is the
// mechanism: there is nothing here to leak.
test('自然人の項目を持たない', () => {
  const FORBIDDEN = ['representative', 'representative_name', '代表者', 'ceo', 'director',
    'person', 'officer', 'contact_name', 'phone', 'tel', 'email', 'address_detail'];
  for (const a of actions) {
    for (const key of Object.keys(a)) {
      assert.ok(!FORBIDDEN.includes(key), `${a.id}: 自然人の項目がある: ${key}`);
    }
  }
});

// Unknown is not zero. The amounts are not in the published tables, and for
// some years they exist only inside an image, so a number here would have been
// produced by OCR and published as a fact.
test('公表されていない課徴金額を数字で埋めていない', () => {
  for (const a of actions) {
    assert.equal(a.penalty_amount, null, `${a.id}: 課徴金額が入っている`);
    assert.ok(typeof a.penalty_status === 'string' && a.penalty_status !== '',
      `${a.id}: 金額が無い理由が書かれていない`);
  }
});

// A title naming an industry rather than a company must not become a company.
test('事業者名を推測していない', () => {
  for (const a of actions) {
    if (a.company === null) continue;
    assert.equal(a.company, a.subject_as_published, `${a.id}: company が公表表記と違う`);
    assert.match(a.company,
      /(株式会社|有限会社|合同会社|合資会社|合名会社|医療法人|学校法人|社会福祉法人|一般社団法人|一般財団法人|公益社団法人|公益財団法人|協同組合|生活協同組合|農業協同組合|事業協同組合|商業協同組合|工業組合|商工組合|Inc\.|LLC|Ltd\.|Corp\.|Co\.|㈱|㈲|GmbH|S\.A\.|N\.V\.|B\.V\.)/,
      `${a.id}: 法人格の表記が無いのに company にしている: ${a.company}`);
  }
});

test('出典と加工の表示がある', () => {
  assert.match(meta.source, /公正取引委員会/);
  assert.match(meta.licence, /公共データ利用規約/);
  assert.match(meta.processing, /公正取引委員会が作成したものではない/);
});

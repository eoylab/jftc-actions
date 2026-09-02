# jftc-actions

**公正取引委員会が公表した措置を、機械可読にしたデータセットと MCP サーバー。**
排除措置命令等（独占禁止法）と勧告（取適法・旧下請法）を、事業者・条項・日付で検索できます。

**361件**（排除措置命令等 182 / 勧告 179）・**2010-04-09 〜 2026-07-24**・全件に出典URL。

**違反の判定はしません。** 各レコードは既に発出された措置の再記述です。

一覧: <https://eoylab.github.io/jftc-actions/>

## これは何をしないか

- **判定しない。** 「この取引は下請法違反か」を答える機能は入れません
- **代表者氏名を収録しない。** 公表資料には必ず入っていますが、持ちません
- **公表されていない金額を推測しない。** 課徴金額は全件 `null` です（理由は下記）
- **記述本文を転載しない。** 一覧表の「内容」「概要」の列は収録せず、出典URLを渡します

## なぜあるか

公正取引委員会は、措置を**年度別のHTML表とPDF**で公表しています。
年度をまたいだ一覧はなく、機械可読な一括配布もなく、
**課徴金額は一覧表にもHTMLにも無く、年によっては alt が空の PNG 画像の中の表にしか存在しません。**

取引先300社を持つ企業のコンプライアンス担当が、これを自力で追う工程は
「公表ページを開く → 画像から転記 → 法人番号を引く → 自社台帳と突合」です。

**取適法（旧下請法）の勧告データを構造化して提供している事業者は、調べた範囲で存在しません。**
法情報データベースは審決を扱いますが、審決は2013年の審判制度廃止以降ほとんど発生していません。

## 使う

```bash
git clone https://github.com/eoylab/jftc-actions.git
```

- `data/actions.json` — 全件（配列）
- `data/actions.jsonl` — 1行1レコード
- `data/actions.csv` — 表計算・BI 向け
- `data/unparsed.json` — 収録できなかった行と、その理由
- `data/meta.json` — 件数・期間・収録範囲

### MCP サーバー

```json
{
  "mcpServers": {
    "jftc-actions": {
      "command": "node",
      "args": ["/path/to/jftc-actions/src/mcp/server.mjs"]
    }
  }
}
```

`search_actions` / `get_action` / `list_recent` / `stats`。
通信しません（データは同梱）。依存パッケージはゼロです。

## レコード

```json
{
  "id": "shitauke-2026-07-24-0001",
  "stream": "shitauke",
  "case_number": null,
  "title": "イリソ電子工業株式会社に対する件",
  "subject_as_published": "イリソ電子工業株式会社",
  "company": "イリソ電子工業株式会社",
  "provisions": ["第4条第2項第3号"],
  "provisions_as_published": "旧下請法第4条第2項第3号（不当な経済上の利益の提供要請の禁止）",
  "action_date": "2026-07-24",
  "fiscal_year": 2026,
  "penalty_amount": null,
  "penalty_status": "not_in_published_index",
  "source_url": "https://www.jftc.go.jp/toriteki/toritekikankoku/R8FYkankoku.html",
  "source": "出典: 公正取引委員会ウェブサイト"
}
```

`company` は**法人格の表記があるときだけ**入ります。
「ごま油の製造販売業者に対する件」のように業種を指す件名は `company: null` で、
`subject_as_published` に公表表記だけが残ります。**推測で事業者名を入れません。**

## 有料で作ろうとしているもの

**無料の部分は無料のままです。** データセットと MCP サーバーは MIT / PDL1.0 で配り続けます。
元データは公共データ利用規約準拠なので、**現状でもそのまま商用利用できます。**

売ろうとしているのは、**こちらが手間を負担する部分**です。**まだ一つも作っていません。**

| | 内容 | 価格 | 詳細 |
|---|---|---|---|
| 1 | 更新通知 / 差分通知 | 月 ¥4,980 | [orders/watch.md](orders/watch.md) |
| 2 | Hosted API | 月 ¥9,800 | [orders/api.md](orders/api.md) |
| 3 | 取引先監視 Alert | 月 ¥19,800 | [orders/alert.md](orders/alert.md) |
| 4 | 商用ライセンス / 稼働保証 | 年 ¥120,000 | [orders/license.md](orders/license.md) |
| 5 | 導入支援 | 一括 ¥120,000 | [orders/onboarding.md](orders/onboarding.md) |

**使いたいものに [Issue #1](https://github.com/eoylab/jftc-actions/issues/1) で 👍** を付けてください。
条件があればコメントでどうぞ。価格の根拠は各ページに書いてあります。

**網羅性の保証は売っていません。** 収録範囲は公表されている一覧表が返した範囲で、
`data/meta.json` と `data/unparsed.json` で何が入っていないかを確認できます。
何をどこまで約束できるかは、実際の契約と運用の設計に進む段階で決めます。

## 既知の限界

- **課徴金額・減額率を持っていません。** 全件 null です。公表されている一覧表に列がなく、
  画像内の表から OCR で補完することはしていません。**Unknown は 0 ではありません**
- **収録範囲は、公表されている年度別一覧表が返した範囲です。** `data/meta.json` の件数と
  `data/unparsed.json` の理由で、何が入っていないかを確認できます
- 確約計画の認定など、一覧表に載っていない措置は入っていません
- 審決（審判制度は2013年に廃止）は対象外です。刑事手続に関する記録も収録しません

## 出典とライセンス

`DATA-LICENSE.md` を読んでください。
**出典: 公正取引委員会ウェブサイト。** 元データは公共データ利用規約（第1.0版）準拠。コードは MIT。

**本データは公正取引委員会が公表した資料から jftc-actions が事実項目を抽出・構造化したものであり、
公正取引委員会が作成・公表したものではありません。**

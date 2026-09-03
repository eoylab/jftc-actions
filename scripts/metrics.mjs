// Snapshots what this experiment measures. GitHub keeps 14 days of traffic, so
// this has to run at least once a fortnight — one call returns the whole
// fourteen-day series day by day, so it does not need a cron.
//
// Three different things are measured and they are not interchangeable:
//
//   clones / views / referrers          did anyone find it
//   orders/*.md path views              CTA Click — which price got looked at
//   issue 👍 / comments, watchers, DL   Inquiry and Signup
//
// The CTA landing pages are markdown files inside the repository rather than
// pages on the Pages site, and that is deliberate: the traffic API reports
// paths under github.com/owner/repo, not under owner.github.io. A pricing page
// hosted on Pages produces no measurable click at all.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const REPO = 'eoylab/jftc-actions';
const api = (path) => {
  try {
    return JSON.parse(execFileSync('gh',
      ['api', path === '' ? `repos/${REPO}` : `repos/${REPO}/${path}`], { encoding: 'utf8' }));
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    // The traffic endpoints require push access, so they answer 403 whenever
    // the active `gh` account is not the one that owns this repository. That
    // reads like a broken script and is not one.
    if (output.includes('Must have push access')) {
      console.error(`\n${REPO} の traffic を読む権限が無い。`
        + `\nアクティブな gh アカウントがこのリポジトリの所有者ではない可能性がある。`
        + `\n\n  gh auth status              # どのアカウントがアクティブか`
        + `\n  GH_TOKEN=$(gh auth token --user ${REPO.split('/')[0]}) npm run metrics`
        + `\n\nアカウントを切り替えるより、トークンを渡すほうが端末の状態を変えない。\n`);
      process.exit(1);
    }
    throw error;
  }
};

const TIERS = ['watch', 'api', 'alert', 'license', 'onboarding'];

const today = new Date().toISOString().slice(0, 10);
const previous = existsSync('metrics')
  ? readdirSync('metrics').filter((f) => f.endsWith('.json')).sort().at(-1)
  : undefined;
const gapDays = previous === undefined ? null
  : Math.round((Date.parse(today) - Date.parse(previous.replace('.json', ''))) / 86400000);

const snapshot = {
  date: today,
  views: api('traffic/views'),
  clones: api('traffic/clones'),
  referrers: api('traffic/popular/referrers'),
  paths: api('traffic/popular/paths'),
};
const repo = api('');
snapshot.stars = repo.stargazers_count;
snapshot.forks = repo.forks_count;
snapshot.watchers = repo.subscribers_count;
snapshot.releaseDownloads = api('releases?per_page=100').flatMap((release) =>
  release.assets.map((asset) => ({ tag: release.tag_name, name: asset.name, downloads: asset.download_count })));

// CTA Click, split by which price the reader opened.
//
// `popular/paths` returns only the ten busiest paths, so a tier that is absent
// from the response is not necessarily a tier nobody opened — it may simply be
// outside the top ten. Recording that as zero would be a measurement error in
// the direction that kills the experiment: the decision rule stops everything
// at fewer than twenty clicks, and unobservable counted as zero reaches that
// threshold on its own.
//
// So absence means zero only when the list is short enough to be complete.
// When it is saturated, the tier is `null` with `observable: false`, and
// `belowAtLeast` records the smallest count that did fit — whatever the tier
// got, it got less than that.
const PATHS_CAP = 10;
const saturated = snapshot.paths.length >= PATHS_CAP;
const smallestReported = snapshot.paths.length === 0
  ? null : Math.min(...snapshot.paths.map((p) => p.count));

snapshot.ctaClicks = TIERS.map((tier) => {
  const hit = snapshot.paths.find((p) => p.path.endsWith(`/orders/${tier}.md`));
  if (hit !== undefined) {
    return { tier, views: hit.count, uniques: hit.uniques, observable: true };
  }
  if (!saturated) return { tier, views: 0, uniques: 0, observable: true };
  return { tier, views: null, uniques: null, observable: false, belowAtLeast: smallestReported };
});
snapshot.pathsSaturated = saturated;

// Inquiry.
const issues = api('issues?labels=commercial-interest&state=all&per_page=100');
snapshot.inquiry = issues.map((issue) => ({
  number: issue.number, title: issue.title,
  thumbsUp: issue.reactions['+1'], comments: issue.comments,
}));

const observed = snapshot.ctaClicks.filter((c) => c.observable);
snapshot.totals = {
  uniqueViews: snapshot.views.uniques,
  uniqueClones: snapshot.clones.uniques,
  // A floor, not a total: tiers outside the top ten are missing from it.
  ctaClicksObserved: observed.reduce((n, c) => n + c.views, 0),
  ctaClickUniquesObserved: observed.reduce((n, c) => n + c.uniques, 0),
  ctaTiersUnobservable: snapshot.ctaClicks.filter((c) => !c.observable).map((c) => c.tier),
  thumbsUp: snapshot.inquiry.reduce((n, i) => n + i.thumbsUp, 0),
  inquiryComments: snapshot.inquiry.reduce((n, i) => n + i.comments, 0),
  watchers: snapshot.watchers,
  downloads: snapshot.releaseDownloads.reduce((n, a) => n + a.downloads, 0),
};

mkdirSync('metrics', { recursive: true });
const file = `metrics/${today}.json`;
writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);

const t = snapshot.totals;
console.log(`${file}\n`);
if (gapDays !== null && gapDays > 14) {
  console.log(`  ⚠ 前回から ${gapDays} 日。GitHub は14日しか保持しないので、その間は失われている\n`);
}
console.log('  到達');
console.log(`    views ${snapshot.views.count} (uniques ${t.uniqueViews})   clones ${snapshot.clones.count} (uniques ${t.uniqueClones})`);
console.log(`    referrers ${snapshot.referrers.map((r) => `${r.referrer}:${r.uniques}`).join(' ') || '(none)'}`);
console.log('\n  CTA Click（どの価格が見られたか）');
for (const c of snapshot.ctaClicks) {
  console.log(c.observable
    ? `    ${c.tier.padEnd(11)} ${c.views} (uniques ${c.uniques})`
    : `    ${c.tier.padEnd(11)} 測定不能（上位10パスの外。${c.belowAtLeast} 未満）`);
}
if (snapshot.pathsSaturated) {
  console.log('    ※ popular/paths が上限10件で飽和している。'
    + '出ていない tier は 0 ではなく「10位より下」であって、0 と読んではいけない');
}
console.log(`    観測できた合計 ${t.ctaClicksObserved}`
  + (t.ctaTiersUnobservable.length > 0 ? `（未観測: ${t.ctaTiersUnobservable.join(' ')}）` : ''));
console.log('\n  Inquiry / Signup');
console.log(`    👍 ${t.thumbsUp}   コメント ${t.inquiryComments}   watchers ${t.watchers}   Release DL ${t.downloads}`);
console.log('');

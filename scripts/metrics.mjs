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
const api = (path) => JSON.parse(execFileSync('gh',
  ['api', path === '' ? `repos/${REPO}` : `repos/${REPO}/${path}`], { encoding: 'utf8' }));

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
snapshot.ctaClicks = TIERS.map((tier) => {
  const hit = snapshot.paths.find((p) => p.path.endsWith(`/orders/${tier}.md`));
  return { tier, views: hit?.count ?? 0, uniques: hit?.uniques ?? 0 };
});

// Inquiry.
const issues = api('issues?labels=commercial-interest&state=all&per_page=100');
snapshot.inquiry = issues.map((issue) => ({
  number: issue.number, title: issue.title,
  thumbsUp: issue.reactions['+1'], comments: issue.comments,
}));

snapshot.totals = {
  uniqueViews: snapshot.views.uniques,
  uniqueClones: snapshot.clones.uniques,
  ctaClicks: snapshot.ctaClicks.reduce((n, c) => n + c.views, 0),
  ctaClickUniques: snapshot.ctaClicks.reduce((n, c) => n + c.uniques, 0),
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
for (const c of snapshot.ctaClicks) console.log(`    ${c.tier.padEnd(11)} ${c.views} (uniques ${c.uniques})`);
console.log('\n  Inquiry / Signup');
console.log(`    👍 ${t.thumbsUp}   コメント ${t.inquiryComments}   watchers ${t.watchers}   Release DL ${t.downloads}`);
console.log('');

#!/usr/bin/env node
// MCP server over the JFTC enforcement dataset.
//
// Answers only from data/actions.json. It never fetches, never infers, and
// never says whether an action was justified — every record is a restatement
// of something the Commission has already done, and there is no tool here that
// asks "is this conduct illegal". That judgement is made case by case, and a
// machine-readable pass/fail would be used as a safe harbour by exactly the
// people who should not have one.
//
// Surcharge amounts are null throughout, and `penalty_status` says why: they
// are not in the published index tables. Reporting them as zero, or filling
// them from an image by OCR, would put invented figures into other people's
// compliance records.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const actions = JSON.parse(readFileSync(join(here, '..', '..', 'data', 'actions.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(here, '..', '..', 'data', 'meta.json'), 'utf8'));

const haystack = (action) => [
  action.title, action.subject_as_published, action.company,
  action.case_number, action.provisions_as_published, ...action.provisions,
].filter((v) => typeof v === 'string').join(' ');

const TOOLS = [
  {
    name: 'search_actions',
    description: '公正取引委員会の措置を、事業者名・事件番号・条項・期間・法律で検索する。違反の判定はしない。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '事業者名・件名・事件番号の部分一致' },
        stream: { type: 'string', enum: ['dk', 'shitauke'], description: 'dk=独占禁止法の措置、shitauke=取適法(旧下請法)の勧告' },
        provision: { type: 'string', description: '条項の部分一致（例: 第4条第2項第3号、3条後段）' },
        since: { type: 'string', description: 'YYYY-MM-DD 以降' },
        until: { type: 'string', description: 'YYYY-MM-DD 以前' },
        limit: { type: 'integer', description: '既定 50、上限 500' },
      },
    },
  },
  { name: 'get_action', description: '1件を id で取得する。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'list_recent', description: '直近の措置を新しい順に返す。', inputSchema: { type: 'object', properties: { limit: { type: 'integer' }, stream: { type: 'string', enum: ['dk', 'shitauke'] } } } },
  { name: 'stats', description: '件数・期間・年度別・条項別の内訳と、収録していない項目を返す。', inputSchema: { type: 'object', properties: {} } },
];

function searchActions({ query, stream, provision, since, until, limit }) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const results = actions.filter((action) => {
    if (stream !== undefined && action.stream !== stream) return false;
    if (since !== undefined && action.action_date < since) return false;
    if (until !== undefined && action.action_date > until) return false;
    if (provision !== undefined && !(action.provisions_as_published ?? '').includes(provision)
      && !action.provisions.some((p) => p.includes(provision))) return false;
    if (query !== undefined && query !== '' && !haystack(action).includes(query)) return false;
    return true;
  });
  return { total: results.length, returned: Math.min(results.length, cap), actions: results.slice(0, cap) };
}

function stats() {
  const count = (key) => actions.reduce((acc, a) => {
    for (const value of Array.isArray(a[key]) ? a[key] : [a[key]]) {
      if (value === null) continue;
      acc[value] = (acc[value] ?? 0) + 1;
    }
    return acc;
  }, {});
  return {
    total: actions.length,
    by_stream: meta.by_stream,
    period: { earliest: meta.earliest, latest: meta.latest },
    by_fiscal_year: count('fiscal_year'),
    by_provision: count('provisions'),
    subjects_identified_as_companies: actions.filter((a) => a.company !== null).length,
    not_collected: {
      penalty_amount: '公表されている年度別一覧表に金額の列が無いため全件 null。'
        + '画像内の表から OCR で補完することはしていない',
      description_text: '内容・概要の記述本文は収録していない。出典URLで参照すること',
    },
    source: meta.source,
    licence: meta.licence,
  };
}

function callTool(name, args = {}) {
  if (name === 'search_actions') return searchActions(args);
  if (name === 'get_action') {
    const found = actions.find((a) => a.id === args.id);
    return found ?? { error: `見つからない id: ${args.id}` };
  }
  if (name === 'list_recent') {
    const cap = Math.min(Math.max(Number(args.limit) || 20, 1), 200);
    const pool = args.stream === undefined ? actions : actions.filter((a) => a.stream === args.stream);
    return { actions: pool.slice(0, cap) };
  }
  if (name === 'stats') return stats();
  throw new Error(`unknown tool: ${name}`);
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line === '') continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.method === 'initialize') {
      respond(message.id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'jftc-actions', version: '0.1.0' },
      });
    } else if (message.method === 'tools/list') {
      respond(message.id, { tools: TOOLS });
    } else if (message.method === 'tools/call') {
      try {
        const result = callTool(message.params?.name, message.params?.arguments);
        respond(message.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        respond(message.id, { content: [{ type: 'text', text: `error: ${error.message}` }], isError: true });
      }
    } else if (message.id !== undefined) {
      respond(message.id, {});
    }
  }
});

#!/usr/bin/env node
// One city day: read YouTube -> update the city -> write the episode script.
//   node src/day.mjs                 fetch live numbers (needs YOUTUBE_API_KEY)
//   node src/day.mjs --input f.json  use a saved/hand-written input instead
//   node src/day.mjs --redo          recompute the latest day (e.g. after editing its input)
//   node src/day.mjs --dir demo      keep this city's files in ./demo instead of ./city
//   node src/day.mjs --reset         start again from day 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, runDay, scripts } from './sim.mjs';
import { fetchInput } from './youtube.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
if (opt('lang')) cfg.lang = opt('lang');
const dir = path.resolve(root, opt('dir') ?? 'city');
const sub = n => { const p = path.join(dir, n); fs.mkdirSync(p, { recursive: true }); return p; };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, o) => fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o, null, 1) + '\n');

if (flag('reset')) for (const d of ['state', 'episodes', 'inputs']) fs.rmSync(path.join(dir, d), { recursive: true, force: true });
const days = fs.readdirSync(sub('state')).map(f => +f.match(/^day-(\d+)\.json$/)?.[1]).filter(Boolean).sort((a, b) => a - b);
const latest = days.at(-1) ?? 0;
const day = flag('redo') ? Math.max(1, latest) : latest + 1;
const prev = day > 1 ? read(path.join(dir, 'state', `day-${day - 1}.json`)) : initialState(cfg);

const inputFile = path.join(sub('inputs'), `day-${day}.json`);
let input;
if (opt('input')) input = read(path.resolve(opt('input')));
else if (flag('redo') && fs.existsSync(inputFile)) input = read(inputFile);
else input = await fetchInput(cfg, process.env.YOUTUBE_API_KEY ?? cfg.apiKey);
write(inputFile, input);

const { state, episode } = runDay(prev, input, cfg);
write(path.join(dir, 'state', `day-${day}.json`), state);
const epFile = path.join(sub('episodes'), `day-${day}.json`);
write(epFile, episode);
const sc = scripts(episode);
write(path.join(dir, 'episodes', `day-${day}.txt`), sc.txt);
write(path.join(dir, 'episodes', `day-${day}.srt`), sc.srt);

const m = episode.summary;
console.log(`Day ${day} of ${cfg.cityName}: ${m.before} -> ${m.after} residents, +${m.income} income, ` +
  `${m.built} new buildings, budget ${m.cash}, ${m.queue} waiting. Episode ${episode.duration}s`);
console.log(`  script : ${path.relative(root, epFile)}`);
console.log(`  render : npm run render -- ${path.relative(root, epFile)}`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, votesIn, cleanHandle } from '../src/comments.mjs';
import { initialState, runDay } from '../src/sim.mjs';
import { introEpisode } from '../src/intro.mjs';

const cfg = { cityName: 'Testville', mayorName: 'Leo', lang: 'en', startCash: 50000, maxCommentBuildsPerDay: 4 };

test('comments are mapped to jobs', () => {
  assert.equal(classify('Can I open a kebab shop?').role, 'kebab');
  assert.equal(classify('I want to be the police chief!!').role, 'police');
  assert.equal(classify('Kann ich einen Dönerladen eröffnen?').role, 'kebab');
  assert.equal(classify('Arztpraxis und kann ich bitte leitender Arzt sein?').role, 'hospital');
  assert.equal(classify('Can I open a flower shop next to the bakery?').role, 'flowers');
  assert.deepEqual(classify('Can I open a sushi bar?'), { role: 'custom', label: 'Sushi Bar' });
  assert.equal(classify('this is such a cool idea'), null);
  assert.equal(classify('I watched this whole thing twice and honestly the police part was the funniest bit of the entire video'), null);
});

test('votes and handles', () => {
  assert.deepEqual(votesIn('HARBOR. we need boats', ['harbor', 'airport']), ['harbor']);
  assert.equal(cleanHandle('Some Name'), '@SomeName');
});

test('a day grows the city, founds institutions and hires staff', () => {
  let { state, episode } = runDay(initialState(cfg), {
    subscribers: 5000, video: { id: 'a', likes: 100, commentCount: 3 },
    comments: [
      { author: '@a', text: 'I want to be the police chief', likes: 9 },
      { author: '@b', text: 'let me join the police', likes: 5 },
      { author: '@c', text: 'Can I open a bakery?', likes: 2 },
      { author: '@a', text: 'Can I open a bakery too?', likes: 1 },
    ],
  }, cfg);
  assert.equal(state.residents, 5000);
  assert.equal(state.citizens['@a'].title, 'Police Chief');
  assert.equal(state.citizens['@b'].title, 'Officer');
  assert.equal(state.citizens['@c'].role, 'bakery');
  assert.equal(state.buildings.filter(b => b.role === 'bakery').length, 1, 'one job per person');
  assert.ok(state.housing > 0 && state.cash >= 0);
  assert.ok(episode.duration <= 60, 'fits in a Short');
  assert.ok(episode.shots.every(s => s.cam && s.t1 > s.t0));
  assert.ok(state.buildings.some(b => ['stadium', 'funfair'].includes(b.type)), '1,000 milestone built');
  // no two buildings on the same lot
  const lots = state.buildings.filter(b => b.i != null).map(b => b.i + ',' + b.j);
  assert.equal(new Set(lots).size, lots.length);

  // the same video on the next day only pays for new likes
  ({ state, episode } = runDay(state, { subscribers: 5000, video: { id: 'a', likes: 130, commentCount: 3 }, comments: [] }, cfg));
  assert.equal(episode.summary.income, 30);
});

test('requests the city cannot afford wait in the queue', () => {
  const { state } = runDay(initialState(cfg), { subscribers: 3, video: { id: 'v', likes: 0, commentCount: 1 },
    comments: [{ author: '@doc', text: 'can i be the head doctor', likes: 1 }] }, cfg);
  assert.equal(state.queue.length, 1);
  const next = runDay(state, { subscribers: 900, video: { id: 'w', likes: 0, commentCount: 0 }, comments: [] }, cfg);
  assert.equal(next.state.citizens['@doc'].title, 'Head Doctor');
});

test('day 0 introduces the founder and hands over to day 1', () => {
  const { state, episode } = introEpisode(cfg);
  assert.equal(state.cash, 50000);
  assert.equal(state.residents, 1);
  assert.equal(state.housing - state.residents, 3, 'room for three roommates');
  assert.ok(episode.duration > 35 && episode.duration < 60);
  const text = episode.shots.flatMap(s => s.captions).map(c => c.lines.join(' ').replace(/\*/g, '')).join(' ');
  for (const bit of ['This is Leo.', 'Welcome to Testville!', '€50,000', '€1,000', 'Tell me in the comments!']) assert.ok(text.includes(bit), bit);
  const cash = episode.tracks.cash;
  assert.equal(cash[0][1], 67000); assert.equal(cash.at(-1)[1], 50000);
  const day1 = runDay(state, { subscribers: 12, video: { id: 'x', likes: 0, commentCount: 0 }, comments: [] }, cfg);
  assert.ok(day1.episode.tiles.some(t => t.cobble), 'the village road survives into day 1');
  assert.ok(day1.state.buildings.some(b => b.type === 'cottage') && day1.state.buildings.some(b => b.type === 'sign'));
});

import { ROLES, LANDMARKS } from './roles.mjs';

const INTENT = new RegExp(
  '\\b(can i|could i|may i|i want|i wanna|i wan|i\'d like|i would like|let me|make me|i\'ll|i will|' +
  'i am the|i\'m the|dibs|i call|hire me|' +
  'kann ich|könnte ich|darf ich|ich will|ich möchte|ich moechte|ich wäre|ich bin der|ich bin die|' +
  'mach mich|ich mache?|ich eröffne|ich werde|stell mich ein)\\b', 'i');

const CUSTOM = [
  /\b(?:open|run|own|start|have|build)\s+(?:an?|my own|my|the)\s+([\p{L}' -]{3,22}?)(?=\s+(?:please|pls|plz|in|here|too|for)\b|[?!.,]|$)/iu,
  /\b(?:einen|eine|ein|nen|ne)\s+([\p{L}-]{3,22}?)\s*(?:eröffnen|aufmachen|haben|bauen|betreiben|leiten)/iu,
];

const compiled = Object.entries(ROLES).map(([key, r]) => [key, new RegExp(r.kw, 'i')]);
const landmarkRe = Object.entries(LANDMARKS).map(([key, l]) => [key, new RegExp(l.kw, 'i')]);

export function cleanText(s, max = 90) {
  s = String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export function cleanHandle(s) {
  s = String(s ?? '').replace(/\s+/g, '').slice(0, 24);
  if (!s) return '@anon';
  return s.startsWith('@') ? s : '@' + s;
}

const titleCase = s => s.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/** What does this comment ask for? Returns null for ordinary chatter. */
export function classify(text) {
  const t = cleanText(text, 300);
  const hasIntent = INTENT.test(t);
  if (!hasIntent && t.length > 60) return null;
  // the role mentioned first wins ("a flower shop next to the bakery" -> flowers)
  let best = null;
  for (const [key, re] of compiled) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.at)) best = { role: key, at: m.index };
  }
  if (best) return { role: best.role };
  if (hasIntent) {
    for (const re of CUSTOM) {
      const m = t.match(re);
      if (m) {
        const label = titleCase(m[1].trim());
        if (label.length >= 3) return { role: 'custom', label };
      }
    }
  }
  return null;
}

/** Which landmark options does a comment vote for? */
export function votesIn(text, options) {
  return landmarkRe.filter(([k, re]) => options.includes(k) && re.test(text)).map(([k]) => k);
}

export function isBlocked(c, blocklist = []) {
  const hay = (c.author + ' ' + c.text).toLowerCase();
  return blocklist.some(w => w && hay.includes(String(w).toLowerCase()));
}

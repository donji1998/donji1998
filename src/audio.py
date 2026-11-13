#!/usr/bin/env python3
"""Sound for an episode: narrator voice, sound effects and an original music loop.

    python3 src/audio.py city/episodes/day-0.json [--voice en-us-ryan-high] [--speed 0.92]

1. Speaks every caption with a local Piper voice (downloaded once, ~100 MB).
2. Re-times the episode so each shot lasts as long as its narration; every
   event inside a caption (a house popping up, money moving) stays inside it.
3. Places sound effects on what happens on screen, adds birds/stream ambience
   and a music loop that ducks under the voice.
4. Writes day-N.wav next to the episode, sets "audio" in the episode and
   rewrites day-N.srt / .txt. The un-timed original is kept as day-N.base.json,
   so running it again starts from scratch.

Everything here is generated, so there is nothing to clear for copyright.
Needs: numpy, piper-tts (pip install -r requirements.txt).
"""
import functools, hashlib, json, math, os, re, shutil, sys, tarfile, urllib.request, wave
from pathlib import Path
import numpy as np

SR = 44100
rng = np.random.default_rng(7)

# ----------------------------------------------------------------- voice ----
VOICE_URL = 'https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-{}.tar.gz'
CACHE = Path(os.environ.get('LEOVILLE_CACHE', Path.home() / '.cache' / 'leoville'))


def voice_model(name):
    d = CACHE / 'voices'
    onnx = d / f'{name}.onnx'
    if not onnx.exists():
        d.mkdir(parents=True, exist_ok=True)
        tgz = d / f'{name}.tar.gz'
        print(f'Downloading voice {name} (once)…', flush=True)
        urllib.request.urlretrieve(VOICE_URL.format(name), tgz)
        with tarfile.open(tgz) as t:
            for m in t.getmembers():
                if m.name.endswith(('.onnx', '.onnx.json')):
                    m.name = os.path.basename(m.name)
                    t.extract(m, d, filter='data')
        tgz.unlink()
    return onnx


def say_text(s, lang):
    s = s.replace('*', '')
    s = re.sub(r'[„“”"]', '', s)
    s = re.sub(r'@([\w.\-]+)', lambda m: re.sub(r'[._\-]+', ' ', m.group(1)), s)
    if lang == 'en':
        s = re.sub(r'[−-]?€([\d,.]+)( million)?', lambda m: m.group(1) + (m.group(2) or '') + (' euro' if m.group(1) == '1' else ' euros'), s)
    else:
        s = re.sub(r'([\d.,]+) Millionen €', r'\1 Millionen Euro', s).replace('€', 'Euro')
    s = s.replace('&', ' and ' if lang == 'en' else ' und ').replace('+ ', 'plus ')
    s = re.sub(r'\s+', ' ', s).strip()
    if s and s[-1] not in '.!?,:;':
        s += ','          # a phrase that continues in the next shot keeps a rising tone
    return s


class Narrator:
    def __init__(self, name, speed):
        from piper import PiperVoice, SynthesisConfig
        self.name, self.speed = name, speed
        self.voice = PiperVoice.load(str(voice_model(name)))
        self.cfg = SynthesisConfig(length_scale=speed)
        self.dir = CACHE / 'tts'; self.dir.mkdir(parents=True, exist_ok=True)

    def __call__(self, text):
        key = hashlib.sha1(f'{self.name}|{self.speed}|{text}'.encode()).hexdigest()[:16]
        f = self.dir / f'{key}.wav'
        if not f.exists():
            with wave.open(str(f), 'wb') as w:
                self.voice.synthesize_wav(text, w, syn_config=self.cfg)
        with wave.open(str(f)) as w:
            sr, x = w.getframerate(), np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        x = np.interp(np.arange(0, len(x), sr / SR), np.arange(len(x)), x).astype(np.float32)
        # trim silence at both ends
        loud = np.flatnonzero(np.convolve(np.abs(x), np.ones(441) / 441, 'same') > 0.01)
        if len(loud): x = x[max(0, loud[0] - 400): loud[-1] + 1200]
        return x


# ------------------------------------------------------------ re-timing ----
def retime(ep, narrate):
    """Shots last as long as their narration. Returns the voice clips with their start times."""
    clips, pts, cur = [], [], 0.0
    for k, sh in enumerate(ep['shots']):
        pts.append((sh['t0'], cur))
        cur += 0.3 if k == 0 else 0.12
        for c in sh['captions']:
            clip = narrate(say_text(c.get('say') or ' '.join(c['lines']), ep['lang']))
            dur = len(clip) / SR
            pts.append((c['t0'], cur))
            clips.append((cur, clip))
            c['speech'] = round(dur, 3)
            c['_n0'], cur = cur, cur + dur + 0.16
            c['_n1'] = cur
            pts.append((min(c['t1'], sh['t1'] - 0.02), cur))
        hold = 1.3 if k == len(ep['shots']) - 1 else 0.22
        cur = max(cur + hold, pts[-1 - 2 * len(sh['captions'])][1] + 2.3)
        pts.append((sh['t1'] - 1e-6, cur - 1e-6))
    old = np.array([p[0] for p in pts]); new = np.array([p[1] for p in pts])
    for i in range(1, len(old)):                       # keep both axes strictly increasing
        old[i] = max(old[i], old[i - 1] + 1e-6); new[i] = max(new[i], new[i - 1] + 1e-6)
    f = lambda t: float(np.interp(t, old, new)) if t is not None else None
    r = lambda t: round(f(t), 3)

    for sh in ep['shots']:
        o0 = sh['t0']
        p = sh.get('panel')
        if p:                                          # panel times are local to the shot
            for key in ('at', 'c0', 'c1'):
                if isinstance(p.get(key), (int, float)): p[key] = round(f(o0 + p[key]) - f(o0), 3)
                elif isinstance(p.get(key), list): p[key] = [round(f(o0 + v) - f(o0), 3) for v in p[key]]
        sh['t0'], sh['t1'] = r(sh['t0']), r(sh['t1'])
        for c in sh['captions']:
            c['t0'], c['t1'] = round(c.pop('_n0'), 3), round(c.pop('_n1'), 3)
    for tr in ep['tracks'].values():
        for pt in tr: pt[0] = r(pt[0])
    for b in ep['buildings']:
        if b.get('at') is not None: b['at'] = r(b['at'])
    for t in ep['tiles']:
        if t.get('at') is not None: t['at'] = r(t['at'])
    for g in ep.get('tags', []): g['t0'], g['t1'] = r(g['t0']), r(g['t1'])
    if ep.get('homesFrom') is not None: ep['homesFrom'] = r(ep['homesFrom'])
    ep['shots'][-1]['t1'] = round(cur, 3)
    ep['duration'] = round(cur, 2)
    return clips


# ---------------------------------------------------------------- sounds ----
def t_(d): return np.arange(int(d * SR)) / SR
def dec(d, tau): return np.exp(-t_(d) / tau)


def sweep(f0, f1, d, curve=1.0):
    t = t_(d); f = f0 + (f1 - f0) * (t / d) ** curve
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def onepole(x, a):
    """Low-pass; a may be a scalar or an array (time-varying)."""
    y, s = np.empty_like(x), 0.0
    a = np.broadcast_to(np.asarray(a, np.float32), x.shape)
    for i in range(len(x)):
        s += a[i] * (x[i] - s); y[i] = s
    return y


def noise(d): return rng.uniform(-1, 1, int(d * SR)).astype(np.float32)


@functools.lru_cache(None)
def pop(pitch=1.0):
    d = 0.14
    return (sweep(1100 * pitch, 330 * pitch, d, 0.4) * dec(d, 0.035) * 0.9 + noise(d) * dec(d, 0.002) * 0.3)


@functools.lru_cache(None)
def notify():
    a = np.sin(2 * np.pi * 880 * t_(0.09)) * dec(0.09, 0.05)
    b = np.sin(2 * np.pi * 1320 * t_(0.35)) * dec(0.35, 0.12)
    return np.concatenate([a, b]) * 0.6


@functools.lru_cache(None)
def whoosh(d=0.7, up=True):
    t = t_(d); e = np.sin(np.pi * (t / d) ** (0.7 if up else 1.4)) ** 2
    cut = 0.02 + 0.25 * (t / d if up else 1 - t / d)
    x = noise(d); lo = onepole(x, cut); hi = onepole(lo, cut * 0.35)
    return (lo - hi) * e * 2.2


@functools.lru_cache(None)
def coin():
    a = np.sign(np.sin(2 * np.pi * 988 * t_(0.07))) * 0.25 * dec(0.07, 0.05)
    b = (np.sign(np.sin(2 * np.pi * 1319 * t_(0.45))) * 0.2 + np.sin(2 * np.pi * 2638 * t_(0.45)) * 0.2) * dec(0.45, 0.13)
    return np.concatenate([a, b])


def bell(f, d=1.2, tau=0.35):
    t = t_(d)
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (tau / r ** 0.5)) for r, a in ((1, 1), (2.0, 0.45), (2.76, 0.35), (4.07, 0.2), (5.4, 0.1)))


@functools.lru_cache(None)
def chaching():
    drawer = onepole(noise(0.25), 0.3) * dec(0.25, 0.05) * 0.7
    out = np.zeros(int(1.1 * SR)); out[:len(drawer)] += drawer
    b = bell(1760, 1.0, 0.28) * 0.35; s = int(0.07 * SR); out[s:s + len(b)] += b[:len(out) - s]
    c = coin(); s = int(0.03 * SR); out[s:s + len(c)] += c
    return out


@functools.lru_cache(None)
def spend():
    parts = [np.sin(2 * np.pi * f * t_(0.075)) * dec(0.075, 0.05) for f in (880, 660, 440)]
    return np.concatenate(parts + [np.sin(2 * np.pi * 330 * t_(0.2)) * dec(0.2, 0.08)]) * 0.6


@functools.lru_cache(None)
def thump():
    d = 0.4
    return sweep(95, 42, d, 0.5) * dec(d, 0.11) * 1.1 + onepole(noise(d), 0.08) * dec(d, 0.03) * 0.8


@functools.lru_cache(None)
def sparkle():
    out = np.zeros(int(0.9 * SR))
    for k, f in enumerate((1047, 1319, 1568, 2093)):
        n = np.sin(2 * np.pi * f * t_(0.5)) * dec(0.5, 0.12) * 0.35
        s = int(k * 0.045 * SR); out[s:s + len(n)] += n
    return out


@functools.lru_cache(None)
def click():
    d = 0.05
    return (noise(d) * dec(d, 0.004) * 0.6 + np.sin(2 * np.pi * 2300 * t_(d)) * dec(d, 0.01) * 0.4)


@functools.lru_cache(None)
def jingle():
    out = np.zeros(int(1.8 * SR))
    for k, f in enumerate((523, 659, 784, 1047, 1319)):
        n = bell(f, 1.2, 0.3) * 0.25; s = int(k * 0.09 * SR); out[s:s + len(n)] += n[:len(out) - s]
    return out


def chirp():
    out = []
    for _ in range(rng.integers(2, 5)):
        f0 = rng.uniform(2800, 3800)
        out += [sweep(f0, f0 * rng.uniform(1.2, 1.5), 0.05) * np.sin(np.pi * t_(0.05) / 0.05), np.zeros(int(0.03 * SR))]
    return np.concatenate(out)


def stream(d):
    x = noise(d); lo = onepole(x, 0.18) - onepole(x, 0.02)
    mod = 0.7 + 0.3 * np.sin(2 * np.pi * 3.1 * t_(d)) * np.sin(2 * np.pi * 0.7 * t_(d))
    e = np.minimum(1, np.minimum(t_(d) / 0.6, (d - t_(d)) / 0.6))
    return lo * mod * e * 1.4


# ----------------------------------------------------------------- music ----
@functools.lru_cache(None)
def snare():
    x = noise(0.12)
    return (onepole(x, 0.5) - onepole(x, 0.1)) * dec(0.12, 0.03)


def note(n): return 440 * 2 ** ((n - 69) / 12)


def pluck(freq, d, decay=0.9965):
    N = max(2, int(SR / freq)); n = int(d * SR)
    out = np.zeros(n + N + 1, np.float32)
    out[1:N + 1] = np.convolve(rng.uniform(-1, 1, N), [0.5, 0.5], 'same')
    for s in range(N + 1, len(out), N):
        e = min(s + N, len(out))
        out[s:e] = decay * 0.5 * (out[s - N:e - N] + out[s - N - 1:e - N - 1])
    y = out[1:]
    ratio = (SR / N) / freq                               # fix the integer-delay tuning error
    y = np.interp(np.arange(0, len(y), ratio)[:n], np.arange(len(y)), y)
    y = np.pad(y, (0, n - len(y)))
    return y * np.minimum(1, np.linspace(1, 0, n) * 6)


def music_loop():
    bpm = 112; beat = 60 / bpm
    prog = [(60, 'M'), (67, 'M'), (69, 'm'), (65, 'M'), (60, 'M'), (67, 'M'), (65, 'M'), (67, 'M')]
    L = int(len(prog) * 4 * beat * SR)
    uke, bass, glock, drums = (np.zeros(L + SR) for _ in range(4))
    put = lambda buf, s, x, g=1.0: buf.__setitem__(slice(int(s * SR), int(s * SR) + len(x)), buf[int(s * SR):int(s * SR) + len(x)] + x * g)
    motifs = [[3, 2, 1, 2, 3, None, 2, None], [1, None, 2, 3, 2, None, 0, None],
              [2, 3, 2, 1, 0, None, 1, None], [3, None, 2, 1, 2, 1, 0, None]]
    for bar, (root, q) in enumerate(prog):
        t0 = bar * 4 * beat
        tones = [root, root + (4 if q == 'M' else 3), root + 7, root + 12]
        voicing = [n if n >= 60 else n + 12 for n in tones[:3]] + [tones[0] + 12]
        for b, (off, down, g) in enumerate([(0, 1, 1), (1, 1, .7), (1.5, 0, .55), (2, 1, .9), (3, 1, .7), (3.5, 0, .55)]):
            notes = voicing if down else voicing[::-1]
            for k, n in enumerate(notes):
                put(uke, t0 + off * beat + k * 0.013, pluck(note(n), 0.9), 0.16 * g)
        for off in (0, 2, 3.5):
            n = root - 24 + (7 if off == 3.5 else 0)
            x = t_(beat * 1.6); put(bass, t0 + off * beat, (np.sin(2 * np.pi * note(n) * x) + 0.35 * np.sin(4 * np.pi * note(n) * x)) * np.exp(-x / 0.35) * np.minimum(1, x / 0.01), 0.32)
        for i, m in enumerate(motifs[bar % 4]):
            if m is None: continue
            n = tones[m] + 12; x = t_(0.6)
            put(glock, t0 + i * beat / 2, (np.sin(2 * np.pi * note(n) * x) + 0.2 * np.sin(2 * np.pi * note(n) * 2.76 * x) * np.exp(-x / 0.05)) * np.exp(-x / 0.25), 0.13)
        for b in range(4):
            put(drums, t0 + b * beat, sweep(110, 45, 0.18, 0.4) * dec(0.18, 0.06), 0.35 if b % 2 == 0 else 0.0)
            if b % 2: put(drums, t0 + b * beat, snare(), 0.18)
            for h in (0, 0.5):
                put(drums, t0 + (b + h) * beat, (noise(0.04) - onepole(noise(0.04), 0.3)) * dec(0.04, 0.008), 0.05 if h else 0.035)
    mix = uke + bass + glock + drums
    return mix[:L] + np.concatenate([mix[L:], np.zeros(L - SR)])   # wrap the tails around the loop point


# ------------------------------------------------------------------- mix ----
def mix_episode(ep, clips):
    D = ep['duration']; n = int((D + 0.5) * SR)
    voice, fx, amb = np.zeros(n), np.zeros(n), np.zeros(n)

    def put(buf, t, x, g=1.0):
        s = int(max(0, t) * SR); e = min(n, s + len(x))
        if e > s: buf[s:e] += x[:e - s] * g

    for t, clip in clips: put(voice, t, clip, 1.0)

    shots = ep['shots']
    for k, sh in enumerate(shots):
        if k:                                            # camera moves between shots
            a, b = shots[k - 1]['cam'], sh['cam']
            ratio = max(a['dist'], b['dist']) / min(a['dist'], b['dist'])
            moved = math.hypot(a['x'] - b['x'], a['z'] - b['z']) / max(10, min(a['dist'], b['dist']))
            if ratio > 1.6 or moved > 0.8:
                put(fx, sh['t0'] - 0.05, whoosh(0.9 if ratio > 4 else 0.6, b['dist'] > a['dist']), 0.35)
        if sh.get('ring'): put(fx, sh['t0'] + 0.85, whoosh(0.45), 0.25)
        p = sh.get('panel')
        if p:
            kind, t0 = p['kind'], sh['t0']
            if kind == 'comment': put(fx, t0 + 0.3, notify(), 0.5)
            elif kind in ('followers', 'income', 'hires', 'goal', 'room', 'rules', 'price'): put(fx, t0 + (p['at'] if isinstance(p.get('at'), (int, float)) else p['at'][0] if isinstance(p.get('at'), list) else 0.25), pop(1.2), 0.35)
            if kind == 'followers': put(fx, t0 + p['c1'], chaching(), 0.45)
            if kind == 'rules':
                for a in p['at']: put(fx, t0 + a + 0.05, coin(), 0.4)
            if kind == 'room':
                for i in range(4): put(fx, t0 + p['at'] + 0.25 + i * 0.28, pop(1 + i * 0.12), 0.3)
            if kind == 'cta':
                for i in range(len(p['lines'])): put(fx, t0 + 1.0 + i * 0.45, pop(1.1 + 0.1 * i), 0.3)
            if kind == 'hires':
                for i in range(len(p['rows'])): put(fx, t0 + 0.7 + i * 0.35, pop(1.3), 0.25)
        if sh['type'] in ('landmark',): put(fx, sh['t0'] + 1.4, jingle(), 0.5)
        if sh['type'] == 'water': put(amb, sh['t0'], stream(sh['t1'] - sh['t0'] + 0.6), 0.22)
        if sh is shots[-1]: put(fx, sh['t1'] - 2.4, jingle(), 0.35)

    for b in ep['buildings']:
        if b.get('at') is None: continue
        if b['type'] == 'sign': put(fx, b['at'], bell(1046, 1.4, 0.4), 0.3); put(fx, b['at'], thump(), 0.5); continue
        big = b['type'] in ('tower', 'mega', 'arco', 'stadium', 'funfair', 'harbor', 'airport')
        put(fx, b['at'] - (0.35 if big else 0), whoosh(0.5) if big else pop(0.8), 0.3)
        put(fx, b['at'] + 0.05, thump(), 0.55 if big else 0.4)
        put(fx, b['at'] + 0.2, sparkle(), 0.3)
    last = -1
    for t in sorted(x['at'] for x in ep['tiles'] if x.get('at') is not None):
        if t - last > 0.08: put(fx, t, click(), 0.22); last = t

    tr = ep['tracks']['cash']
    for (ta, va), (tb, vb) in zip(tr, tr[1:]):
        if tb <= ta or abs(vb - va) < 0.5: continue
        if vb > va:
            k = 0
            while ta + k * 0.09 < tb: put(fx, ta + k * 0.09, coin(), 0.18); k += 1
            put(fx, tb, chaching(), 0.35)
        else: put(fx, ta, spend(), 0.35)

    for tag in ep.get('tags', []): put(fx, tag['t0'], pop(1.4), 0.25)

    t = 0.4
    while t < D:                                       # birds all through
        put(amb, t, chirp(), rng.uniform(0.03, 0.06)); t += rng.uniform(1.2, 3.5)

    loop = music_loop()
    mus = np.tile(loop, int(n / len(loop)) + 1)[:n]
    gate = (np.convolve(np.abs(voice), np.ones(2205) / 2205, 'same') > 0.015).astype(np.float32)
    gate = np.convolve(gate, np.hanning(int(0.35 * SR)) / np.hanning(int(0.35 * SR)).sum(), 'same')
    mus *= (0.85 - 0.55 * np.clip(gate, 0, 1))
    tt = np.arange(n) / SR
    mus *= np.clip(tt / 0.4, 0, 1) * np.clip((D + 0.3 - tt) / 1.5, 0, 1)

    v = voice / (np.max(np.abs(voice)) + 1e-9) * 0.92
    out = v + fx * 0.9 + amb + mus * 0.42
    out = np.tanh(out * 1.15) / np.tanh(1.15)          # gentle limiter
    out = out / (np.max(np.abs(out)) + 1e-9) * 0.95
    return out[:int(D * SR)]


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(np.repeat(pcm, 2).tobytes())


def srt(ep):
    def ts(t):
        ms = round(t * 1000)
        return f'{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}'
    caps = [c for s in ep['shots'] for c in s['captions']]
    strip = lambda s: s.replace('*', '')
    return ('\n'.join(f"{k + 1}\n{ts(c['t0'])} --> {ts(c['t1'])}\n{strip(chr(10).join(c['lines']))}\n" for k, c in enumerate(caps)),
            '\n'.join(strip(' '.join(c['lines'])) for c in caps) + '\n')


def main():
    args = sys.argv[1:]
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    path = Path(next(a for a in args if a.endswith('.json')))
    base = path.with_suffix('.base.json')
    if not base.exists(): shutil.copy(path, base)
    ep = json.loads(base.read_text())
    lang = ep.get('lang', 'en')
    default_voice = 'en-us-ryan-high' if lang == 'en' else 'de-thorsten-low'
    narrate = Narrator(opt('--voice', default_voice), float(opt('--speed', '0.92')))
    clips = retime(ep, narrate)
    audio = mix_episode(ep, clips)
    wav = path.with_suffix('.wav')
    write_wav(wav, audio)
    ep['audio'] = wav.name
    path.write_text(json.dumps(ep, indent=1, ensure_ascii=False) + '\n')
    s, txt = srt(ep)
    path.with_suffix('.srt').write_text(s); path.with_suffix('.txt').write_text(txt)
    print(f'{wav}  ({ep["duration"]}s, narrated with {narrate.name})')


if __name__ == '__main__':
    main()

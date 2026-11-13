# Leoville — a 3D city built by your YouTube audience

Every subscriber is a resident. Every like and comment is city budget. And when
someone comments *"Can I be the police chief?"* or *"I want to open a kebab
shop"*, the city builds it and puts their @handle on the sign.

Leo lives alone on an island in a small cottage. Every subscriber moves in.
Run it once a day and it produces a ready-to-upload **1080×1920 YouTube Short**
(under 60 s) that recaps what the audience built.

```
YouTube Data API ──► simulation (city state) ──► episode script ──► 3D player ──► day-N.mp4
  subs, likes,        housing, jobs, votes,       shots, captions,    Three.js      Shorts-ready
  comments            money, waiting list         camera moves
```

## Quick start

```bash
npm install
npm run demo                                   # day 0 + three made-up days -> demo/episodes/
npm run render -- demo/episodes/day-0.json     # the intro episode -> demo/videos/day-0.mp4
npm run render -- demo/episodes/day-2.json     # -> demo/videos/day-2.mp4
npm run preview demo/episodes/day-2.json       # watch/scrub it live in the browser
```

Add `--draft` for a quick half-resolution render. With a GPU a full render takes
about a minute; on a GPU-less server the 3D is drawn in software (~15 min per Short).

Rendering needs `ffmpeg` and Playwright's Chromium
(`npm i -D playwright && npx playwright install chromium` if you don't have them).

## Day 0: the intro episode

`npm run intro` makes the first video of the series (~44 s), which introduces the
founder and the rules:

> This is Leo. Maybe your neighbor soon! Because everyone who subscribes moves
> here, to the island! Leo moved in yesterday and still lives all alone. He built
> himself a small house and a road. Welcome to Leoville! He gets his water from
> the stream down the mountain. The budget still has €50,000. And Leo's house has
> room for 3 roommates! Every new resident brings €1,000! Every like €1, every
> comment €2. Together we'll turn Leoville into a city! What should Leo build
> first? Tell me in the comments!

The names come from `config.json` (`mayorName`, `cityName`); the money from
`startCash` and `economy`. The spoken text is also written to
`episodes/day-0.txt` / `.srt` for a voice-over.

## Using your real channel

1. Create a free, read-only **YouTube Data API v3** key in the
   [Google Cloud console](https://console.cloud.google.com/apis/credentials).
2. Put your channel in `config.json` — `"channel": "@yourhandle"` (or the `UC…` id).
3. Every day:

```bash
npm run intro                                  # once: day 0
YOUTUBE_API_KEY=... npm run day                # every day after: reads subs + the latest video's likes/comments
npm run render -- city/episodes/day-1.json     # -> city/videos/day-1.mp4
```

`npm run day` writes four things into `city/`:

| File | What it is |
| --- | --- |
| `inputs/day-N.json` | The raw numbers and comments it read. Edit and run `npm run day -- --redo` to re-plan the day. |
| `state/day-N.json` | The city after that day: buildings, every citizen's job, votes, waiting list. |
| `episodes/day-N.json` | The script the player renders (shots, captions, camera). |
| `episodes/day-N.txt` / `.srt` | The caption text, for your voice-over or YouTube subtitles. |

Commit `city/` so the town persists between days. No API key yet? Write an
input by hand (see `data/demo/`) and run `npm run day -- --input my-day.json`.

## How the city works

- **Day 0.** Leo, his cottage (room for 4), a cobblestone road, the village
  sign and €50,000 in the budget.
- **Residents = subscribers.** New subscribers arrive homeless and sleep in
  tents until the budget builds houses, apartment blocks, high-rises or
  skyscrapers for them.
- **Budget.** €1,000 per new subscriber, €1 per like, €2 per comment on the
  latest video (change it in `config.json` → `economy`).
- **Jobs from comments**, most-liked first, one job per person:
  - *Institutions* (police, fire station, hospital, school, bank, court,
    library, garage, animal shelter, farm, radio station, cinema): the first
    person to ask founds it and gets the top job — Police Chief, Head Doctor,
    Principal… Everyone after that is hired as staff until the posts are
    full, and the episode advertises the open posts.
  - *Shops* (kebab, bakery, café, pizza, flowers, barber, gym, …): everyone
    gets their own, with their handle on the sign.
  - *Anything else*: "Can I open a sushi bar?" becomes a shop called
    "Sushi Bar".
  - Too expensive today, or more than `maxCommentBuildsPerDay` requests? They
    go on a waiting list and are served first tomorrow.
- **Milestones.** At 1,000 / 10,000 / … residents the city gets a landmark, and
  comments vote on which (stadium vs. funfair, harbor vs. airport).

Roles, prices and keywords (English and German) live in `src/roles.mjs`.

## Settings (`config.json`)

| Key | Meaning |
| --- | --- |
| `cityName`, `mayorName` | Your town and its founder (default: Leoville, Leo). |
| `lang` | `"en"` or `"de"` for every on-screen text. |
| `channel`, `videoId` | Channel to read; pin a specific video instead of the latest upload. |
| `economy`, `startCash` | Money rules. |
| `maxCommentBuildsPerDay`, `maxHousingPerDay` | How much gets built (and how long the video is). |
| `blocklist` | Words or handles that must never appear on screen. |

## Good to know

- **Check the episode before you post.** Comment text and handles are shown on
  screen. The keyword matcher is simple; skim `episodes/day-N.txt`, and fix
  anything in `inputs/day-N.json` + `--redo`.
- YouTube's API rounds public subscriber counts to three significant figures,
  so above 1,000 subs the daily gain moves in steps.
- The video has a silent audio track — add your voice-over and music in your
  editor or straight in the Shorts upload flow.
- HUD, captions and panels stay inside the Shorts safe area (clear of the top
  bar, the right-hand buttons and the bottom title).

## Layout

```
src/sim.mjs       city rules + episode script        web/player.js   plays an episode (pure function of time)
src/roles.mjs     jobs, shops, housing, landmarks    web/world.js    procedural low-poly models
src/comments.mjs  comment -> request / vote          web/style.css   HUD, panels, captions
src/youtube.mjs   YouTube Data API reader            src/render.mjs  frame-exact MP4 export
src/intro.mjs     day-0 intro episode            
src/day.mjs       the daily command                  test/           npm test
```

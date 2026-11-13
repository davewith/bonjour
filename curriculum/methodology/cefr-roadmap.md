# CEFR roadmap

## What exists now (MVP)

**A1 — complete foundation (10 lessons, `curriculum/a1/`)**

| # | Lesson | Focus |
| --- | --- | --- |
| 1 | Greetings and basic expressions | Bonjour/Bonsoir/Salut, politeness |
| 2 | Introducing yourself | Je m'appelle, je suis, enchanté(e) |
| 3 | Name and origin | Questions, tu/vous, venir de |
| 4 | Numbers and basic questions | 0–20, age, question words |
| 5 | Ordering a drink or food | je voudrais, un/une/de, café ritual |
| 6 | Saying where you live | habiter à/en/au, definite articles |
| 7 | Everyday routines | -ER present tense, time words, reflexives |
| 8 | Asking for directions | où est, gauche/droite, polite approach |
| 9 | Shopping and prices | ça coûte combien, je prends, 20–100 |
| 10 | Basic everyday conversation | aimer, linking words, A1 capstone |

Rough scale: ~30 concepts, ~110 vocabulary items, ~60 exercises.

## Planned progression (not yet written)

**A2 — next increment** (structure already supports it: create
`curriculum/a2/*.md`, run `pnpm french sync`):
- Daily routines in depth (passé composé introduction via common
  irregulars: avoir/être)
- Shopping dialogues beyond prices; markets, sizes, paying
- Travel: tickets, hotels, asking about transport times
- Past experiences: hier, la semaine dernière, j'ai mangé...
- Phone/appointments: quel est le numéro, prendre rendez-vous

**B1 — independent conversation:**
- Opinions (je pense que, à mon avis) and justifying them
- Narrating longer past events (imparfait vs passé composé)
- Problem-solving: complaining, explaining a delay, resolving mistakes
  in restaurants/hotels
- Hypotheticals (si j'avais..., je voudrais...)

**B2 — fluent interaction (eventual):**
- Nuanced expression (irony, register shifts, hedging)
- Abstract discussion: work, media, culture, current topics
- Idiomatic control and near-native cohesion

## Design rules for expansion

1. One concept per lesson segment; lessons stay A1-sized (~6 exercises).
2. New levels = new directories (`a2/`, `b1/`) — no code changes.
3. Ids stay globally unique (`a2-03-past-tense`).
4. Grammar builds cumulatively: never require a tense/structure that no
   earlier lesson introduced.
5. Every lesson keeps spoken examples — audio is part of the lesson,
   not an extra.

---
id: a1-06-living
level: A1
order: 6
title: Saying where you live
objectives:
  - Say where you live using j'habite
  - Use à, en, au and aux correctly with different places
  - Use the definite articles le, la, l', les
concepts:
  - id: a1-06-habiter-ville
    kind: grammar
    title: J'habite à + city
    summary: Cities, addresses and areas take "à"
    explanation: >-
      The verb is "habiter" (to live) and it is not reflexive — the correct
      sentence is "J'habite à Lyon" (I live in Lyon), never "Je j'habite à
      Lyon". Use "à" with cities and addresses: "J'habite à Paris",
      "J'habite à Bordeaux". With a general area you keep "à" plus an
      article — "J'habite à la campagne" (I live in the countryside) — or
      use "dans" — "J'habite dans le centre" (I live downtown).
  - id: a1-06-habiter-pays
    kind: grammar
    title: J'habite en + country
    summary: Countries take en, au or aux instead of à
    explanation: >-
      Countries and regions do not take plain "à". Feminine countries and
      regions take "en" — "J'habite en France", "J'habite en Angleterre",
      "J'habite en Espagne". Masculine countries take "au" — "J'habite au
      Canada", "J'habite au Japon". Plural countries take "aux" —
      "J'habite aux États-Unis". The choice depends on the grammatical
      gender of the country name, so learn each country together with its
      article.
  - id: a1-06-definite-articles
    kind: grammar
    title: le, la, l', les and the contraction au/aux
    summary: Definite articles, and what happens after "à"
    explanation: >-
      Every specific French noun needs a definite article — "le"
      (masculine), "la" (feminine), "l'" (before a vowel or mute h), "les"
      (plural): "la maison", "le quartier", "l'appartement", "les rues".
      Articles also contract after "à" — "à + le" becomes "au" and "à +
      les" becomes "aux". So "à le Canada" is impossible; say "au Canada".
      The contraction only happens with le and les: before "la" the
      preposition stays, as in "à la gare" or "à la campagne". Countries
      follow the en/au/aux rules from the previous concept.
vocabulary:
  - id: a1-06-habiter
    fr: habiter
    en: to live
    pos: verb
    exampleFr: J'habite à Paris.
    exampleEn: I live in Paris.
    concept: a1-06-habiter-ville
    tags:
      - verb
  - id: a1-06-jhabite
    fr: J'habite
    en: I live
    pos: phrase
    exampleFr: J'habite à Lyon, dans le centre.
    exampleEn: I live in Lyon, downtown.
    concept: a1-06-habiter-ville
    tags:
      - phrase
  - id: a1-06-la-ville
    fr: la ville
    en: the city / town
    pos: noun
    exampleFr: La ville est grande et animée.
    exampleEn: The city is big and lively.
    concept: a1-06-definite-articles
    tags:
      - place
  - id: a1-06-la-campagne
    fr: la campagne
    en: the countryside
    pos: noun
    exampleFr: J'habite à la campagne.
    exampleEn: I live in the countryside.
    concept: a1-06-habiter-ville
    tags:
      - place
  - id: a1-06-lappartement
    fr: l'appartement
    en: the apartment
    pos: noun
    exampleFr: J'ai un appartement à Paris.
    exampleEn: I have an apartment in Paris.
    concept: a1-06-definite-articles
    tags:
      - home
  - id: a1-06-la-maison
    fr: la maison
    en: the house
    pos: noun
    exampleFr: Ma maison est petite.
    exampleEn: My house is small.
    concept: a1-06-definite-articles
    tags:
      - home
  - id: a1-06-la-rue
    fr: la rue
    en: the street
    pos: noun
    exampleFr: J'habite dans la rue de la Paix.
    exampleEn: I live on rue de la Paix.
    concept: a1-06-definite-articles
    tags:
      - place
  - id: a1-06-preposition-a
    fr: à
    en: in / at / to
    pos: preposition
    exampleFr: J'habite à Marseille.
    exampleEn: I live in Marseille.
    concept: a1-06-habiter-ville
    tags:
      - grammar
  - id: a1-06-en
    fr: en
    en: in (before feminine countries and regions)
    pos: preposition
    exampleFr: J'habite en France.
    exampleEn: I live in France.
    concept: a1-06-habiter-pays
    tags:
      - grammar
  - id: a1-06-au-canada
    fr: au Canada
    en: in Canada
    pos: phrase
    exampleFr: J'habite au Canada.
    exampleEn: I live in Canada.
    concept: a1-06-habiter-pays
    tags:
      - country
  - id: a1-06-le-quartier
    fr: le quartier
    en: the neighbourhood
    pos: noun
    exampleFr: Mon quartier est calme.
    exampleEn: My neighbourhood is quiet.
    concept: a1-06-definite-articles
    tags:
      - place
exercises:
  - id: a1-06-ex-paris
    type: translation
    concept: a1-06-habiter-ville
    vocab: a1-06-jhabite
    prompt: Translate "I live in Paris" into French
    answer: J'habite à Paris
    accepted:
      - j'habite à Paris
      - J'habite a Paris
      - J'habite à Paris.
    explanation: Cities take à — J'habite à Paris.
    difficulty: 1
  - id: a1-06-ex-france-fill
    type: fill_blank
    concept: a1-06-habiter-pays
    vocab: a1-06-en
    prompt: Complete — "J'habite ___ France" (I live in France)
    answer: en
    accepted:
      - J'habite en France
    hint: France is a feminine country name.
    difficulty: 1
  - id: a1-06-ex-maison-article
    type: multiple_choice
    concept: a1-06-definite-articles
    vocab: a1-06-la-maison
    prompt: Which definite article goes with "maison" (house)?
    answer: la
    options:
      - la
      - le
      - l'
      - les
    hint: Think about the gender of the noun.
    explanation: Maison is feminine, so the definite article is la — la maison.
    difficulty: 1
  - id: a1-06-ex-canada
    type: translation
    concept: a1-06-habiter-pays
    vocab: a1-06-au-canada
    prompt: Translate "I live in Canada" into French
    answer: J'habite au Canada
    accepted:
      - j'habite au Canada
      - J'habite au canada
    explanation: au is the contraction of à + le, used before masculine countries.
    difficulty: 2
  - id: a1-06-ex-claire
    type: comprehension
    concept: a1-06-habiter-ville
    prompt: Claire says "J'habite à Lyon". Where does Claire live?
    answer: Lyon
    accepted:
      - in Lyon
      - She lives in Lyon
      - Lyon, France
    hint: Look at the city name after "à".
    difficulty: 1
  - id: a1-06-ex-describe
    type: production
    concept: a1-06-habiter-ville
    vocab: a1-06-jhabite
    prompt: In two short French sentences, say where you live and describe your city
    answer: J'habite à Paris. La ville est grande.
    accepted:
      - J'habite à Paris La ville est grande
      - J'habite à Lyon La ville est belle
      - J'habite dans une grande ville
    hint: Start with J'habite à + city, then use la ville + est + adjective.
    explanation: Any correct J'habite à + city plus a true description of your city earns the point — the city, size and adjective may all vary from the example.
    difficulty: 3
commonMistakes:
  - wrong: J'habite à France
    right: J'habite en France
    why: Countries never take plain "à" — feminine ones take "en", masculine ones take "au" and plural ones take "aux"; "à" is for cities.
  - wrong: J'habite dans maison
    right: J'habite dans la maison
    why: French nouns need an article — "la maison" (the house), never a bare "maison"; the same applies to "la ville" and "le quartier".
  - wrong: Je suis à Paris (meaning I live there)
    right: J'habite à Paris
    why: '"je suis à Paris" only says where you are right now — "j''habite à Paris" says where you live.'
spokenExamples:
  - fr: J'habite à Lyon.
    en: I live in Lyon.
    note: City names take à
  - fr: J'habite en France.
    en: I live in France.
    note: Feminine country takes en
  - fr: J'habite au Canada.
    en: I live in Canada.
    note: à + le contracts to au
  - fr: Où habitez-vous ?
    en: Where do you live? (formal)
    note: The standard question
  - fr: J'habite dans un petit appartement.
    en: I live in a small flat.
    note: With an indefinite article
---

# Saying where you live

Two sentences about your home make you sound fluent faster than almost
anything else. The trick is one verb — **habiter** — plus the right
preposition for the place.

## J'habite — the verb

| French | English |
| --- | --- |
| J'habite à Lyon. | I live in Lyon. |
| Tu habites à Paris ? | Do you live in Paris? |
| Il habite à la campagne. | He lives in the countryside. |

There is no reflexive "se": it is **J'habite**, not "Je j'habite". The
pronoun "je" simply contracts to "j'" before the vowel of "habite".

## The preposition table

| Place type | Preposition | Example |
| --- | --- | --- |
| City / address | à | J'habite à Lyon. |
| Feminine country or region | en | J'habite en France. |
| Masculine country | au | J'habite au Canada. |
| Plural country | aux | J'habite aux États-Unis. |
| Anywhere abroad | à l'étranger | J'habite à l'étranger. |

**Why "en" for feminine countries?** France, l'Angleterre, l'Espagne and
l'Italie are grammatically feminine, and "en" survives before them.
**Why "au"?** Because "au" is simply "à + le" — French has no way to say
"à le Canada". **Why "aux"?** Because "aux" is "à + les", for plural
countries like les États-Unis and les Pays-Bas.

## Definite articles

| | Singular | Plural |
| --- | --- | --- |
| Masculine | le quartier | les quartiers |
| Feminine | la maison | les maisons |
| Before a vowel | l'appartement | les appartements |

You need an article with almost every French noun — "J'aime la ville",
never "J'aime ville". And remember the mandatory contraction after "à":

- **à + le = au** — au Canada, au centre
- **à + les = aux** — aux États-Unis, aux Pays-Bas

## Pronunciation tips

- **à** — a flat, open "ah". "J'habite à Paris" ≈ "jah-BEET ah pa-REE".
- **en France** — "en" is nasal; air leaves through the nose and the "n"
  itself is never pronounced.
- **habite** — the final "e" is silent, so "j'habite" is two syllables,
  "jah-BEET".
- **au Canada** — "au" rhymes with "oh".
- **quartier** — "kar-TYEH", with the soft throat "r".

## Mini-dialogue

> — Tu habites où, maintenant ?
> — J'habite à Lyon. Et toi ?
> — Moi, j'habite en Angleterre, à Manchester.
> — Ah, et tu habites dans un appartement ?
> — Oui, un petit appartement dans le centre. La rue est très calme.

Practise it aloud with the audio, then swap in your own city, country and
home.

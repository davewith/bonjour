---
id: a1-01-test
level: A1
order: 1
title: Test greetings
objectives:
  - Greet someone in French
  - Use bonjour and bonsoir
concepts:
  - id: a1-01-hello
    kind: usage
    title: Saying hello
    summary: Bonjour means hello during the day
    explanation: Use "Bonjour" from morning until early evening. After dark, use "Bonsoir".
  - id: a1-01-gender
    kind: grammar
    title: Definite articles
    summary: le / la / les
    explanation: '"le" before masculine nouns, "la" before feminine nouns, "les" for plural.'
vocabulary:
  - id: a1-01-bonjour
    fr: Bonjour
    en: Hello
    pos: interjection
    exampleFr: Bonjour, comment ça va ?
    exampleEn: Hello, how are you?
    concept: a1-01-hello
  - id: a1-01-bonsoir
    fr: Bonsoir
    en: Good evening
    concept: a1-01-hello
  - fr: Merci
    en: Thank you
exercises:
  - id: a1-01-ex-translate-hello
    type: translation
    concept: a1-01-hello
    vocab: a1-01-bonjour
    prompt: Translate "Hello" into French
    answer: Bonjour
    accepted:
      - Salut
    explanation: '"Bonjour" is the all-purpose daytime greeting.'
    difficulty: 1
  - id: a1-01-ex-choice-evening
    type: multiple_choice
    concept: a1-01-hello
    prompt: Which word means "good evening"?
    answer: Bonsoir
    options:
      - Bonjour
      - Bonsoir
      - Merci
    difficulty: 1
  - id: a1-01-ex-fill-merci
    type: fill_blank
    vocab: Merci
    prompt: 'Complete: "___ !" (thank you)'
    answer: Merci
    difficulty: 1
  - id: a1-01-ex-introduce
    type: production
    concept: a1-01-hello
    prompt: Greet someone and introduce yourself in French
    answer: Bonjour, je m'appelle ...
    difficulty: 2
commonMistakes:
  - wrong: Bonjur
    right: Bonjour
    why: The French spelling uses "jour", not "jur".
spokenExamples:
  - fr: Bonjour, comment ça va ?
    en: Hello, how are you?
    note: Everyday greeting
  - fr: Bonsoir !
    en: Good evening!
---

Teaching notes for the test lesson. Introduce one concept at a time.

/**
 * Answer normalization and grading for objective exercises.
 *
 * Grading is deliberately forgiving about surface form (case, accents,
 * punctuation, whitespace) but strict about content. Alternative acceptable
 * phrasings are declared per-exercise in curriculum `accepted`.
 */

/** Strip accents, lowercase, remove punctuation, collapse whitespace. */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"«»()\-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface GradeResult {
  correct: boolean;
  matched: "exact" | "accepted" | "option" | "none";
}

/**
 * Grade `answer` against the exercise's expected/accepted answers.
 * For multiple_choice, a bare option letter (a/b/c/1/2…) is mapped to the
 * option text before comparison.
 */
export function gradeAnswer(
  answer: string,
  expected: string,
  accepted: string[],
  options?: string[],
): GradeResult {
  const normalized = normalizeAnswer(answer);

  // Map option letters to option text when the exercise provides options.
  if (options && options.length > 0) {
    const letter = normalized.match(/^([a-z]|[1-9])$/);
    if (letter) {
      const idx = /^[1-9]$/.test(letter[1]!)
        ? Number(letter[1]) - 1
        : letter[1]!.charCodeAt(0) - 97;
      const option = options[idx];
      if (option !== undefined) {
        const mapped = normalizeAnswer(option);
        if (mapped === normalizeAnswer(expected))
          return { correct: true, matched: "option" };
        if (accepted.some((a) => normalizeAnswer(a) === mapped))
          return { correct: true, matched: "accepted" };
        return { correct: false, matched: "none" };
      }
    }
  }

  if (normalized === normalizeAnswer(expected)) {
    return { correct: true, matched: "exact" };
  }
  if (accepted.some((a) => normalizeAnswer(a) === normalized)) {
    return { correct: true, matched: "accepted" };
  }
  return { correct: false, matched: "none" };
}

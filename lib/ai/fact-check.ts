// A mechanical guard against invented numbers: every figure in a draft must appear in the note or in the
// news metadata. It can't catch invented claims without digits, which is why Meera reviews every draft.

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, half: 0.5, dozen: 12,
};

const DIGIT_FIGURE = /(?<![\w.])\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])\d+(?:\.\d+)?/g;
const WORD_FIGURE = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');

function normalise(figure: string): string {
  const n = Number(figure.replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : figure;
}

/** Every number mentioned in a text, as normalised strings ("0.4", "14", "2025"). */
export function extractFigures(text: string): string[] {
  const digits = (text.match(DIGIT_FIGURE) ?? []).map(normalise);
  const words = (text.match(WORD_FIGURE) ?? []).map((w) => String(NUMBER_WORDS[w.toLowerCase()]));
  return [...digits, ...words];
}

/** Digit figures in the draft that no source mentions (in digits or words). Returned as written in the draft. */
export function findUnsupportedFigures(draft: string, sources: string[]): string[] {
  const supported = new Set(sources.flatMap(extractFigures));
  const unsupported = new Set<string>();
  for (const match of draft.match(DIGIT_FIGURE) ?? []) {
    if (!supported.has(normalise(match))) unsupported.add(match);
  }
  return [...unsupported];
}

// Safety layer 2: a plain code scanner that runs on every patient message.
// Layer 1 is the AI, which gets these same lists through the interview prompt.
// DRAFT CONTENT: a clinician should review these lists before any real use.

export const GLOBAL_RED_FLAGS = [
  'chest pain or pressure',
  'trouble breathing',
  'fainting or loss of consciousness',
  'confusion or seizure',
  'face drooping, slurred speech, or weakness on one side',
  'heavy bleeding that will not stop',
  'coughing or vomiting blood',
  'sudden worst headache of their life',
  'swelling of the lips, tongue, or throat',
  'thoughts of suicide or self-harm',
  'overdose or poisoning',
  'stiff neck',
];

const COMPLAINT_RED_FLAGS: { match: RegExp; flags: string[] }[] = [
  { match: /throat|swallow|tonsil/, flags: ['cannot swallow their own saliva', 'drooling', 'muffled voice', 'cannot open their mouth fully'] },
  { match: /ankle|foot|knee|leg|wrist|arm|hand|finger|toe|sprain/, flags: ['cannot bear weight or take 4 steps', 'limb looks deformed', 'numb, cold, or blue limb', 'bone visible'] },
  { match: /rash|hives|itch|skin/, flags: ['lip, tongue, or face swelling', 'trouble breathing', 'purple spots that do not fade when pressed', 'blistering or peeling skin', 'rash with high fever'] },
  { match: /cut|lacerat|wound|bite|burn/, flags: ['bleeding that does not stop with pressure', 'numbness past the wound', 'cannot move the area normally', 'large or facial burn'] },
  { match: /ear|sinus/, flags: ['swelling behind the ear', 'sudden hearing loss', 'stiff neck with fever'] },
  { match: /urin|pee|bladder/, flags: ['fever with back or flank pain', 'pregnancy', 'unable to pee'] },
  { match: /eye|vision/, flags: ['vision loss', 'chemical in the eye', 'object stuck in the eye', 'severe eye pain'] },
  { match: /head|migraine/, flags: ['recent head injury', 'stiff neck with fever', 'vision changes', 'worst headache of their life'] },
  { match: /stomach|abdom|belly|vomit|diarrhea/, flags: ['severe constant belly pain', 'black or bloody stool', 'cannot keep fluids down', 'pregnancy'] },
];

export function getComplaintFlags(complaint: string): string[] {
  const text = complaint.toLowerCase();
  return [...new Set(COMPLAINT_RED_FLAGS.filter((c) => c.match.test(text)).flatMap((c) => c.flags))];
}

const KEYWORDS: { label: string; pattern: RegExp }[] = [
  { label: 'Chest pain', pattern: /\bchest (pain|pressure|tightness|hurts?)\b|\b(pain|pressure|tightness) in (my|the) chest\b|\bheart attack\b/ },
  { label: 'Trouble breathing', pattern: /\b(can'?t|cannot|can not|hard to|trouble|difficulty|struggling to|unable to) (catch my )?breath(e|ing)?\b|\bshort(ness)? of breath\b|\bgasping\b|\b(turning|lips?( are| is)?) blue\b/ },
  { label: 'Loss of consciousness', pattern: /\b(passed|blacked) out\b|\bfaint(ed|ing)\b|\bunconscious\b|\bseizures?\b|\bconvuls/ },
  { label: 'Possible stroke', pattern: /\bstroke\b|\bslurr(ed|ing)\b|\bface (is )?(droop|numb)|\b(droop\w*) face\b|\b(one|left|right) side (of (my|the) (body|face) )?(is |feels? |went |going )?(weak|numb)/ },
  { label: 'Heavy bleeding', pattern: /\b(won'?t|doesn'?t|can'?t|not|wont) stop(ping)? (the )?bleeding\b|\bbleeding (won'?t|doesn'?t|will not|wont) stop\b|\b(heavy|heavily|severe|lots? of) (bleeding|blood)\b|\bbleeding (heavily|a lot)\b/ },
  { label: 'Coughing or vomiting blood', pattern: /\b(cough\w*|vomit\w*|throw\w* up|puk\w*) (up )?blood\b/ },
  { label: 'Worst headache', pattern: /\bworst headache\b|\bthunderclap\b/ },
  { label: 'Airway or allergic swelling', pattern: /\bthroat (is )?(closing|swelling|swollen shut)\b|\banaphyla|\b(tongue|lips?) (is |are |getting |feels? )*(swell\w*|swollen|puffy)\b|\b(swollen|puffy) (tongue|lips?)\b/ },
  { label: 'Self-harm', pattern: /\bsuicid|\bkill(ing)? myself\b|\bend(ing)? my life\b|\bwant to die\b|\bwanna die\b|\bhurt(ing)? myself\b|\bself[- ]harm\b/ },
  { label: 'Overdose or poisoning', pattern: /\boverdos|\bpoison(ed|ing)\b|\btook too (much|many)\b/ },
  { label: 'Confusion', pattern: /\bconfused\b|\bdisoriented\b/ },
  { label: 'Stiff neck', pattern: /\bstiff neck\b|\bneck (is |feels |feeling |got |getting )*stiff\b/ },
];

// "no chest pain" and "without trouble breathing" are not flags.
const NEGATION_ALL = /\b((?:do|does|did|have|has|had)(?: not|n'?t)(?: have| had| got)?|no|not|never|without|denies|deny|none|negative for|free of|isn'?t|aren'?t|wasn'?t)\b/g;
// These look like negations but do not rule anything out.
const FALSE_NEGATION = /\b(not sure|not certain|not just|not only|no idea|no clue|no longer)\b/g;
// "never had chest pain this bad" is a positive statement.
const INTENSIFIED = /\b(like this|this bad|this severe|this much)\b/;
// "no fever I have chest pain": a positive verb after the negation ends it.
const POSITIVE_VERB = /\b(have|has|had|got|having|getting|feel|feels|feeling)\b/;
const NEGATION_WINDOW_WORDS = 7;

function isNegated(clause: string, keywordStart: number): boolean {
  if (INTENSIFIED.test(clause)) return false;
  const before = clause.slice(0, keywordStart).replace(FALSE_NEGATION, ' ');
  const words = before.trim().split(/\s+/).slice(-NEGATION_WINDOW_WORDS).join(' ');
  const cues = [...words.matchAll(NEGATION_ALL)];
  const last = cues.at(-1);
  if (!last) return false;
  return !POSITIVE_VERB.test(words.slice(last.index + last[0].length));
}

export interface RedFlagHit {
  label: string;
  text: string;
}

/** Returns every unnegated red flag in a patient's message. */
export function scanForRedFlags(message: string): RedFlagHit[] {
  return scanKeywords(message, KEYWORDS);
}

/**
 * Finds every unnegated keyword in a message. Shared by the red flag scanner and the
 * priority rules, so "no fever" is ignored the same way in both.
 */
export function scanKeywords(message: string, keywords: { label: string; pattern: RegExp }[]): RedFlagHit[] {
  const hits = new Map<string, RedFlagHit>();
  const normalized = message.toLowerCase().replace(/[‘’]/g, "'");
  // Each clause is judged alone: "no fever but chest pain" must still flag.
  const clauses = normalized.split(/[.,;:!?\n]+|\b(?:but|and|then|so|now|because|however|although|though|except)\b/);
  for (const clause of clauses) {
    for (const { label, pattern } of keywords) {
      const match = pattern.exec(clause);
      if (match && !isNegated(clause, match.index)) hits.set(label, { label, text: match[0] });
    }
  }
  return [...hits.values()];
}

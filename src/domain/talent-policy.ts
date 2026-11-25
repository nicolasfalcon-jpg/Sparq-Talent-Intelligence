/**
 * Responsible talent-discovery policy for Ask Sparq. Pure and deterministic: no I/O, no model, fully testable.
 *
 * POLICY BOUNDARY. A request is declined when ALL THREE hold:
 *   1. SUBJECT   it is about people (names, "engineers", "who", "everyone", pronouns…), and
 *   2. ACT       it asks the assistant to EVALUATE, ORDER, DECIDE or INFER, instead of retrieving documented facts, and
 *   3. BASIS     the basis is a person's general worth, or a protected / unrelated characteristic, rather than an
 *                explicit requirement (a capability, a role, a date window).
 * Declined categories: rank people best→worst, score or rate people, identify the weakest people or who to remove,
 * infer personal traits or competence from unrelated information, and make autonomous staffing or assignment decisions.
 *
 * ALWAYS ALLOWED: requirement-based discovery ("who has documented React Native experience", "who is free in January",
 * "which engineers are available from Feb 2"), ordering by availability, and "best match / best fit for these requirements"
 * (the answer is the transparent per-requirement evidence listing, not a judgement of the people).
 *
 * LIMITATIONS (by design, see docs/handoff/08-authorization-and-evidence.md): this is a lexical + structural heuristic over
 * English and basic Spanish. It will miss creative paraphrases, other languages and long indirect requests, and it can
 * over-decline an unusual phrasing. It is a guardrail for the deterministic gateway, not a safety classifier: a future LLM
 * gateway needs its own policy layer, tool allow-lists and evals. The answers themselves also never contain scores,
 * rankings or unverified claims presented as facts, whatever the question.
 */

export type PolicyCategory = "ranking" | "scoring" | "weakest" | "personal_traits" | "autonomous_decision";

export type PolicyAssessment =
  | { allowed: true }
  | { allowed: false; category: PolicyCategory; explanation: string; alternatives: string[] };

export const POLICY_ALTERNATIVES = [
  "Who knows React Native and native iOS?",
  "Who’s free for mobile work in January?",
];

const EXPLANATIONS: Record<PolicyCategory, string> = {
  ranking: "I don’t rank people from best to worst. Documented experience is evidence for a requirement, not a measure of someone’s worth.",
  scoring: "I don’t produce scores, ratings or performance assessments of people. I can show what is documented for a requirement, and whether it is confirmed.",
  weakest: "I don’t identify the weakest people, and I don’t support decisions to remove anyone. Missing documentation is not the same as missing ability.",
  personal_traits: "I don’t infer personal traits or competence from unrelated information such as age, background, health or personality. I only use documented skills, projects and availability.",
  autonomous_decision: "I don’t make staffing decisions or assign people. I can find people with documented experience for a role, and you send the proposal for human review.",
};

/* ---------------- Normalisation ---------------- */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents: "quién" → "quien"
    .replace(/[^a-z0-9#+]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const set = (...w: string[]) => new Set(w);

/* ---------------- Lexicons (English + basic Spanish) ---------------- */

const PERSON_WORDS = set(
  "people", "person", "persons", "engineer", "engineers", "developer", "developers", "dev", "devs", "employee", "employees", "staff", "colleague", "colleagues",
  "teammate", "teammates", "member", "members", "talent", "candidate", "candidates", "professional", "professionals", "who", "whom", "whose", "everyone", "everybody",
  "he", "she", "they", "him", "her", "them", "me", "i", "my", "mine",
  "gente", "personas", "persona", "ingeniero", "ingenieros", "ingeniera", "ingenieras", "desarrollador", "desarrolladores", "empleado", "empleados", "empleadas", "colega", "colegas", "quien", "quienes",
);

const POSITIVE_SUPERLATIVE = set("best", "top", "strongest", "greatest", "finest", "smartest", "brightest", "ablest", "rockstar", "10x", "mvp", "mejor", "mejores");
const NEGATIVE_SUPERLATIVE = set("worst", "weakest", "lowest", "poorest", "slowest", "bottom", "peor", "peores");
/** "most/least" + one of these is a judgement of the person ("most talented"), not a count. */
const MOST_LEAST_ADJ = set("skilled", "talented", "capable", "competent", "experienced", "productive", "valuable", "qualified", "senior", "reliable", "impressive", "knowledgeable", "gifted", "habil", "capaz", "talentoso", "productivo", "valioso", "experimentado");
/** Phrases such as "bajo rendimiento" and "mas debil" (accents removed). */
const NEGATIVE_BIGRAMS = [["mas", "debil"], ["mas", "debiles"], ["bajo", "rendimiento"], ["low", "performer"], ["low", "performers"], ["poor", "performer"], ["poor", "performers"], ["bad", "engineer"], ["bad", "engineers"], ["dead", "weight"]];
const POSITIVE_BIGRAMS = [["mas", "fuerte"], ["mas", "fuertes"], ["number", "one"], ["high", "performer"], ["high", "performers"], ["top", "performer"], ["top", "performers"]];

/** After these the superlative describes a thing, not a person: "best match", "top skills", "best practices". */
const SUPERLATIVE_OBJECT_EXEMPT = set("match", "matches", "fit", "fits", "suited", "aligned", "covered", "coverage", "practice", "practices", "way", "ways", "option", "options", "skills", "skill", "capabilities", "capability", "projects", "project", "work", "certifications", "topics", "mejor", "opcion", "opciones", "practicas", "habilidades");

const RANK_WORDS = set("rank", "ranks", "ranked", "ranking", "rankings", "leaderboard", "tier", "tiers", "clasifica", "clasificar", "ordena", "ordenar", "ranking");
const ORDER_WORDS = set("order", "sort", "list", "arrange", "sorted", "ordered", "lista");
const EVAL_KEYS = set("best", "worst", "skill", "skills", "ability", "abilities", "talent", "performance", "seniority", "experience", "years", "expertise", "competence", "strength", "strengths", "quality", "value", "mejor", "peor", "habilidad", "talento", "rendimiento", "experiencia");
const NEUTRAL_KEYS = set("availability", "available", "start", "date", "dates", "name", "names", "alphabetical", "alphabetically", "location", "kickoff", "disponibilidad", "disponible", "fecha", "nombre");

const SCORE_VERBS = set("score", "scores", "scored", "scoring", "rate", "rates", "rating", "ratings", "grade", "grades", "grading", "evaluate", "evaluating", "evaluation", "assess", "assessing", "assessment", "appraise", "appraisal", "kpi", "kpis", "productivity", "puntua", "puntuar", "califica", "calificar", "evalua", "evaluar", "calificacion", "puntuacion");
/** "scoring system", "credit score", "rate limiting": technical vocabulary, not a score of people. */
const SCORE_TECH_AFTER = set("system", "systems", "model", "models", "engine", "algorithm", "algorithms", "pipeline", "pipelines", "api", "apis", "service", "services", "platform", "platforms", "logic", "limit", "limits", "limiting", "limiter", "card", "cards", "function", "functions", "sistema", "sistemas", "modelo", "modelos");
const SCORE_TECH_BEFORE = set("credit", "fraud", "risk", "lead", "propensity", "recommendation", "relevance", "quality", "test", "code", "rate", "frame", "frames", "page", "pages", "tax", "interest", "exchange");
const HOW_GOOD = set("good", "strong", "skilled", "competent", "capable", "talented", "well", "bueno", "buena", "fuerte", "capaz");

const PROTECTED_WORDS = set(
  "gender", "male", "female", "man", "men", "woman", "women", "race", "racial", "ethnicity", "ethnic", "nationality", "religion", "religious", "muslim", "christian", "jewish", "catholic", "pregnant", "pregnancy", "disability", "disabled", "illness", "sick", "married", "children", "kids", "family", "sexual", "orientation", "lgbt", "lgbtq", "politics", "political",
  "genero", "hombre", "hombres", "mujer", "mujeres", "raza", "religion", "embarazada", "discapacidad", "casado", "casada", "hijos", "familia",
);
const AGE_BIGRAMS = [["how", "old"], ["too", "old"], ["too", "young"], ["years", "old"], ["older", "than"], ["younger", "than"], ["age", "of"], ["her", "age"], ["his", "age"], ["their", "age"], ["que", "edad"]];
const AGE_WORDS = set("age", "aged", "edad");
const TRAIT_WORDS = set(
  "lazy", "smart", "intelligent", "clever", "dumb", "stupid", "motivated", "unmotivated", "committed", "loyal", "trustworthy", "honest", "reliable", "unreliable", "aggressive", "friendly", "introverted", "extroverted", "introvert", "extrovert", "shy", "difficult", "toxic", "arrogant", "ambitious", "passionate",
  "flojo", "inteligente", "motivado", "confiable", "leal", "honesto", "agresivo",
);
/** Nouns about character: flagged whenever a person is mentioned nearby ("does Ana have a good attitude"). */
const TRAIT_NOUNS = set("attitude", "personality", "temperament", "character", "actitud", "personalidad");
const TRAIT_PHRASES = [["culture", "fit"], ["cultural", "fit"], ["team", "player"], ["work", "ethic"], ["flight", "risk"], ["likely", "to", "leave"], ["likely", "to", "quit"], ["will", "quit"], ["will", "leave"]];
const COPULA = set("is", "are", "be", "seems", "seem", "es", "son", "parece");

/** Imperatives that decide something about people on their own. */
const DECISION_VERBS = set("assign", "allocate", "hire", "fire", "promote", "demote", "terminate", "dismiss", "appoint", "asigna", "asignar", "contrata", "contratar", "despide", "despedir", "decide");
/** Search-like verbs ("select engineers with Swift") only count as a decision when the user delegates the choice. */
const SOFT_DECISION_VERBS = set("select", "choose", "pick", "elige", "escoge", "selecciona");
/** "staff" is also a noun ("staff available in January"): it is the verb only before an object like "the project". */
const STAFF_OBJECT = set("the", "this", "my", "our", "that", "a", "an", "it", "them", "up");
const DISMISSAL_WORDS = set("fire", "fired", "terminate", "terminated", "dismiss", "dismissed", "despide", "despedir", "despedido", "despedida");
const FILLERS = set("please", "pls", "can", "could", "would", "you", "just", "now", "ok", "okay", "then", "go", "ahead", "and", "hey", "sparq", "por", "favor", "puedes", "podrias");
const AUTONOMY_PHRASES = [["automatically"], ["autonomously"], ["on", "your", "own"], ["by", "yourself"], ["without", "asking"], ["without", "review"], ["for", "me"], ["por", "mi"], ["automaticamente"], ["tu", "solo"]];
const WHO_SHOULD = set("assign", "hire", "fire", "promote", "staff", "pick", "choose", "put", "select", "add", "allocate", "asignar", "contratar", "despedir", "elegir", "poner");

/* ---------------- Helpers ---------------- */

const hasPhrase = (tokens: string[], phrase: string[]): boolean => {
  for (let i = 0; i + phrase.length <= tokens.length; i++) if (phrase.every((w, j) => tokens[i + j] === w)) return true;
  return false;
};
const hasAnyPhrase = (tokens: string[], phrases: string[][]): boolean => phrases.some((p) => hasPhrase(tokens, p));

/** Is the token at `i` a reference to people? (nouns, pronouns, "who", or a known name) */
function isPersonRef(token: string | undefined, names: Set<string>): boolean {
  return !!token && (PERSON_WORDS.has(token) || names.has(token));
}
const personWithin = (tokens: string[], from: number, to: number, names: Set<string>): boolean => {
  for (let i = Math.max(0, from); i <= Math.min(tokens.length - 1, to); i++) if (isPersonRef(tokens[i], names)) return true;
  return false;
};

function nameTokens(personNames: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of personNames) for (const t of tokenize(n)) if (t.length > 2) out.add(t);
  return out;
}

/* ---------------- Detectors ---------------- */

function mentionsSuperlative(tokens: string[], names: Set<string>, kind: "positive" | "negative"): boolean {
  const single = kind === "positive" ? POSITIVE_SUPERLATIVE : NEGATIVE_SUPERLATIVE;
  const bigrams = kind === "positive" ? POSITIVE_BIGRAMS : NEGATIVE_BIGRAMS;
  const moreLess = kind === "positive" ? "most" : "least";
  if (hasAnyPhrase(tokens, bigrams) && personWithin(tokens, 0, tokens.length - 1, names)) return true;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = tokens[i + 1];
    let hit = false;
    if (single.has(t)) hit = !(next && SUPERLATIVE_OBJECT_EXEMPT.has(next));
    // "most skilled engineer" / "least experienced" (a judgement). Also Spanish "menos habil" for the negative kind.
    if (t === moreLess && next && MOST_LEAST_ADJ.has(next)) hit = true;
    if (kind === "negative" && t === "menos" && next && MOST_LEAST_ADJ.has(next)) hit = true;
    if (kind === "positive" && t === "mas" && next && MOST_LEAST_ADJ.has(next)) hit = true;
    if (!hit) continue;
    // The evaluative term has to be about people: a person reference nearby, or "who is the best…".
    if (personWithin(tokens, i - 4, i + 4, names)) return true;
  }
  return false;
}

/** An explicit "rank / order / sort people by merit" request. */
function asksToRankExplicitly(tokens: string[], names: Set<string>): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (RANK_WORDS.has(t) || ORDER_WORDS.has(t)) {
      const target = personWithin(tokens, i - 4, i + 5, names);
      if (!target) continue;
      const window = tokens.slice(i, i + 9);
      const evalKey = window.some((w) => EVAL_KEYS.has(w));
      const neutralKey = window.some((w) => NEUTRAL_KEYS.has(w));
      // "rank the engineers" is a ranking; "order people by availability" is not.
      if (RANK_WORDS.has(t) && !(neutralKey && !evalKey)) return true;
      if (ORDER_WORDS.has(t) && evalKey) return true;
    }
  }
  return false;
}

/** "who is the best engineer", "the top 5 developers": a superlative about people. */
function asksForBest(tokens: string[], names: Set<string>): boolean {
  return mentionsSuperlative(tokens, names, "positive");
}

/** For scoring only, a group of people is also a target: "evaluate the performance of the team". */
const GROUP_WORDS = set("team", "teams", "squad", "squads", "department", "equipo", "equipos");
function asksToScore(tokens: string[], names: Set<string>): boolean {
  const target = (from: number, to: number) => personWithin(tokens, from, to, names) || tokens.slice(Math.max(0, from), to + 1).some((w) => GROUP_WORDS.has(w));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (SCORE_VERBS.has(t)) {
      const after = tokens[i + 1];
      const before = tokens[i - 1];
      if ((after && SCORE_TECH_AFTER.has(after)) || (before && SCORE_TECH_BEFORE.has(before))) continue;
      if (target(i - 3, i + 4)) return true;
    }
    if (t === "performance" && target(i - 3, i + 4)) {
      const next = tokens[i + 1];
      // "performance review/rating/of the team" is about people; "performance tuning/testing" is a technical topic.
      if (next && ["review", "reviews", "rating", "score", "evaluation", "appraisal", "of", "de"].includes(next)) return true;
      if (tokens[i - 1] === "individual") return true;
    }
    if (t === "how" && HOW_GOOD.has(tokens[i + 1] ?? "") && COPULA.has(tokens[i + 2] ?? "") && personWithin(tokens, i + 2, i + 5, names)) return true;
    if (t === "how" && HOW_GOOD.has(tokens[i + 1] ?? "") && ["does", "do"].includes(tokens[i + 2] ?? "")) return true;
  }
  return false;
}

function asksForWeakest(tokens: string[], names: Set<string>): boolean {
  if (mentionsSuperlative(tokens, names, "negative")) return true;
  if (tokens.includes("underperform") || tokens.includes("underperforming") || tokens.includes("underperformers") || tokens.includes("underperformer")) return true;
  // "who should be fired / let go / laid off / replaced"
  if (hasAnyPhrase(tokens, [["let", "go"], ["laid", "off"], ["lay", "off"], ["get", "rid", "of"]]) && personWithin(tokens, 0, tokens.length - 1, names)) return true;
  return tokens.some((t) => DISMISSAL_WORDS.has(t)) && personWithin(tokens, 0, tokens.length - 1, names);
}

function infersPersonalTraits(tokens: string[], names: Set<string>): boolean {
  if (hasAnyPhrase(tokens, AGE_BIGRAMS)) return true;
  if (tokens.some((t) => AGE_WORDS.has(t)) && personWithin(tokens, 0, tokens.length - 1, names)) return true;
  if (hasAnyPhrase(tokens, TRAIT_PHRASES)) return true;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    // "will Daniel quit?", "will she leave soon"
    if (t === "will" && ["quit", "leave", "resign"].some((w) => tokens[i + 1] === w || tokens[i + 2] === w) && personWithin(tokens, i, i + 3, names)) return true;
    if (TRAIT_NOUNS.has(t) && personWithin(tokens, i - 4, i + 4, names)) return true;
    if (PROTECTED_WORDS.has(t) && personWithin(tokens, i - 5, i + 5, names)) return true;
    if (TRAIT_WORDS.has(t)) {
      // The trait must describe a person: right next to a person reference ("is Mateo reliable", "reliable engineers"),
      // never "reliable payment systems" or "smart contracts".
      const prev = tokens[i - 1] ?? "";
      const next = tokens[i + 1] ?? "";
      const adjacentPerson = isPersonRef(prev, names) || isPersonRef(next, names)
        || (["very", "more", "most", "so", "too", "muy", "mas"].includes(prev) && isPersonRef(tokens[i - 2], names))
        || (COPULA.has(prev) && personWithin(tokens, i - 4, i - 2, names));
      if (adjacentPerson) return true;
    }
  }
  return false;
}

function asksForDecision(tokens: string[], names: Set<string>): boolean {
  // "who should I assign / hire / put on Vela"
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (tokens[i] === "who" && ["should", "must", "shall"].includes(tokens[i + 1] ?? "") && ["i", "we"].includes(tokens[i + 2] ?? "") && WHO_SHOULD.has(tokens[i + 3] ?? "")) return true;
    if (tokens[i] === "quien" && tokens[i + 1] === "deberia" && tokens[i + 2] === "asignar") return true;
  }
  if (hasPhrase(tokens, ["quien", "deberia", "contratar"]) || hasPhrase(tokens, ["quien", "deberia", "elegir"])) return true;
  // Imperative addressed to the assistant: "assign Ana to Vela", "please staff the project", "just pick someone"
  let k = 0;
  while (k < tokens.length && FILLERS.has(tokens[k]!)) k++;
  const first = tokens[k];
  if (first && DECISION_VERBS.has(first)) return true;
  if (first === "staff" && STAFF_OBJECT.has(tokens[k + 1] ?? "")) return true;
  if (first && SOFT_DECISION_VERBS.has(first) && ["someone", "somebody", "anyone", "one"].includes(tokens[k + 1] ?? "")) return true;
  if (first === "put" || first === "move" || first === "confirm") return personWithin(tokens, k + 1, k + 4, names);
  // Delegation words next to a decision verb: "choose for me", "assign them automatically"
  const hasVerb = tokens.some((t) => DECISION_VERBS.has(t) || SOFT_DECISION_VERBS.has(t) || t === "staff");
  return hasVerb && AUTONOMY_PHRASES.some((p) => hasPhrase(tokens, p));
}

/**
 * Assess a free-text request. `personNames` (optional) are full names from the directory the caller is allowed to see;
 * they only help the detector recognise "Ana" or "Marcus Chen" as people. Order matters: the most serious category wins.
 */
export function assessTalentRequest(text: string, personNames: string[] = []): PolicyAssessment {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { allowed: true };
  const names = nameTokens(personNames);
  const decline = (category: PolicyCategory): PolicyAssessment => ({ allowed: false, category, explanation: EXPLANATIONS[category], alternatives: POLICY_ALTERNATIVES });
  // "Rank the engineers from best to worst" is a ranking even though it mentions "worst", so explicit ordering wins.
  if (asksToRankExplicitly(tokens, names)) return decline("ranking");
  if (asksForWeakest(tokens, names)) return decline("weakest");
  if (asksForBest(tokens, names)) return decline("ranking");
  if (asksToScore(tokens, names)) return decline("scoring");
  if (infersPersonalTraits(tokens, names)) return decline("personal_traits");
  if (asksForDecision(tokens, names)) return decline("autonomous_decision");
  return { allowed: true };
}

/* ---------------- Post-check of MODEL output (phase C) ---------------- */

/**
 * The questions are screened BEFORE a model is called (`assessTalentRequest`); this screens what a model WROTE, because a model can
 * volunteer a score or a ranking nobody asked for. Pure and deterministic. It is intentionally strict: a rejected answer is replaced
 * by the deterministic fallback, which is always safe, so a false positive costs a plainer answer and a false negative would
 * break a product rule. The system prompt tells the model not to use these words at all (including to deny them).
 *
 * Rejects: percentages and "x/10"-style ratings, the words score / rank / rating, superlatives about people (best candidate,
 * top performer, weakest, strongest), "#1", and performance-evaluation vocabulary.
 */
const OUTPUT_VIOLATIONS: { code: string; pattern: RegExp }[] = [
  { code: "percentage", pattern: /\d+(?:[.,]\d+)?\s?%/ },
  { code: "rating", pattern: /\b\d+(?:[.,]\d+)?\s?\/\s?(?:5|10|100)\b/ },
  { code: "score", pattern: /\b(?:scores?|scored|scoring|ratings?|rated)\b/i },
  { code: "rank", pattern: /\b(?:rank|ranks|ranked|ranking|rankings|leaderboard)\b|(?:^|\s)#\s?1\b/i },
  { code: "superlative", pattern: /\b(?:best (?:candidate|fit|person|engineer|choice|match)|top (?:candidate|performer|talent|pick)|weakest|strongest (?:candidate|engineer|person)|worst|underperform\w*|low performer)\b/i },
  { code: "performance", pattern: /\bperformance (?:review|rating|evaluation|appraisal)\b/i },
];

export type OutputAssessment = { ok: true } | { ok: false; codes: string[] };

export function assessModelOutput(texts: string[]): OutputAssessment {
  const joined = texts.join("\n");
  const codes = OUTPUT_VIOLATIONS.filter((v) => v.pattern.test(joined)).map((v) => v.code);
  return codes.length === 0 ? { ok: true } : { ok: false, codes };
}

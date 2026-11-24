import { describe, expect, it } from "vitest";
import { assessTalentRequest, type PolicyCategory } from "@/domain/talent-policy";

const NAMES = ["Ana Ruiz", "Lucía Fernández", "Javier Morales", "Daniel Okafor", "Mateo Silva", "Marcus Chen"];
const verdict = (text: string) => assessTalentRequest(text, NAMES);

describe("responsible talent discovery: requests that must keep working", () => {
  it.each([
    "Engineers with React Native and native iOS experience",
    "Who knows AWS and Terraform?",
    "Who’s free for mobile work in January?",
    "Which engineers are available from Feb 2?",
    "Who has documented Kubernetes experience?",
    "Show people with Swift experience sorted by availability",
    "Order the mobile engineers by availability",
    "Who is the best match for a React Native role?",
    "Who is best suited for the Vela Bank mobile role?",
    "What are Ana’s top skills?",
    "Who has built reliable payment systems?",
    "Who has credit scoring experience?",
    "Who has performance testing experience?",
    "Which engineers have rate limiting experience?",
    "Who knows best practices in test automation?",
    "Who worked on Meridian Health?",
    "Who maintains old systems?",
    "Who speaks Spanish and is based in Bogotá?",
    "Who could join Vela Bank in January?",
    "Who has Terraform experience that is still awaiting confirmation?",
    "Staff available in January?",
    "Select engineers with Swift experience",
    "Summarize Vela Bank’s requirements",
    "Build a team for Cobalt Mobility",
    "¿Quién sabe React Native y iOS nativo?",
    "¿Quién está libre en enero?",
  ])("allows: %s", (text) => {
    expect(verdict(text)).toEqual({ allowed: true });
  });
});

describe("responsible talent discovery: requests that are declined", () => {
  const declined: [PolicyCategory, string][] = [
    // ranking people best → worst
    ["ranking", "Rank the engineers from best to worst"],
    ["ranking", "Who is the best React Native engineer?"],
    ["ranking", "Who are the top 5 engineers?"],
    ["ranking", "Who is the strongest in AWS?"],
    ["ranking", "Who is the most talented developer?"],
    ["ranking", "Give me a leaderboard of the team"],
    ["ranking", "Order the engineers by performance"],
    ["ranking", "I need the best person for the mobile role"],
    ["ranking", "¿Quién es el mejor ingeniero de React Native?"],
    // scores and ratings
    ["scoring", "Score each engineer from 1 to 10"],
    ["scoring", "Rate Daniel’s performance"],
    ["scoring", "How good is Mateo?"],
    ["scoring", "Evaluate the performance of the team"],
    ["scoring", "Give me a performance review of Ana"],
    ["scoring", "Calificar a los ingenieros"],
    // weakest people / who to remove
    ["weakest", "Who is the weakest engineer?"],
    ["weakest", "Who are the low performers?"],
    ["weakest", "Who should be fired?"],
    ["weakest", "Who is underperforming?"],
    ["weakest", "Who is the least skilled developer?"],
    ["weakest", "¿Quién es el peor ingeniero?"],
    // personal traits / protected characteristics
    ["personal_traits", "Is Mateo reliable?"],
    ["personal_traits", "How old is Ana?"],
    ["personal_traits", "Which engineers are married with kids?"],
    ["personal_traits", "Will Daniel quit soon?"],
    ["personal_traits", "Does Javier have a good attitude?"],
    ["personal_traits", "Who is lazy?"],
    ["personal_traits", "Is Marcus a flight risk?"],
    // autonomous staffing decisions
    ["autonomous_decision", "Assign Ana to Vela Bank"],
    ["autonomous_decision", "Please staff the Cobalt project for me"],
    ["autonomous_decision", "Who should I assign to the mobile role?"],
    ["autonomous_decision", "Choose the engineers for me automatically"],
    ["autonomous_decision", "Promote Mateo"],
    ["autonomous_decision", "Put Daniel on the Terra Foods team"],
    ["autonomous_decision", "Asigna a Lucía al proyecto"],
  ];

  it.each(declined)("%s: %s", (category, text) => {
    const v = verdict(text);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.category).toBe(category);
  });

  it("every decline explains itself and offers a requirement-based alternative", () => {
    for (const [, text] of declined) {
      const v = verdict(text);
      if (v.allowed) throw new Error(`should be declined: ${text}`);
      expect(v.explanation.length).toBeGreaterThan(40);
      expect(v.alternatives.length).toBeGreaterThan(0);
      // The explanation never contains a score, a ranking or a name.
      expect(v.explanation).not.toMatch(/\d/);
      for (const n of NAMES) expect(v.explanation).not.toContain(n.split(" ")[0]!);
    }
  });

  it("is deterministic and ignores case, accents and punctuation", () => {
    expect(verdict("RANK THE ENGINEERS!!!")).toEqual(verdict("rank the engineers"));
    expect(verdict("¿QUIÉN ES EL MEJOR INGENIERO?")).toEqual(verdict("quien es el mejor ingeniero"));
  });

  it("declines by structure, not only by one keyword: the same words about a requirement stay allowed", () => {
    expect(verdict("best React Native practices")).toEqual({ allowed: true });
    expect(verdict("Who is the best React Native engineer?").allowed).toBe(false);
    expect(verdict("Rate limiting experience").allowed).toBe(true);
    expect(verdict("Rate the engineers").allowed).toBe(false);
  });

  it("documents a known limitation: a creative paraphrase can slip through (this is a guardrail, not a classifier)", () => {
    // Informal praise with no term from the lexicon is not recognised. The answers still never contain scores or rankings.
    expect(verdict("Who really shines at mobile work?").allowed).toBe(true);
  });
});

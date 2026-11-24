/**
 * ILLUSTRATIVE Ask Sparq content, carried over verbatim from the approved V4.2 prototype.
 * These are predefined example answers, NOT model output. They are always labelled
 * "Illustrative example" in the UI. Phase 3 replaces them with the LLM gateway
 * (see docs/handoff/05-gap-analysis.md → Ask Sparq).
 */
import type { AssistantContext } from "@/domain/schemas";

export type AssistantAction = { label: string; href: string; variant: "ink" | "soft" };
export type AssistantRef = { personId: string; name: string; evidence: string; href: string; when?: string; whenTone?: "ok" | "mute" };
export type AssistantAnswer = {
  question: string;
  answer: string;
  bullets: string[];
  refs: AssistantRef[];
  actions: AssistantAction[];
  /** computed = derived from repository data by deterministic code; illustrative = predefined example text. */
  provenance: "computed" | "illustrative" | "fallback";
};

export type ContextContent = {
  short: string;
  hello: string;
  intro: string;
  prompts: { id: string; q: string; a: string; bullets?: string[]; refs?: AssistantRef[]; actions?: AssistantAction[]; computed?: boolean }[];
};

const P = (label: string, href: string): AssistantAction => ({ label, href, variant: "ink" });
const G = (label: string, href: string): AssistantAction => ({ label, href, variant: "soft" });
const R = (personId: string, name: string, evidence: string): AssistantRef => ({ personId, name, evidence, href: `/people/${personId}` });

export const ASSISTANT_CONTENT: Record<AssistantContext, ContextContent> = {
  home: { short: "Home", hello: "Good morning, Laura.", intro: "I can help you start something new or see what needs attention.", prompts: [
    { id: "home-attention", q: "What needs my attention this week?", a: "Two things stand out in the documented staffing data.", bullets: ["Vela Bank has 2 open seats and kicks off Jan 12", "Daniel Okafor’s availability from Feb 2 is not confirmed yet"], actions: [P("Open Vela Bank", "/opportunities?open=vela"), G("Open Planning", "/planning")] },
    { id: "home-mobile-january", q: "Who’s free for mobile work in January?", a: "", computed: true },
  ] },
  people: { short: "People", hello: "Looking for someone specific?", intro: "Ask in plain words. I answer from documented experience only.", prompts: [
    { id: "people-rn-ios", q: "Who knows React Native and native iOS?", a: "", computed: true },
    { id: "people-ai-growth", q: "Who has grown into AI recently?", a: "Two people added AI training or independent work this quarter.", refs: [R("ana", "Ana Ruiz", "LLM prototype + RAG course, 2026"), R("valentina", "Valentina Rojas", "LLM course in progress")], actions: [G("Open Insights", "/insights")] },
  ] },
  passport: { short: "this passport", hello: "Want the short version?", intro: "I summarize from documented projects, with sources.", prompts: [
    { id: "passport-summary", q: "Summarize this experience for a mobile AI team", a: "", computed: true },
    { id: "passport-gaps", q: "What isn’t documented yet?", a: "", computed: true },
  ] },
  mypassport: { short: "My passport", hello: "Your passport, your words.", intro: "I can suggest what to add. You decide what goes in.", prompts: [
    { id: "mypassport-find", q: "What would make my passport easier to find?", a: "Three small additions would help staffing leads find your recent work.", bullets: ["Add your Kestrel Travel discovery sprint as experience", "Add an outcome to Meridian Health", "Confirm your years of GraphQL"], actions: [P("Back to my passport", "/me/passport")] },
    { id: "mypassport-visible", q: "What do staffing leads see?", a: "The same passport you see here, plus your availability. No ratings, scores or performance data.", bullets: ["Use “Preview & export” to see the shared version"], actions: [G("Back to my space", "/me")] },
  ] },
  opps: { short: "Opportunities", hello: "Need a quick read on demand?", intro: "I can summarize opportunities and spot the hard-to-staff ones.", prompts: [
    { id: "opps-vela", q: "Summarize Vela Bank’s requirements", a: "Four roles starting Jan 12 for six months; two are already proposed.", bullets: ["Open: Senior Mobile Engineer (React Native, accessibility)", "Open: Backend Engineer (Node.js or Go, PostgreSQL)", "Proposed: Lucía Fernández (AI) and Camila Duarte (QA)"], actions: [P("Fill the mobile role", "/opportunities/new/role")] },
    { id: "opps-hardest", q: "Which opportunity is hardest to staff?", a: "Cobalt Mobility: 3 mobile seats from Jan 19, while January mobile capacity is already tight.", bullets: ["Only Ethan Brooks has documented Android experience", "No one with Mobile Tech Lead experience is free before Jan 5"], actions: [G("Open Insights", "/insights")] },
  ] },
  role: { short: "Fill a role", hello: "Let’s find the right person.", intro: "Describe the role and I’ll draft the requirements with you.", prompts: [] },
  team: { short: "Build a Team", hello: "Let’s shape this team.", intro: "I can check coverage, conflicts and availability as you compose.", prompts: [] },
  compare: { short: "Compare", hello: "Comparing people?", intro: "I show documented evidence side by side, never a score.", prompts: [] },
  planning: { short: "Planning", hello: "Want this period explained?", intro: "I explain availability from documented assignments.", prompts: [
    { id: "planning-january", q: "Explain January availability", a: "Three mobile engineers free up in January; everyone else stays on projects until February.", bullets: ["Ana Ruiz and Javier Morales: Jan 5, after Meridian Health", "Ethan Brooks: Jan 19, after Lumen Retail", "Lucía Fernández is free now but proposed for Vela Bank"], actions: [P("Build a team", "/opportunities/new/team")] },
  ] },
  insights: { short: "Insights", hello: "What would you like to understand?", intro: "I read capability patterns, never individual performance.", prompts: [
    { id: "insights-capacity", q: "Where are we short on capacity?", a: "Cloud and mobile, in that order.", bullets: ["No cloud engineer free before Feb 2; 2 cloud roles open", "January: 4 mobile roles, 3 mobile engineers free"], actions: [P("Open Planning", "/planning")] },
  ] },
  me: { short: "My space", hello: "Hi Ana. Planning your next step?", intro: "I only use your own passport and open opportunities.", prompts: [
    { id: "me-fit", q: "Which opportunities fit my interests?", a: "Three openings match your documented skills; two also match your stated interests.", bullets: ["Vela Bank · Senior Mobile Engineer · applied AI", "Cobalt Mobility · Mobile Tech Lead · leadership", "Cobalt Mobility · iOS Engineer · skills match"], actions: [P("See opportunities", "/me")] },
    { id: "me-add", q: "What should I add to my passport?", a: "Three small updates would make your experience easier to find.", bullets: ["An outcome for Meridian Health", "Your years of GraphQL experience", "Your Kestrel Travel discovery work"], actions: [G("Update now", "/me/passport")] },
  ] },
};

/** Map a pathname to the Ask Sparq context used by the global panel. */
export function contextForPath(pathname: string): AssistantContext {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/me/passport")) return "mypassport";
  if (pathname.startsWith("/me")) return "me";
  if (pathname.startsWith("/people/")) return "passport";
  if (pathname.startsWith("/people")) return "people";
  if (pathname.startsWith("/opportunities/new/role")) return "role";
  if (pathname.startsWith("/opportunities/new/team")) return "team";
  if (pathname.startsWith("/opportunities")) return "opps";
  if (pathname.startsWith("/compare")) return "compare";
  if (pathname.startsWith("/planning")) return "planning";
  if (pathname.startsWith("/insights")) return "insights";
  return "home";
}

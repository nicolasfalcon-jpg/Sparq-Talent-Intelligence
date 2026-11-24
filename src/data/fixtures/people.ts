/**
 * FICTIONAL DEMO DATA — every person, client and project here is invented.
 * Extracted from the approved V4.2 prototype and normalised into the domain model.
 * Do not add real employee records to this file.
 */
import type { Availability, CareerInterests, Person, ProjectExperience, SkillEvidence } from "@/domain/schemas";

export const people: Person[] = [
  {
    id: "ana", name: "Ana Ruiz", headline: "Senior Mobile Engineer", discipline: "Mobile", location: "Medellín", country: "Colombia",
    yearsExperience: 9, atSparqSince: 2019, languages: ["English", "Spanish"],
    summary: "I build mobile products people rely on, from offline-first architecture to the last accessibility detail, and I am bringing applied AI into mobile.",
    topSkills: ["React Native", "Swift", "TypeScript"],
    journey: [
      { when: "2015", role: "Systems Engineering", org: "University degree", current: false },
      { when: "2016", role: "Frontend Developer", org: "Lumbre Studio", current: false },
      { when: "2019", role: "Mobile Engineer", org: "Sparq", current: false },
      { when: "2022 – now", role: "Senior Mobile Engineer", org: "Sparq", current: true },
    ],
    certifications: [
      { name: "AWS Certified Developer – Associate", date: "2024" },
      { name: "Accessibility Core Competencies (CPACC)", date: "2023" },
      { name: "Sparq AI Foundations", date: "2026" },
      { name: "Building RAG applications", date: "Sep 2026" },
    ],
    workPreferences: "Open to travel up to 20% · enjoys teams of 4–8", workPreferencesShared: true,
    passportUpdated: "Updated Nov 18, 2026 by Ana · project evidence confirmed by delivery leads",
    passportGroups: [
      { title: "Mobile engineering", description: "Cross-platform and native", groups: ["mobile"] },
      { title: "Web & APIs", description: "The layer beneath the app", groups: ["web", "cloud"] },
      { title: "Applied AI", description: "Growing focus", groups: ["ai"] },
    ],
  },
  { id: "lucia", name: "Lucía Fernández", headline: "AI Engineer", discipline: "AI", location: "Mexico City", country: "Mexico", yearsExperience: 7, languages: ["Spanish", "English"],
    summary: "Builds production LLM applications with retrieval, evaluation and guardrails.", topSkills: ["LLM apps", "RAG", "Python"], journey: [], certifications: [] },
  { id: "javier", name: "Javier Morales", headline: "iOS Engineer", discipline: "Mobile", location: "Medellín", country: "Colombia", yearsExperience: 6, languages: ["Spanish", "English"],
    summary: "Native iOS engineer focused on performance, accessibility and health.", topSkills: ["Swift", "SwiftUI", "XCTest"], journey: [], certifications: [] },
  { id: "ethan", name: "Ethan Brooks", headline: "Android Engineer", discipline: "Mobile", location: "Austin", country: "United States", yearsExperience: 5, languages: ["English"],
    summary: "Android and cross-platform engineer for commerce apps.", topSkills: ["Kotlin", "Compose", "React Native"], journey: [], certifications: [] },
  { id: "sofia", name: "Sofía Martínez", headline: "Senior Frontend Engineer", discipline: "Frontend", location: "Buenos Aires", country: "Argentina", yearsExperience: 8, languages: ["Spanish", "English"],
    summary: "Builds design systems and accessible web products.", topSkills: ["React", "Next.js", "Design systems"], journey: [], certifications: [] },
  { id: "camila", name: "Camila Duarte", headline: "QA Automation Lead", discipline: "Quality", location: "Bogotá", country: "Colombia", yearsExperience: 10, languages: ["Spanish", "English"],
    summary: "Leads test strategy and automation for web and mobile.", topSkills: ["Appium", "Playwright", "Test strategy"], journey: [],
    certifications: [{ name: "ISTQB Advanced Test Manager", date: "Nov 2026" }] },
  { id: "daniel", name: "Daniel Okafor", headline: "Staff Backend Engineer", discipline: "Backend", location: "Bogotá", country: "Colombia", yearsExperience: 12, languages: ["English", "Spanish"],
    summary: "Backend lead for high-throughput payment systems.", topSkills: ["Go", "PostgreSQL", "Event-driven"], journey: [], certifications: [] },
  { id: "mateo", name: "Mateo Silva", headline: "Full-stack Engineer", discipline: "Backend", location: "Mexico City", country: "Mexico", yearsExperience: 4, languages: ["Spanish", "English"],
    summary: "Full-stack engineer across Node.js and .NET with React.", topSkills: ["Node.js", "React", ".NET"], journey: [], certifications: [] },
  { id: "valentina", name: "Valentina Rojas", headline: "ML Engineer", discipline: "AI", location: "Santiago", country: "Chile", yearsExperience: 6, languages: ["Spanish", "English"],
    summary: "Builds forecasting models and the pipelines that run them.", topSkills: ["PyTorch", "MLOps", "Vertex AI"], journey: [], certifications: [] },
  { id: "marcus", name: "Marcus Chen", headline: "Solutions Architect", discipline: "Architecture", location: "Toronto", country: "Canada", yearsExperience: 14, languages: ["English"],
    summary: "Designs cloud migrations and platform architectures.", topSkills: ["AWS", "Kubernetes", "Terraform"], journey: [], certifications: [] },
  { id: "priya", name: "Priya Nair", headline: "Data Engineer", discipline: "Data", location: "Lisbon", country: "Portugal", yearsExperience: 7, languages: ["English", "Portuguese"],
    summary: "Builds analytics platforms on modern cloud warehouses.", topSkills: ["Snowflake", "dbt", "Spark"], journey: [], certifications: [] },
  { id: "tomas", name: "Tomás Herrera", headline: "DevOps Engineer", discipline: "Cloud", location: "Lima", country: "Peru", yearsExperience: 7, languages: ["Spanish", "English"],
    summary: "Platform engineer for regulated cloud environments.", topSkills: ["Azure", "Terraform", "Kubernetes"], journey: [], certifications: [] },
];

type Ev = [capabilityId: string, label: string, level: SkillEvidence["level"], detail: string, verification?: SkillEvidence["verification"]];
/**
 * Fictional verification states, assigned consistently:
 *  - professional work was confirmed by a delivery lead → "verified" (stamped "Delivery lead review", Nov 2026);
 *  - certifications ("Certified …") are verified against the certificate;
 *  - everything else (independent projects, courses, growth areas) is "self_reported" unless stated otherwise.
 * A row can override the default with a 5th tuple element (used once, for a "pending" verification request).
 */
const ev = (personId: string, rows: Ev[]): SkillEvidence[] =>
  rows.map(([capabilityId, label, level, detail, explicit], i) => {
    const certified = level === "training" && /certified/i.test(detail);
    const verification: SkillEvidence["verification"] = explicit ?? (level === "professional" || certified ? "verified" : "self_reported");
    return {
      id: `${personId}-ev-${i + 1}`, personId, capabilityId, label, level, detail, verification,
      ...(verification === "verified" ? { verifiedBy: certified ? "Certificate on file" : "Delivery lead review", verifiedOn: "2026-11" } : {}),
    };
  });

export const evidence: SkillEvidence[] = [
  ...ev("ana", [
    ["react-native", "React Native", "professional", "5 projects · lead on Meridian Health"],
    ["ios", "Swift / SwiftUI", "professional", "3 projects · HealthKit native module"],
    ["offline-first", "Offline-first sync", "professional", "2 projects · Meridian Health sync layer"],
    ["healthkit", "HealthKit", "professional", "1 project"],
    ["kmp", "Kotlin Multiplatform", "independent", "Independent, 2026"],
    ["typescript", "TypeScript", "professional", "6 projects"],
    ["graphql", "GraphQL", "professional", "3 projects"],
    ["accessibility", "Accessibility · WCAG 2.2", "professional", "4 projects · WCAG 2.2 AA on Meridian Health"],
    ["aws", "AWS Developer", "training", "Certified 2024"],
    ["ondevice-ml", "On-device text recognition", "professional", "Helix Insurance"],
    ["llm-apps", "LLM visit-notes prototype", "independent", "2026"],
    ["rag", "RAG applications", "training", "Course, Sep 2026"],
    ["llm-apps", "LLM on mobile", "emerging", "Emerging"],
  ]),
  ...ev("lucia", [
    ["llm-apps", "LLM applications", "professional", "3 client projects"],
    ["rag", "RAG systems", "professional", "Helix claims assistant"],
    ["aws", "AWS Bedrock", "professional", "Helix claims assistant"],
    ["python", "Python", "professional", "7 years"],
    ["llm-apps", "LangGraph", "independent", "Independent project, 2026"],
    ["nodejs", "Node.js", "training", "One project; mostly Python"],
  ]),
  ...ev("javier", [
    ["ios", "Swift / SwiftUI", "professional", "4 projects · 6 years"],
    ["widgetkit", "WidgetKit, Live Activities", "professional", "Meridian Health"],
    ["accessibility", "Accessibility", "professional", "VoiceOver audits on Meridian Health"],
    ["react-native", "React Native", "training", "Internal training, 2026"],
    ["graphql", "GraphQL", "training", "Consumed APIs on Meridian Health"],
  ]),
  ...ev("ethan", [
    ["react-native", "React Native", "professional", "2 projects · 3 years"],
    ["android", "Kotlin / Jetpack Compose", "professional", "Lumen Retail app"],
    ["typescript", "TypeScript", "professional", "3 projects"],
    ["graphql", "GraphQL", "professional", "Client caching layer"],
    ["accessibility", "Accessibility", "training", "TalkBack basics, self-reported"],
  ]),
  ...ev("sofia", [
    ["design-systems", "Design systems", "professional", "2 enterprise libraries"],
    ["nextjs", "Next.js", "professional", "Helix claims portal"],
    ["react", "React", "professional", "7 projects"],
    ["typescript", "TypeScript", "professional", "7 projects"],
    ["accessibility", "Accessibility", "professional", "Accessible design systems"],
    ["react-native", "React Native", "training", "Training course, 2025"],
    ["graphql", "GraphQL", "training", "One project, client side"],
  ]),
  ...ev("camila", [
    ["appium", "Appium", "professional", "Mobile automation on 3 apps"],
    ["playwright", "Playwright", "professional", "Helix claims portal"],
    ["test-strategy", "Test strategy", "professional", "ISTQB Advanced · certified Nov 2026"],
  ]),
  ...ev("daniel", [
    ["go", "Go", "professional", "4 projects · 7 years"],
    ["event-driven", "Event-driven architecture", "professional", "Atlas Payments ledger"],
    ["graphql", "GraphQL", "professional", "GraphQL APIs in Go, Atlas Payments"],
    ["postgresql", "PostgreSQL", "professional", "Atlas Payments"],
    ["nodejs", "Node.js", "training", "Short course; works mainly in Go"],
    ["aws", "AWS", "training", "Training"],
  ]),
  ...ev("mateo", [
    ["nodejs", "Node.js", "professional", "3 projects · Northwind APIs"],
    ["typescript", "TypeScript", "professional", "3 projects"],
    ["graphql", "GraphQL", "professional", "Northwind APIs"],
    ["react", "React", "professional", "Northwind dispatch console"],
    ["dotnet", ".NET", "professional", "2 projects"],
    ["react-native", "React Native", "independent", "Independent project", "pending"],
  ]),
  ...ev("valentina", [
    ["forecasting", "Forecasting", "professional", "Orbit Energy"],
    ["mlops", "MLOps", "professional", "Vertex AI pipelines"],
    ["pytorch", "PyTorch", "professional", "Orbit Energy models"],
    ["llm-apps", "LLM applications", "training", "LLM course in progress"],
  ]),
  ...ev("marcus", [
    ["aws", "AWS", "professional", "6 migrations"],
    ["microservices", "Microservices", "professional", "Northwind modernization"],
    ["terraform", "Terraform", "professional", "Northwind modernization"],
    ["kubernetes", "Kubernetes", "professional", "3 platforms"],
    ["cloud-migration", "Cloud migration", "professional", "6 migrations"],
  ]),
  ...ev("priya", [
    ["snowflake", "Snowflake", "professional", "3 platform builds"],
    ["dbt", "dbt", "professional", "Lumen Retail analytics"],
    ["spark", "Spark", "professional", "2 projects"],
  ]),
  ...ev("tomas", [
    ["terraform", "Terraform", "professional", "5 projects"],
    ["azure", "Azure", "professional", "Atlas Payments landing zone"],
    ["kubernetes", "Kubernetes", "professional", "Atlas Payments"],
    ["aws", "AWS", "training", "Azure mainly"],
  ]),
];

type Pj = Omit<ProjectExperience, "personId" | "id"> & { id?: string };
const pj = (personId: string, rows: Pj[]): ProjectExperience[] =>
  rows.map((r, i) => ({ ...r, id: r.id ?? `${personId}-pj-${i + 1}`, personId }));

export const projects: ProjectExperience[] = [
  ...pj("ana", [
    { id: "meridian", period: "2025 – 2026", client: "Meridian Health", clientCategory: "Healthcare client", role: "Mobile lead", title: "A companion app patients trust offline",
      summary: "React Native app with native iOS modules for appointment prep, reminders and secure messaging.", tags: ["React Native", "Swift", "HealthKit"],
      highlights: ["Designed the offline-first sync layer with conflict resolution", "Built the HealthKit native module and permission flows", "Led accessibility to WCAG 2.2 AA with VoiceOver audits"],
      verification: "verified", verifiedBy: "Rafael Ortiz, delivery lead", verifiedOn: "2026-11" },
    { id: "helix", period: "2023 – 2024", client: "Helix Insurance", clientCategory: "Insurance client", role: "Senior mobile engineer", title: "Claims captured in seconds, on device",
      summary: "Claim submission with on-device document capture and text recognition, on iOS and Android.", tags: ["React Native", "Vision", "TypeScript"],
      highlights: ["Implemented on-device text recognition for policy documents", "Created a modular monorepo with shared native modules", "Automated releases with Fastlane"],
      verification: "verified", verifiedBy: "Camila Duarte, QA lead", verifiedOn: "2024" },
    { id: "oss", period: "2024 – now", client: "Open source", role: "Author", title: "rn-offline-queue",
      summary: "A small React Native library for queueing requests offline, extracted from client patterns.", tags: ["React Native", "TypeScript"],
      highlights: ["Published and maintained publicly", "Used as reference in two internal projects"], verification: "self_reported" },
  ]),
  ...pj("lucia", [
    { period: "2026", client: "Helix Insurance", clientCategory: "Insurance client", role: "AI engineer", title: "Claims assistant with retrieval", summary: "Retrieval-augmented assistant that answers policy questions for claims handlers.", tags: ["LLM apps", "RAG", "AWS Bedrock"], highlights: ["Built retrieval and evaluation pipelines", "Added guardrails and human handoff"], verification: "verified", verifiedBy: "Rafael Ortiz, delivery lead" },
    { period: "2025", client: "Orbit Energy", clientCategory: "Energy client", role: "AI engineer", title: "Field operations copilot", summary: "Copilot that drafts maintenance reports from technician notes.", tags: ["LLM apps", "Python"], highlights: ["Prompt and evaluation design"], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" },
  ]),
  ...pj("javier", [
    { period: "2025 – 2026", client: "Meridian Health", clientCategory: "Healthcare client", role: "iOS engineer", title: "Native modules for a patient companion app", summary: "Widgets, Live Activities and native iOS modules for the Meridian Health companion app.", tags: ["Swift", "WidgetKit"], highlights: ["Shipped widgets and Live Activities", "Ran VoiceOver audits"], verification: "verified", verifiedBy: "Rafael Ortiz, delivery lead" },
    { period: "2023", client: "Orbit Energy", clientCategory: "Energy client", role: "iOS engineer", title: "Field app for technicians", summary: "Native iOS field app for inspections.", tags: ["Swift"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" },
  ]),
  ...pj("ethan", [
    { period: "2025 – 2026", client: "Lumen Retail", clientCategory: "Retail client", role: "Android engineer", title: "Commerce app", summary: "Android and React Native commerce app with a GraphQL client caching layer.", tags: ["Kotlin", "React Native", "GraphQL"], highlights: ["Built the GraphQL client caching layer"], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" },
    { period: "2023", client: "Northwind Logistics", clientCategory: "Logistics client", role: "Mobile engineer", title: "Driver app", summary: "React Native driver app.", tags: ["React Native"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" },
  ]),
  ...pj("sofia", [{ period: "2024 – 2026", client: "Helix Insurance", clientCategory: "Insurance client", role: "Senior frontend engineer", title: "Claims portal and design system", summary: "Accessible claims portal built on a shared design system.", tags: ["Next.js", "Design systems"], highlights: [], verification: "verified", verifiedBy: "Rafael Ortiz, delivery lead" }]),
  ...pj("camila", [{ period: "2024 – 2026", client: "Helix Insurance", clientCategory: "Insurance client", role: "QA automation lead", title: "Test strategy for web and mobile", summary: "Appium and Playwright automation across the claims products.", tags: ["Appium", "Playwright"], highlights: [], verification: "verified", verifiedBy: "Rafael Ortiz, delivery lead" }]),
  ...pj("daniel", [{ period: "2024 – 2027", client: "Atlas Payments", clientCategory: "Payments client", role: "Staff backend engineer", title: "Event-driven payments ledger", summary: "High-throughput ledger in Go with GraphQL APIs.", tags: ["Go", "PostgreSQL"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" }]),
  ...pj("mateo", [{ period: "2024 – 2027", client: "Northwind Logistics", clientCategory: "Logistics client", role: "Full-stack engineer", title: "Logistics APIs and dispatch console", summary: "Node.js service design and React dispatch console.", tags: ["Node.js", "GraphQL", "React"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" }]),
  ...pj("valentina", [{ period: "2025 – 2027", client: "Orbit Energy", clientCategory: "Energy client", role: "ML engineer", title: "Demand forecasting", summary: "Forecasting models and Vertex AI pipelines.", tags: ["PyTorch", "MLOps"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" }]),
  ...pj("marcus", [{ period: "2024 – 2027", client: "Northwind Logistics", clientCategory: "Logistics client", role: "Solutions architect", title: "Platform modernization", summary: "Cloud migration and microservices platform design.", tags: ["AWS", "Terraform"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" }]),
  ...pj("priya", [{ period: "2025 – 2027", client: "Lumen Retail", clientCategory: "Retail client", role: "Data engineer", title: "Analytics platform", summary: "Snowflake and dbt analytics platform.", tags: ["Snowflake", "dbt"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" }]),
  ...pj("tomas", [{ period: "2024 – 2027", client: "Atlas Payments", clientCategory: "Payments client", role: "DevOps engineer", title: "Regulated landing zone", summary: "Azure landing zone and Terraform modules for a regulated environment.", tags: ["Azure", "Terraform"], highlights: [], verification: "verified", verifiedBy: "Inés Vidal, delivery lead" }]),
];

const av = (personId: string, availableFrom: string, status: Availability["status"], currentProject: string | null, currentProjectEnds: string | null, deliveryLead: string | null, proposedFor: Availability["proposedFor"] = null): Availability =>
  ({ personId, availableFrom, status, currentProject, currentProjectEnds, deliveryLead, proposedFor });

export const availability: Availability[] = [
  av("ana", "2027-01-05", "confirmed", "Meridian Health", "2026-12-19", "Rafael Ortiz"),
  av("javier", "2027-01-05", "confirmed", "Meridian Health", "2026-12-19", "Rafael Ortiz"),
  av("ethan", "2027-01-19", "confirmed", "Lumen Retail", "2027-01-16", "Inés Vidal"),
  av("sofia", "2026-12-15", "confirmed", "Helix Insurance", "2026-12-12", "Rafael Ortiz"),
  av("camila", "2026-12-08", "confirmed", "Helix Insurance", "2026-12-05", "Rafael Ortiz", { opportunityId: "vela", from: "2027-01-12" }),
  av("daniel", "2027-02-02", "pending", "Atlas Payments", "2027-01-30", "Inés Vidal"),
  av("mateo", "2027-02-02", "pending", "Northwind Logistics", "2027-01-30", "Inés Vidal"),
  av("lucia", "2026-11-24", "confirmed", null, null, "Rafael Ortiz", { opportunityId: "vela", from: "2027-01-12" }),
  av("valentina", "2027-02-02", "confirmed", "Orbit Energy", "2027-01-30", "Inés Vidal"),
  av("marcus", "2027-02-02", "pending", "Northwind Logistics", "2027-01-30", "Inés Vidal"),
  av("priya", "2027-02-16", "pending", "Lumen Retail", "2027-02-13", "Inés Vidal"),
  av("tomas", "2027-03-02", "pending", "Atlas Payments", "2027-02-27", "Inés Vidal"),
];

export const careerInterests: CareerInterests[] = [
  // Private by default: only what Ana chose to share is visible to staffing. The rest (career goals, learning interests) stays hers.
  { personId: "ana", interests: { "Applied AI in mobile": true, "Technical leadership": true, Healthcare: true, Fintech: true, Mentoring: true, "Native iOS depth": false, "Client discovery": false }, shared: ["Applied AI in mobile"] },
];

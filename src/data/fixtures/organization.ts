/**
 * FICTIONAL DEMO DATA — opportunities, demo users and notifications.
 */
import type { AppUser, Notification, Opportunity } from "@/domain/schemas";

export const opportunities: Opportunity[] = [
  {
    id: "vela", client: "Vela Bank", clientInitials: "VB", industry: "Financial services", name: "AI-assisted onboarding",
    short: "A conversational way to open an account in the bank’s app.",
    description: "A conversational onboarding experience inside the Vela Bank app that helps new customers open accounts and understand products, with human handoff.",
    status: "Staffing", kickoff: "2027-01-12", durationMonths: 6, deliveryLead: "Rafael Ortiz", deliveryLeadId: "u-rafael",
    capabilities: ["LLM apps", "React Native", "Node.js", "Appium"],
    interestNote: "1 engineer has expressed interest in the mobile role.",
    roles: [
      { id: "vela-ai", title: "AI Engineer", capabilities: ["LLM apps", "RAG", "Python"], proposedPersonId: "lucia" },
      { id: "vela-mobile", title: "Senior Mobile Engineer", capabilities: ["React Native", "TypeScript", "Accessibility"], proposedPersonId: null },
      { id: "vela-backend", title: "Backend Engineer", capabilities: ["Node.js or Go", "PostgreSQL"], proposedPersonId: null },
      { id: "vela-qa", title: "QA Automation", capabilities: ["Appium", "Playwright"], proposedPersonId: "camila" },
    ],
  },
  {
    id: "cobalt", client: "Cobalt Mobility", clientInitials: "CM", industry: "Transportation", name: "Fleet driver app rebuild",
    short: "Native apps for routes and proof of delivery, built for low coverage.",
    description: "Native iOS and Android rebuild of the driver app for route planning, proof of delivery and offline operation.",
    status: "Open", kickoff: "2027-01-19", durationMonths: 9, deliveryLead: "Inés Vidal", deliveryLeadId: "u-ines",
    capabilities: ["Swift", "Kotlin", "Mobile architecture"],
    interestNote: "Visible to engineers in their personal workspace.",
    roles: [
      { id: "cobalt-ios", title: "iOS Engineer", capabilities: ["Swift", "SwiftUI", "Offline storage"], proposedPersonId: null },
      { id: "cobalt-android", title: "Android Engineer", capabilities: ["Kotlin", "Jetpack Compose"], proposedPersonId: null },
      { id: "cobalt-lead", title: "Mobile Tech Lead", capabilities: ["Mobile architecture", "Mentoring"], proposedPersonId: null },
    ],
  },
  {
    id: "terra", client: "Terra Foods", clientInitials: "TF", industry: "Consumer goods", name: "Snowflake data platform",
    short: "One governed home for sales, supply and marketing data.",
    description: "Consolidation of sales, supply and marketing data into a governed Snowflake platform with dbt models.",
    status: "Open", kickoff: "2027-02-09", durationMonths: 5, deliveryLead: "Rafael Ortiz", deliveryLeadId: "u-rafael",
    capabilities: ["Snowflake", "dbt", "Airflow", "AWS"],
    interestNote: "No expressions of interest yet.",
    roles: [
      { id: "terra-de1", title: "Data Engineer", capabilities: ["Snowflake", "dbt", "Airflow"], proposedPersonId: null },
      { id: "terra-de2", title: "Data Engineer", capabilities: ["Snowflake", "dbt", "Python"], proposedPersonId: null },
      { id: "terra-cloud", title: "Cloud Engineer", capabilities: ["AWS", "Terraform"], proposedPersonId: null },
    ],
  },
  {
    id: "nimbus", client: "Nimbus Health", clientInitials: "NH", industry: "Healthcare", name: "AWS cloud migration",
    short: "Moving clinical scheduling to the cloud, safely and in stages.",
    description: "Migration of clinical scheduling and billing systems to AWS with compliance controls and staged cut-over.",
    status: "Upcoming", kickoff: "2027-03-02", durationMonths: 8, deliveryLead: "Inés Vidal", deliveryLeadId: "u-ines",
    capabilities: ["AWS", "Terraform", "Kubernetes"],
    interestNote: "Opens to expressions of interest on Dec 15.",
    roles: [
      { id: "nimbus-arch", title: "Solutions Architect", capabilities: ["AWS", "Migration planning"], proposedPersonId: null },
      { id: "nimbus-devops", title: "DevOps Engineer", capabilities: ["Terraform", "Kubernetes"], proposedPersonId: null },
    ],
  },
];

/** Demo personas. Replaced by Supabase Auth users + a `profiles` table in phase 2. */
export const users: AppUser[] = [
  { id: "u-laura", name: "Laura Gómez", title: "Staffing Lead", role: "staffing_lead", personId: null, portraitId: "laura" },
  { id: "u-ana", name: "Ana Ruiz", title: "Senior Mobile Engineer", role: "engineer", personId: "ana", portraitId: "ana" },
  { id: "u-rafael", name: "Rafael Ortiz", title: "Delivery Lead", role: "delivery_lead", personId: null, portraitId: "rafael" },
  { id: "u-ines", name: "Inés Vidal", title: "Delivery Lead", role: "delivery_lead", personId: null, portraitId: "ines" },
  { id: "u-admin", name: "Admin Demo", title: "Administrator", role: "admin", personId: null, portraitId: "admin" },
];

export const notifications: Notification[] = [
  { id: "n1", audience: "staffing_lead", actorPersonId: "daniel", actorName: "Daniel Okafor", text: "availability from Feb 2 is pending confirmation", when: "1 hour ago", href: "/planning" },
  { id: "n2", audience: "staffing_lead", actorPersonId: "lucia", actorName: "Lucía Fernández", text: "updated her Talent Passport", when: "Yesterday", href: "/people/lucia" },
  { id: "n3", audience: "staffing_lead", actorPersonId: "ana", actorName: "Ana Ruiz", text: "shared interest in Vela Bank", when: "Yesterday", href: "/opportunities?open=vela" },
  { id: "n5", audience: "delivery_lead", actorPersonId: "laura", actorName: "Laura Gómez", text: "sent a proposal for your review", when: "Today", href: "/opportunities" },
  { id: "n4", audience: "engineer", actorPersonId: "laura", actorName: "Laura Gómez", text: "viewed your passport for a mobile team", when: "Yesterday", href: "/me/passport" },
];

/** The fixed "today" of the demo dataset. All relative dates are computed from it. */
export const DEMO_TODAY = "2026-11-24";

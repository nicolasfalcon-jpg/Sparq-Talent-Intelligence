import "server-only";
import { getRepositories } from "@/data/repositories";
import { dayAndMonth, formatWeekdayDate } from "@/domain/dates";
import { describeAvailability, freeWithin, seatCounts, seatsLabel } from "@/domain/rules";

/**
 * Home view-model. Every number is computed from the repository (no hard-coded snapshot),
 * so Home stays consistent with People, Opportunities and the passport.
 */
export async function getHomeView() {
  const repos = getRepositories();
  const today = repos.clock.today();
  const [people, opportunities] = await Promise.all([repos.talent.listPeople(), repos.opportunities.list()]);

  const free60 = freeWithin(people, today, 60);
  const openSeats = opportunities.reduce((n, o) => n + seatCounts(o).open, 0);

  return {
    dateLabel: formatWeekdayDate(today),
    stats: [
      { value: String(opportunities.length), label: "Opportunities", href: "/opportunities" },
      { value: String(openSeats), label: "Open seats", href: "/opportunities" },
      { value: String(free60.length), label: "Free in 60 days", href: "/planning" },
    ],
    teams: [...opportunities].sort((a, b) => a.kickoff.localeCompare(b.kickoff)).map((o) => ({
      id: o.id, client: o.client, name: o.name, ...dayAndMonth(o.kickoff),
      // Proposed seats first, then open seats (as in V4.2).
      seats: o.roles.map((r) => ({ id: r.id, personId: r.proposedPersonId })).sort((a, b) => Number(!!b.personId) - Number(!!a.personId)),
      seatsLabel: seatsLabel(o),
    })),
    ready: free60.slice(0, 5).map((r) => ({
      id: r.person.id, name: r.person.name, headline: r.person.headline, when: describeAvailability(r.availability, today).compact,
    })),
  };
}

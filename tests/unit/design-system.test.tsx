import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Portrait } from "@/design-system/Portrait";
import { EvidenceLegend, Pill, SkillChip } from "@/design-system/primitives";

describe("design system", () => {
  it("portraits are labelled illustrations of fictional people", () => {
    render(<Portrait who="ana" size={40} />);
    expect(screen.getByRole("img", { name: "Illustrated portrait of Ana Ruiz" })).toBeInTheDocument();
  });
  it("decorative portraits are hidden from assistive tech", () => {
    const { container } = render(<Portrait who="ana" decorative />);
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("pressed pills expose aria-pressed and switch to ink", () => {
    render(<Pill pressed>Mobile</Pill>);
    const b = screen.getByRole("button", { name: "Mobile" });
    expect(b).toHaveAttribute("aria-pressed", "true");
    expect(b.className).toContain("bg-ink");
  });
  it("the evidence legend names all four levels", () => {
    render(<EvidenceLegend />);
    for (const l of ["Professional", "Independent", "Training", "Emerging"]) expect(screen.getByText(l)).toBeInTheDocument();
  });
  it("skill chips can flag new, self-reported skills", () => {
    render(<SkillChip label="Core ML" level="independent" isNew />);
    expect(screen.getByText("new")).toBeInTheDocument();
  });
});

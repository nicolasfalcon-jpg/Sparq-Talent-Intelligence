import { act, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { AddToCompareButton } from "@/features/people/client";
import { useUi } from "@/lib/ui-store";

/**
 * The compare selection lives in sessionStorage, which the server cannot see. The server HTML (and the first
 * hydration render) must therefore render the control DISABLED; otherwise a 4th person can briefly be added.
 */
describe("compare control and hydration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useUi.setState({ compare: [] });
  });

  it("is disabled in server-rendered HTML", () => {
    expect(renderToString(<AddToCompareButton personId="ana" />)).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("is enabled once the client has mounted and fewer than three people are selected", () => {
    render(<AddToCompareButton personId="ana" />);
    expect(screen.getByRole("button", { name: "Add to compare" })).toBeEnabled();
  });

  it("stays disabled after hydration when three other people are already selected", async () => {
    useUi.setState({ compare: ["javier", "ethan", "sofia"] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(<AddToCompareButton personId="ana" />);
    // Before hydration the server markup is disabled, whatever the store says.
    expect(container.querySelector("button")).toBeDisabled();
    let root!: Root;
    await act(async () => { root = hydrateRoot(container, <AddToCompareButton personId="ana" />); });
    const button = container.querySelector("button")!;
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Compare up to 3 people");
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it("becomes enabled after hydration when there is room", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(<AddToCompareButton personId="ana" />);
    expect(container.querySelector("button")).toBeDisabled();
    let root!: Root;
    await act(async () => { root = hydrateRoot(container, <AddToCompareButton personId="ana" />); });
    expect(container.querySelector("button")).toBeEnabled();
    await act(async () => { root.unmount(); });
    container.remove();
  });
});

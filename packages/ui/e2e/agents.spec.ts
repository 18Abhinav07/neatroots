import { expect, test } from "@playwright/test";
import { open, state } from "./util";

test.describe("coding agents", () => {
  test("explains how to get a coding agent when none is installed", async ({ page }) => {
    // The test server runs with a PATH that has neither claude nor codex on it.
    await open(page, "agents");
    await expect(page.getByText("No coding agent found")).toBeVisible();
  });

  test("lists the other connected coding agents with a way to open them", async ({ page }) => {
    await open(page, "agents");
    await expect(page.getByText("Your other coding agents")).toBeVisible();
    // Connected by the settings test on a repeat run, not yet on the first.
    await expect(page.getByRole("button", { name: "Connect Cursor" }).or(page.getByRole("link", { name: "Open Cursor" }))).toBeVisible();
    await expect(page.getByText(/look at my last run in neatroots/i)).toBeVisible();
  });

  test("opening from a run keeps the run in the URL", async ({ page }) => {
    await open(page, `agents?trace=${state().supportRun}`);
    await expect(page).toHaveURL(/trace=/);
    await expect(page.getByText("Coding agents").first()).toBeVisible();
  });
});

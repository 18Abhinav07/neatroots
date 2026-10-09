import { expect, test } from "@playwright/test";
import { open, state } from "./util";

test.describe("coding agents", () => {
  test("explains how to get a coding agent when none is installed", async ({ page }) => {
    // The test server runs with a PATH that has neither claude nor codex on it.
    await open(page, "agents");
    await expect(page.getByText("No coding agent found")).toBeVisible();
  });

  test("opening from a run keeps the run in the URL", async ({ page }) => {
    await open(page, `agents?trace=${state().supportRun}`);
    await expect(page).toHaveURL(/trace=/);
    await expect(page.getByText("Coding agents").first()).toBeVisible();
  });
});

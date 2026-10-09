import { expect, test } from "@playwright/test";
import { open, state } from "./util";

test.describe("runs list", () => {
  test("lists the seeded runs with their problems", async ({ page }) => {
    await open(page, "runs");
    await expect(page.getByRole("cell", { name: "Is order 1001 ok?" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Write a note on solar batteries" })).toBeVisible();
    await expect(page.getByText(/secret key/i).first()).toBeVisible();
  });

  test("filters by status and by search text", async ({ page }) => {
    await open(page, "runs");
    await page.getByRole("tab", { name: "Failed" }).click();
    await expect(page.getByRole("cell", { name: /Refund invoice 77/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Is order 1001 ok?" })).toHaveCount(0);
    await page.getByRole("tab", { name: "All" }).click();
    await page.getByRole("textbox", { name: /Search/ }).fill("solar");
    await expect(page.getByRole("cell", { name: "Write a note on solar batteries" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Is order 1001 ok?" })).toHaveCount(0);
  });

  test("opens a run from the table", async ({ page }) => {
    await open(page, "runs");
    await page.getByRole("cell", { name: "Is order 1001 ok?" }).click();
    await expect(page).toHaveURL(new RegExp(`#/runs/(${state().supportRun}|${state().secondTurn})|#/runs/[0-9a-f]{32}`));
    await expect(page.getByRole("heading", { name: "Is order 1001 ok?" })).toBeVisible();
  });

  test("a new run shows up live without reloading", async ({ page }) => {
    await open(page, "runs");
    const input = `a run that arrives while you watch ${Date.now()}`;
    await fetch(`${state().url}/v1/trace`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "live", project: "e2e-live", input }) });
    await expect(page.getByRole("cell", { name: input })).toBeVisible();
  });
});

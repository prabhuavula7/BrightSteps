import { expect, test } from "@playwright/test";

test("FactCards session flow works", async ({ page }) => {
  await page.goto("/factcards");

  await page.getByRole("link", { name: "Start Session" }).first().click();
  await expect(page.getByRole("heading", { name: "Session Setup" })).toBeVisible();

  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.getByText("Session Progress:")).toBeVisible();

  await page.getByRole("button", { name: "Paris" }).click();
  await page.getByRole("button", { name: "Check & Next" }).click();

  await page.getByRole("button", { name: "Tokyo" }).click();
  await page.getByRole("button", { name: "Check & Next" }).click();

  await expect(page.getByRole("heading", { name: "Session Complete" })).toBeVisible();
});

test("PicturePhrases session flow works", async ({ page }) => {
  await page.goto("/picturephrases");

  await page.getByRole("link", { name: "Start Session" }).first().click();
  await page.getByRole("button", { name: "Start Session" }).click();

  for (const word of ["the", "cat", "is", "on", "mat"]) {
    await page.getByRole("button", { name: word }).first().click();
  }
  await page.getByRole("button", { name: "Check & Next" }).click();

  for (const word of ["the", "dog", "runs", "in", "park"]) {
    await page.getByRole("button", { name: word }).first().click();
  }
  await page.getByRole("button", { name: "Check & Next" }).click();

  await expect(page.getByRole("heading", { name: "Session Complete" })).toBeVisible();
});

test("Settings persist after refresh", async ({ page }) => {
  await page.goto("/settings");

  const audioToggle = page.getByLabel("Audio enabled");
  await audioToggle.check();
  await page.reload();

  await expect(page.getByLabel("Audio enabled")).toBeChecked();
});

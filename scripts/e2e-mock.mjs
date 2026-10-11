// End-to-end run against the mock Twitch (scripts/mock-twitch.mjs) in headless Chrome.
//
//   npm run mock:twitch &   npm run dev:mock &   npm run e2e:mock
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const url = process.env.E2E_URL ?? "http://127.0.0.1:17440";
const mock = process.env.MOCK_HTTP ?? "http://127.0.0.1:17423";
const out = process.env.E2E_OUT ?? "test-results/e2e";
const chromePath = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
context.on("page", (popup) => popup.close());
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(String(err)));

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${String(err).split("\n")[0]}`);
    await page.screenshot({ path: path.join(out, `fail-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  }
}
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const addChannel = async (name) => {
  const input = page.getByLabel("Channel name or twitch.tv link").first();
  await input.fill(name);
  await input.press("Enter");
};
const mockPost = (p) => fetch(`${mock}${p}`, { method: "POST" });
const rowsWith = (text) => page.locator(".chat-row", { hasText: text });

await page.goto(url);
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();

await step("empty state on first launch", async () => {
  await page.getByText("Nothing on the wall yet").waitFor({ timeout: 10_000 });
  await shot("01-empty");
});

await step("join a channel and read mock chat", async () => {
  await addChannel("geckotown");
  await rowsWith(/Leopard_Lou|TokayTom|CrestedCarl/).first().waitFor({ timeout: 15_000 });
});

await step("reject an invalid channel name", async () => {
  await addChannel("bad name!");
  await page.getByText("doesn't look like a Twitch channel").waitFor({ timeout: 3_000 });
});

await step("join a second channel", async () => {
  await addChannel("lizardlounge");
  await page.getByRole("button", { name: "Open #lizardlounge" }).waitFor();
});

await step("merged view tags every line with its channel", async () => {
  await page.getByRole("radio", { name: /merged/i }).click();
  await page.locator(".chat-row button", { hasText: "#geckotown" }).first().waitFor({ timeout: 10_000 });
  await page.locator(".chat-row button", { hasText: "#lizardlounge" }).first().waitFor({ timeout: 10_000 });
  await shot("02-merged");
});

await step("focused view counts unread on other channels", async () => {
  await page.getByRole("button", { name: "Open #geckotown" }).click();
  await page.waitForTimeout(6_000);
  const unread = await page.locator('[title$="unread"], [title*="mention"]').count();
  if (unread < 1) throw new Error("expected an unread or mention badge on #lizardlounge");
  await shot("03-focused-unread");
});

await step("returning to a channel marks where you left off", async () => {
  await page.getByRole("button", { name: "Open #lizardlounge" }).click();
  await page.waitForTimeout(5_000);
  await page.getByRole("button", { name: "Open #geckotown" }).click();
  await page.getByText("New since you left").waitFor({ timeout: 3_000 });
});

await step("device-code login", async () => {
  await page.getByRole("button", { name: /^Log in$/ }).click();
  await page.getByRole("button", { name: "Get a login code" }).click();
  await page.getByText("GECKO123").waitFor({ timeout: 5_000 });
  await shot("04-login-code");
  await page.getByText("Logged in · can chat").waitFor({ timeout: 15_000 });
});

await step("send a message; Twitch's echo replaces the local copy (with emote)", async () => {
  const input = page.getByLabel("Message #geckotown");
  await input.fill("hello from ChatDeck Kappa");
  await input.press("Enter");
  await rowsWith("hello from ChatDeck").locator('img[alt="Kappa"]').first().waitFor({ timeout: 8_000 });
  await page.waitForTimeout(1_500);
  const copies = await rowsWith("hello from ChatDeck").count();
  if (copies !== 1) throw new Error(`expected 1 copy of the sent message, saw ${copies}`);
  await shot("05-sent");
});

await step("failed sends show Twitch's reason", async () => {
  const input = page.getByLabel("Message #geckotown");
  await input.fill("please fail-me");
  await input.press("Enter");
  await page.getByText("Not sent: Your message was not sent because you are sending messages too quickly.").waitFor({ timeout: 8_000 });
});

await step("unsupported slash commands are explained", async () => {
  const input = page.getByLabel("Message #geckotown");
  await input.fill("/ban someone");
  await input.press("Enter");
  await page.getByText("isn't available here").waitFor({ timeout: 3_000 });
  await input.fill("");
});

await step("/me sends an action", async () => {
  const input = page.getByLabel("Message #geckotown");
  await input.fill("/me licks its eyeball");
  await input.press("Enter");
  await rowsWith("licks its eyeball").first().waitFor({ timeout: 8_000 });
});

await step("merged view: pick a send target, or click a channel tag", async () => {
  await page.getByRole("radio", { name: /merged/i }).click();
  await page.getByLabel("Send to channel").click();
  await page.getByRole("option", { name: "#lizardlounge" }).click();
  const input = page.getByLabel("Message #lizardlounge");
  await input.fill("hello from the merged feed");
  await input.press("Enter");
  await rowsWith("hello from the merged feed").locator("button", { hasText: "#lizardlounge" }).waitFor({ timeout: 8_000 });
  await shot("05b-merged-send");
  await page.locator(".chat-row button", { hasText: "#geckotown" }).first().click();
  await page.getByLabel("Message #geckotown").waitFor({ timeout: 3_000 });
  await page.getByRole("radio", { name: /focused/i }).click();
});

await step("channels, view and login survive a reload", async () => {
  await page.reload();
  await page.getByRole("button", { name: "Open #lizardlounge" }).waitFor({ timeout: 10_000 });
  await page.getByText("Logged in · can chat").waitFor({ timeout: 15_000 });
});

await step("reconnects after the connection drops", async () => {
  await rowsWith(/Leopard_Lou|TokayTom|CrestedCarl/).first().waitFor({ timeout: 15_000 });
  await mockPost("/__drop");
  await page.getByText("Lost the connection to Twitch chat").first().waitFor({ timeout: 8_000 });
  await shot("06-dropped");
  await page.getByText("Reconnected.").first().waitFor({ timeout: 20_000 });
});

await step("refreshes an expired token and keeps chatting", async () => {
  await mockPost("/__expire");
  await mockPost("/__drop");
  await page.getByText("Reconnected.").nth(1).waitFor({ timeout: 25_000 });
  await page.getByText("Logged in · can chat").waitFor({ timeout: 15_000 });
  const input = page.getByLabel("Message #geckotown");
  await input.fill("still here after refresh");
  await input.press("Enter");
  await rowsWith("still here after refresh").first().waitFor({ timeout: 8_000 });
});

await step("gecko skins", async () => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: /Leopard gecko/ }).click();
  const skin = await page.evaluate(() => document.documentElement.dataset.skin);
  if (skin !== "leopard") throw new Error(`skin is ${skin}`);
  await shot("07-settings-leopard");
  await page.getByRole("button", { name: /Shadow gecko/ }).click();
  await page.keyboard.press("Escape");
});

await step("log out falls back to anonymous reading", async () => {
  await page.getByRole("button", { name: "Log out" }).first().click();
  await page.getByText("Anonymous lurker").waitFor({ timeout: 5_000 });
  await page.getByText("You're reading anonymously").waitFor({ timeout: 5_000 });
});

await step("small window layout uses a channel drawer", async () => {
  await page.setViewportSize({ width: 420, height: 760 });
  await page.getByRole("button", { name: "Open channel list" }).click();
  await page.getByRole("button", { name: "Open #lizardlounge" }).last().click();
  await page.getByText("#Lizardlounge").first().waitFor({ timeout: 5_000 });
  await shot("08-small-window");
});

await step("no uncaught errors", async () => {
  if (pageErrors.length) throw new Error(pageErrors.join(" | "));
});

await browser.close();
console.log(failures ? `\n${failures} step(s) failed` : "\nAll steps passed");
process.exit(failures ? 1 : 0);

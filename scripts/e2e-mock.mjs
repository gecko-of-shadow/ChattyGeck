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
  await page.getByText("Nothing in the zoo yet").waitFor({ timeout: 10_000 });
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

await step("grid shows each channel in its own box", async () => {
  await page.getByRole("radio", { name: /grid/i }).click();
  await page.getByRole("region", { name: "#geckotown chat" }).locator(".chat-row").first().waitFor({ timeout: 20_000 });
  await page.getByRole("region", { name: "#lizardlounge chat" }).locator(".chat-row").first().waitFor({ timeout: 20_000 });
  await shot("02-grid");
});

await step("focused view counts unread on other channels", async () => {
  await page.getByRole("button", { name: "Open #geckotown" }).click();
  await mockPost("/__burst?channel=lizardlounge&n=3");
  await page.locator('[title$="unread"]').first().waitFor({ timeout: 5_000 });
  await shot("03-focused-unread");
});

await step("returning to a channel marks where you left off", async () => {
  await page.getByRole("button", { name: "Open #lizardlounge" }).click();
  await mockPost("/__burst?channel=geckotown&n=3");
  await page.waitForTimeout(1_000);
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
  await input.fill("hello from ZooChattr Kappa");
  await input.press("Enter");
  await rowsWith("hello from ZooChattr").locator('img[alt="Kappa"]').first().waitFor({ timeout: 8_000 });
  await page.waitForTimeout(1_500);
  const copies = await rowsWith("hello from ZooChattr").count();
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

await step("7TV, BTTV and FFZ emotes render in chat", async () => {
  await mockPost("/__say?channel=geckotown&text=" + encodeURIComponent("geckoWave peepoHappy LilZ KEKW"));
  const row = page.locator(".chat-row", { has: page.locator('img[alt="LilZ"]') }).last();
  // BTTV's pictures come from its real CDN (not mocked), so offline they fall back to the name.
  for (const name of ["geckoWave", "peepoHappy", "LilZ"]) {
    await row.locator(`img[alt="${name}"]`).first().waitFor({ timeout: 8_000 });
  }
  await shot("05b-third-party-emotes");
});

await step("Tab finishes emote names and cycles the matches", async () => {
  const input = page.getByLabel("Message #geckotown");
  await input.fill("hi geck");
  await input.press("Tab");
  if ((await input.inputValue()) !== "hi geckoPog ") throw new Error(`after Tab: "${await input.inputValue()}"`);
  await page.getByTestId("tab-complete").waitFor({ timeout: 2_000 });
  await input.press("Tab");
  if ((await input.inputValue()) !== "hi geckoHype ") throw new Error(`after 2nd Tab: "${await input.inputValue()}"`);
  await input.press("Shift+Tab");
  if ((await input.inputValue()) !== "hi geckoPog ") throw new Error(`after Shift+Tab: "${await input.inputValue()}"`);
  await shot("05c-tab-complete");
  await input.fill("");
});

await step("emote menu inserts emotes and remembers favourites", async () => {
  const input = page.getByLabel("Message #geckotown");
  await page.getByTestId("emote-picker-button").first().click();
  const picker = page.getByTestId("emote-picker");
  await picker.waitFor({ timeout: 3_000 });
  await picker.locator('[data-emote-tile="geckoWave"]').waitFor({ timeout: 5_000 });
  await shot("05d-emote-menu");
  await picker.getByLabel("Search emotes").fill("catJ");
  await picker.locator('[data-emote-tile="catJAM"]').click();
  await page.waitForTimeout(200);
  if ((await input.inputValue()) !== "catJAM ") throw new Error(`picker inserted "${await input.inputValue()}"`);
  await input.fill("");
  await page.getByTestId("emote-picker-button").first().click();
  await picker.locator('[data-emote-tile="peepoHappy"]').click({ button: "right" });
  await picker.getByRole("tab", { name: /Favourites/ }).click();
  await picker.locator('[data-emote-tile="peepoHappy"]').waitFor({ timeout: 3_000 });
  if (await picker.locator('[data-emote-tile="catJAM"]').count()) throw new Error("non-favourite shown on the favourites tab");
  await shot("05e-favourites");
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden", timeout: 3_000 });
});

await step("deleted messages stay readable, faded and crossed out", async () => {
  const { id } = await (await mockPost("/__say?channel=geckotown&text=" + encodeURIComponent("this one gets removed soon"))).json();
  await rowsWith("this one gets removed soon").last().waitFor({ timeout: 8_000 });
  await mockPost(`/__delete?channel=geckotown&id=${id}`);
  await page.locator(".chat-row.chat-row-deleted", { hasText: "this one gets removed soon" }).waitFor({ timeout: 5_000 });
});

await step("highlight words count as mentions", async () => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  const box = page.locator("#pref-highlight");
  await box.fill("giveaway");
  await box.press("Control+Enter");
  await page.keyboard.press("Escape");
  await mockPost("/__say?channel=geckotown&text=" + encodeURIComponent("big GIVEAWAY tonight folks"));
  await page.locator('.chat-row[data-mention="true"]', { hasText: "GIVEAWAY tonight" }).waitFor({ timeout: 8_000 });
});

await step("text size, emote size and sources apply straight away", async () => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("radio", { name: "Huge" }).click();
  await page.getByRole("radio", { name: "2×" }).click();
  const vars = await page.evaluate(() => {
    const el = document.querySelector(".chat-log");
    return [el?.style.getPropertyValue("--chat-font"), el?.style.getPropertyValue("--emote-scale")];
  });
  if (vars[0] !== "20px" || vars[1] !== "2") throw new Error(`css vars are ${JSON.stringify(vars)}`);
  const px = page.getByLabel("Text size in pixels");
  await px.fill("16");
  await px.press("Enter");
  const font = await page.evaluate(() => document.querySelector(".chat-log")?.style.getPropertyValue("--chat-font"));
  if (font !== "16px") throw new Error(`custom px gave ${font}`);
  await shot("06b-settings-emotes");
  await page.locator('label[for="pref-provider-7tv"]').click();
  await page.keyboard.press("Escape");
  const row = page.locator(".chat-row", { has: page.locator('img[alt="LilZ"]') }).last();
  await row.locator('img[alt="geckoWave"]').waitFor({ state: "detached", timeout: 5_000 });
  await row.locator('img[alt="KEKW"]').waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.locator('label[for="pref-provider-7tv"]').click();
  await page.getByRole("radio", { name: "Medium" }).click();
  await page.getByRole("radio", { name: "1×" }).click();
  await page.keyboard.press("Escape");
  await row.locator('img[alt="geckoWave"]').waitFor({ timeout: 5_000 });
});

await step("settings back up, reset and restore", async () => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  const px = page.getByLabel("Text size in pixels");
  await px.fill("17");
  await px.press("Enter");
  const downloading = page.waitForEvent("download", { timeout: 5_000 });
  await page.getByRole("button", { name: "Back up" }).click();
  const file = await (await downloading).path();
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  if (backup.zoochattr !== 1 || backup.settings.textSize !== 17) throw new Error("backup file looks wrong");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Really reset?" }).click();
  if ((await px.inputValue()) !== "13.5") throw new Error(`reset left text size at ${await px.inputValue()}`);
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByText("Settings restored").waitFor({ timeout: 3_000 });
  if ((await px.inputValue()) !== "17") throw new Error(`restore left text size at ${await px.inputValue()}`);
  await px.fill("13.5");
  await px.press("Enter");
  await page.keyboard.press("Escape");
});

await step("scrolling up pauses the feed; the toe-pad button sticks back to live", async () => {
  const log = page.getByLabel("Chat messages");
  await mockPost("/__burst?channel=geckotown&n=60");
  await page.waitForFunction(() => {
    const el = document.querySelector('[aria-label="Chat messages"]');
    return el && el.scrollHeight > el.clientHeight + 200;
  }, null, { timeout: 15_000 });
  const box = await log.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600);
  const pill = page.getByRole("button", { name: /Stick to live chat/ });
  await pill.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(3_000);
  await shot("05a-paused");
  await pill.click();
  await pill.waitFor({ state: "detached", timeout: 3_000 });
});

await step("grid boxes each have their own message input", async () => {
  await page.getByRole("radio", { name: /grid/i }).click();
  const box = page.getByRole("region", { name: "#lizardlounge chat" });
  const input = box.getByLabel("Message #lizardlounge");
  await input.fill("hello from the lizardlounge box");
  await input.press("Enter");
  await box.locator(".chat-row", { hasText: "hello from the lizardlounge box" }).first().waitFor({ timeout: 8_000 });
  const elsewhere = await page
    .getByRole("region", { name: "#geckotown chat" })
    .locator(".chat-row", { hasText: "hello from the lizardlounge box" })
    .count();
  if (elsewhere) throw new Error("message showed up in the wrong box");
  await shot("05b-grid-send");
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

await step("animal themes", async () => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  for (const [name, id] of [
    ["Penguin", "penguin"],
    ["Sea turtle", "turtle"],
    ["Elephant", "elephant"],
  ]) {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    const skin = await page.evaluate(() => document.documentElement.dataset.skin);
    if (skin !== id) throw new Error(`theme is ${skin}, expected ${id}`);
    await shot(`07-theme-${id}`);
  }
  await page.getByRole("button", { name: /Crested gecko/ }).click();
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

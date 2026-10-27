// End-to-end run against the mock Twitch (scripts/mock-twitch.mjs) in headless Chrome.
//
//   npm run mock:twitch &   npm run dev:mock &   npm run e2e:mock
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const url = process.env.E2E_URL ?? "http://127.0.0.1:17440";
const mock = process.env.MOCK_HTTP ?? "http://127.0.0.1:17423";
const out = process.env.E2E_OUT ?? "test-results/e2e";
function defaultChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}
const chromePath = defaultChromePath();
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
// Fail a broken step in seconds, not Playwright's default 30 s per click.
page.setDefaultTimeout(10_000);
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
  let input = page.getByLabel("Channel name or twitch.tv link").first();
  // Once a channel exists, the add box lives behind the "+" tile at the end of the strip.
  if (!(await input.isVisible().catch(() => false))) {
    await page.getByTestId("add-channel-tile").click();
    input = page.getByLabel("Channel name or twitch.tv link").first();
  }
  await input.fill(name);
  await input.press("Enter");
};
/** A channel's round avatar in the top strip (click = open it alone in view 1). */
const avatar = (name) => page.locator(`[data-drag-channel="${name}"]`);
/** View switch: 1 = single, 2/3/4/6/9 = grid. */
const view = (n) => page.getByTestId(`view-${n}`).click();
const showInGrid = async (name) => {
  const show = page.getByRole("button", { name: `Show #${name} in the grid` });
  if (await show.count()) await show.click();
};
/** Opens Settings (gear) at a section unless it is already open there. */
const openSettings = async (section) => {
  const panel = page.getByTestId("settings-panel");
  if (!(await panel.count())) await page.getByTestId("settings-gear").click();
  await panel.waitFor({ timeout: 3_000 });
  if (section) {
    const escaped = section.replace(/[&]/g, "\\$&");
    await panel.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: new RegExp(`^${escaped}`) }).click();
  }
  return panel;
};
const closeSettings = async () => {
  await page.keyboard.press("Escape");
  await page.getByTestId("settings-panel").waitFor({ state: "detached", timeout: 3_000 });
};
/** Logged in and the message box (or its "chat in #x" unlock) is showing instead of the login prompt. */
const canChat = () =>
  page.locator("[data-composer], [data-testid='channel-switch-unlock']").first().waitFor({ timeout: 15_000 });
const mockPost = (p) => fetch(`${mock}${p}`, { method: "POST" });
const rowsWith = (text) => page.locator(".chat-row", { hasText: text });
/** Confirm-before-typing hides the box until this click. No-op when that setting is off. */
const messageBox = async (scope, channel) => {
  const root = scope ?? page;
  const unlock = root.getByRole("button", { name: new RegExp(`chat in #${channel}`, "i") });
  if ((await unlock.count()) && (await unlock.first().isVisible())) await unlock.first().click();
  return root.getByLabel(new RegExp(`^Message #${channel}$`, "i"));
};

await mockPost("/__unfail-emotes");
// Live status is read at login and then every 90 s, so set it up front.
await mockPost("/__live?channel=geckotown&viewers=1234");
await mockPost("/__offline?channel=lizardlounge");
await mockPost("/__new-scopes");
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
  // A pasted VOD address must not become the channel "videos".
  await addChannel("https://www.twitch.tv/videos/1234567890");
  await page.getByText("doesn't look like a Twitch channel").waitFor({ timeout: 3_000 });
});

await step("join a second channel", async () => {
  await addChannel("lizardlounge");
  await avatar("lizardlounge").waitFor();
  // The add box stays open after a bad name; close it.
  await page.keyboard.press("Escape");
});

await step("grid shows each channel in its own box", async () => {
  await view(2);
  await showInGrid("geckotown");
  await showInGrid("lizardlounge");
  await page.getByRole("region", { name: "#geckotown chat" }).locator(".chat-row").first().waitFor({ timeout: 20_000 });
  await page.getByRole("region", { name: "#lizardlounge chat" }).locator(".chat-row").first().waitFor({ timeout: 20_000 });
  // Log panes must have real height — zero-height absolute ChatLog looks like "composer only".
  const logH = await page.getByTestId("grid-log-geckotown").evaluate((el) => el.clientHeight);
  if (logH < 80) throw new Error(`grid log collapsed to ${logH}px`);
  await shot("02-grid");
});

await step("grid still shows messages after visiting focused view", async () => {
  await avatar("geckotown").click();
  await page.getByLabel("Chat messages").locator(".chat-row").first().waitFor({ timeout: 10_000 });
  await view(2);
  await page.getByRole("region", { name: "#geckotown chat" }).locator(".chat-row").first().waitFor({ timeout: 10_000 });
  await page.getByRole("region", { name: "#lizardlounge chat" }).locator(".chat-row").first().waitFor({ timeout: 10_000 });
});

await step("off-grid channel counts unread while the grid is showing", async () => {
  await view(2);
  const box = page.getByRole("region", { name: "#geckotown chat" });
  await box.getByRole("button", { name: "Options for #geckotown" }).click();
  await page.getByRole("menuitem", { name: "Hide from grid" }).click();
  await mockPost("/__burst?channel=geckotown&n=2");
  await page.locator('[data-drag-channel="geckotown"][aria-label*="unread"]').waitFor({ timeout: 5_000 });
  await showInGrid("geckotown");
  await page.getByRole("region", { name: "#geckotown chat" }).locator(".chat-row").first().waitFor({ timeout: 10_000 });
});

await step("focused view counts unread on other channels", async () => {
  await avatar("geckotown").click();
  await mockPost("/__burst?channel=lizardlounge&n=3");
  await page.locator('[data-drag-channel="lizardlounge"][aria-label*="unread"]').waitFor({ timeout: 5_000 });
  await shot("03-focused-unread");
});

await step("returning to a channel marks where you left off", async () => {
  await avatar("lizardlounge").click();
  await mockPost("/__burst?channel=geckotown&n=3");
  await page.waitForTimeout(1_000);
  await avatar("geckotown").click();
  await page.getByText("New since you left").waitFor({ timeout: 3_000 });
});

await step("device-code login", async () => {
  await page.getByRole("button", { name: "Log in with Twitch" }).first().click();
  await page.getByRole("button", { name: "Get a login code" }).click();
  await page.getByText("GECKO123").waitFor({ timeout: 5_000 });
  await shot("04-login-code");
  await canChat();
});

await step("Twitch follows join the strip with live dots and viewer counts", async () => {
  // Followed on mock Twitch but never added in the app: shown, not joined.
  const follow = page.locator('[data-drag-channel="chameleoncafe"]');
  await follow.waitFor({ timeout: 10_000 });
  if (!/chat not open/.test((await follow.getAttribute("aria-label")) ?? "")) throw new Error("follow-only avatar label");
  await page.locator('[data-strip-channel="geckotown"] [data-live-dot]').waitFor({ timeout: 10_000 });
  const label = (await avatar("geckotown").getAttribute("aria-label")) ?? "";
  if (!label.includes("live, 1,234 watching")) throw new Error(`live label: "${label}"`);
  if (await page.locator('[data-strip-channel="lizardlounge"] [data-live-dot]').count()) throw new Error("offline channel has a live dot");
  await page.getByTestId("single-status").filter({ hasText: "1,234 watching" }).waitFor({ timeout: 5_000 });
  const channels = await page.evaluate(() => JSON.parse(localStorage.getItem("zoochattr.settings") || "{}").channels);
  if (channels.includes("chameleoncafe")) throw new Error("a follow was joined without asking");
  await shot("04c-follows");
});

await step("channel switch blocks send until unlock", async () => {
  await page.getByTestId("channel-switch-ack").waitFor({ timeout: 5_000 });
  const unlock = page.getByTestId("channel-switch-unlock");
  if ((await unlock.innerText()).trim() !== "chat in #geckotown") {
    throw new Error(`unlock button text: "${await unlock.innerText()}"`);
  }
  await shot("04b-channel-ack");
  await unlock.click();
  await page.getByLabel("Message #geckotown").waitFor({ timeout: 3_000 });
});

await step("send a message; Twitch's echo replaces the local copy (with emote)", async () => {
  const input = await messageBox(page, "geckotown");
  await input.fill("hello from ZooChattr Kappa");
  await input.press("Enter");
  await rowsWith("hello from ZooChattr").locator('img[alt="Kappa"]').first().waitFor({ timeout: 8_000 });
  await page.waitForTimeout(1_500);
  const copies = await rowsWith("hello from ZooChattr").count();
  if (copies !== 1) throw new Error(`expected 1 copy of the sent message, saw ${copies}`);
  await shot("05-sent");
});

await step("failed sends show Twitch's reason", async () => {
  const input = await messageBox(page, "geckotown");
  await input.fill("please fail-me");
  await input.press("Enter");
  await page.getByText("Not sent: Your message was not sent because you are sending messages too quickly.").waitFor({ timeout: 8_000 });
});

await step("unsupported slash commands are explained", async () => {
  const input = await messageBox(page, "geckotown");
  await input.fill("/ban someone");
  await input.press("Enter");
  await page.getByText("isn't available here").waitFor({ timeout: 3_000 });
  await input.fill("");
});

await step("/me sends an action", async () => {
  const input = await messageBox(page, "geckotown");
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
  const input = await messageBox(page, "geckotown");
  await input.fill("hi geck");
  await input.press("Tab");
  if ((await input.inputValue()) !== "hi geckoPog ") throw new Error(`after Tab: "${await input.inputValue()}"`);
  const list = page.getByTestId("tab-complete");
  await list.waitFor({ timeout: 2_000 });
  // Pictures must show in the suggestion list (url1x, not a broken 2x-only src).
  const thumbs = list.locator("img");
  if ((await thumbs.count()) < 2) throw new Error("tab-complete list missing emote pictures");
  await thumbs.first().waitFor({ state: "visible", timeout: 3_000 });
  await input.press("Tab");
  if ((await input.inputValue()) !== "hi geckoHype ") throw new Error(`after 2nd Tab: "${await input.inputValue()}"`);
  await input.press("ArrowDown");
  const afterDown = await input.inputValue();
  if (afterDown === "hi geckoHype ") throw new Error("ArrowDown did not move to the next emote");
  await list.waitFor({ timeout: 2_000 });
  await input.press("ArrowUp");
  if ((await input.inputValue()) !== "hi geckoHype ") throw new Error(`after ArrowUp: "${await input.inputValue()}"`);
  await input.press("Shift+Tab");
  if ((await input.inputValue()) !== "hi geckoPog ") throw new Error(`after Shift+Tab: "${await input.inputValue()}"`);
  // Click a suggestion (portaled list must stay interactive).
  await list.getByRole("option", { name: "geckoWave" }).click();
  if ((await input.inputValue()) !== "hi geckoWave ") throw new Error(`after click: "${await input.inputValue()}"`);
  await shot("05c-tab-complete");
  await input.fill("");
});

await step("Enter accepts a tab completion and does not send until the next Enter", async () => {
  await mockPost("/__sent/reset");
  const input = await messageBox(page, "geckotown");
  await input.fill("Kap");
  await input.press("Tab");
  if ((await input.inputValue()) !== "Kappa ") throw new Error(`after Tab: "${await input.inputValue()}"`);
  await input.press("Enter");
  if ((await input.inputValue()) !== "Kappa ") throw new Error(`first Enter changed the box: "${await input.inputValue()}"`);
  await page.getByTestId("tab-complete").waitFor({ state: "hidden", timeout: 2_000 });
  const held = await (await fetch(`${mock}/__sent`)).json();
  if (held.messages?.length) throw new Error(`first Enter sent ${JSON.stringify(held.messages)}`);
  await input.press("Enter");
  await page.waitForTimeout(600);
  const sent = await (await fetch(`${mock}/__sent`)).json();
  const texts = (sent.messages ?? []).map((message) => message.text);
  if (!texts.includes("Kappa")) throw new Error(`second Enter did not send Kappa, saw ${JSON.stringify(texts)}`);
  await input.fill("");

  await mockPost("/__say?channel=geckotown&who=3&text=" + encodeURIComponent("username says hi"));
  await rowsWith("username says hi").first().waitFor({ timeout: 8_000 });
  await mockPost("/__sent/reset");
  await input.fill("@us");
  await input.press("Tab");
  if ((await input.inputValue()) !== "@username ") throw new Error(`mention Tab: "${await input.inputValue()}"`);
  await input.press("Enter");
  if ((await input.inputValue()) !== "@username ") throw new Error(`mention Enter changed the box: "${await input.inputValue()}"`);
  const heldMention = await (await fetch(`${mock}/__sent`)).json();
  if (heldMention.messages?.length) throw new Error(`mention Enter sent ${JSON.stringify(heldMention.messages)}`);
  await input.press("Enter");
  await page.waitForTimeout(600);
  const sentMention = await (await fetch(`${mock}/__sent`)).json();
  const mentionTexts = (sentMention.messages ?? []).map((message) => message.text);
  if (!mentionTexts.includes("@username")) throw new Error(`mention was not sent, saw ${JSON.stringify(mentionTexts)}`);
  await input.fill("");
});

await step("spell check underlines misspellings and skips emotes", async () => {
  const input = await messageBox(page, "geckotown");
  await input.fill("I recieve teh message");
  await page.getByTestId("spell-miss").nth(1).waitFor({ timeout: 10_000 });
  const flagged = await page.getByTestId("spell-miss").allTextContents();
  if (flagged.join(" ") !== "recieve teh" && flagged.join(",") !== "recieve,teh") {
    if (!flagged.includes("recieve") || !flagged.includes("teh")) {
      throw new Error(`underlines: ${JSON.stringify(flagged)}`);
    }
  }
  await input.fill("Kappa geckoPog @username !uptime https://twitch.tv KEKW");
  await page.waitForTimeout(400);
  if (await page.getByTestId("spell-miss").count()) {
    const left = await page.getByTestId("spell-miss").allTextContents();
    throw new Error(`expected no underlines, saw ${JSON.stringify(left)}`);
  }
  await input.fill("");
});

await step("Ctrl+G, Ctrl+K, Ctrl+1, drag swap and strip replace", async () => {
  const backToGecko = async () => {
    await page.keyboard.press("Escape").catch(() => {});
    for (const name of ["lizardlounge", "geckotown"]) await showInGrid(name);
    await avatar("geckotown").click();
    await page.getByLabel("Chat messages").waitFor({ timeout: 5_000 });
  };
  try {
  await view(2);
  const orderOf = () =>
    page.locator("[data-grid-channel]").evaluateAll((els) => els.map((el) => el.getAttribute("data-grid-channel")));
  const before = await orderOf();
  if (before.length < 2) throw new Error(`need two grid boxes, saw ${before.join(",")}`);
  await page.keyboard.press("Control+g");
  await page.getByLabel("Chat messages").waitFor({ timeout: 3_000 });
  await page.getByTestId("chat-grid").waitFor({ state: "hidden", timeout: 3_000 });
  await page.keyboard.press("Control+g");
  await page.getByTestId("chat-grid").waitFor({ timeout: 3_000 });
  if ((await orderOf()).join() !== before.join()) throw new Error(`grid order changed: ${await orderOf()}`);

  const source = page.getByTestId(`grid-header-${before[0]}`);
  const target = page.locator(`[data-grid-channel="${before[1]}"]`);
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  if (!a || !b) throw new Error("missing drag boxes");
  await page.mouse.move(a.x + Math.min(80, a.width * 0.35), a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(80, b.height / 2), { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const swapped = await orderOf();
  if (swapped[0] !== before[1] || swapped[1] !== before[0]) {
    const live = await page.locator("[aria-live='polite']").innerText().catch(() => "");
    throw new Error(`drag did not swap: before ${before.join(",")} after ${swapped.join(",")} live "${live}"`);
  }

  // One shared message box: Ctrl+1 makes the first pane the focused one and puts the caret in the box
  // (or on its "chat in #x" button while Confirm channel before typing is on).
  await page.keyboard.press("Control+1");
  await page.waitForTimeout(200);
  const active = await page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute("data-composer") ?? el?.textContent?.trim() ?? null;
  });
  if (active !== swapped[0] && active !== `chat in #${swapped[0]}`) throw new Error(`Ctrl+1 focused ${active}`);

  await page.keyboard.press("Control+k");
  const quick = page.getByTestId("quick-switch");
  await quick.waitFor({ timeout: 2_000 });
  await quick.fill("liz");
  await quick.press("Enter");
  await page.getByLabel("Chat messages").waitFor({ timeout: 3_000 });
  await page.getByText("#Lizardlounge", { exact: false }).first().waitFor({ timeout: 3_000 });
  await page.keyboard.press("Control+g");
  await page.getByTestId("chat-grid").waitFor({ timeout: 5_000 });

  await page.getByRole("region", { name: "#lizardlounge chat" }).getByRole("button", { name: "Options for #lizardlounge" }).click();
  await page.getByRole("menuitem", { name: "Hide from grid" }).click();
  await page.getByRole("menu").waitFor({ state: "hidden", timeout: 3_000 });
  await page.waitForTimeout(200);
  const sideBox = await avatar("lizardlounge").boundingBox();
  const host = page.locator("[data-grid-channel]").first();
  const hostName = await host.getAttribute("data-grid-channel");
  const hostHeader = page.getByTestId(`grid-header-${hostName}`);
  const hostBox = await hostHeader.boundingBox();
  if (!sideBox || !hostBox || !hostName) throw new Error("missing strip drag target");
  await page.mouse.move(sideBox.x + sideBox.width / 2, sideBox.y + sideBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterDrop = await orderOf();
  if (!afterDrop.includes("lizardlounge")) {
    const mode = await page.evaluate(() => JSON.parse(localStorage.getItem("zoochattr.settings") || "{}").mode);
    throw new Error(`strip drop missed: ${afterDrop.join(",")} (mode ${mode}, from ${JSON.stringify(sideBox)} to ${hostName} ${JSON.stringify(hostBox)})`);
  }
  } finally {
    await backToGecko();
  }
});

await step("emote menu inserts emotes and remembers favourites", async () => {
  const input = await messageBox(page, "geckotown");
  await page.getByTestId("emote-picker-button").first().click();
  const picker = page.getByTestId("emote-picker");
  await picker.waitFor({ timeout: 3_000 });
  await picker.getByRole("tab", { name: "Channel" }).click();
  await picker.locator('[data-emote-tile="geckoWave"]').waitFor({ timeout: 5_000 });
  await shot("05d-emote-menu");
  await picker.getByLabel("Search emotes").fill("catJ");
  await picker.locator('[data-emote-tile="catJAM"]').click();
  await page.waitForTimeout(200);
  if ((await input.inputValue()) !== "catJAM ") throw new Error(`picker inserted "${await input.inputValue()}"`);
  await input.fill("");
  await page.getByTestId("emote-picker-button").first().click();
  await picker.waitFor({ timeout: 3_000 });
  await picker.getByLabel("Search emotes").fill("peepo");
  await picker.locator('[data-emote-tile="peepoHappy"]').click({ button: "right" });
  await picker.getByLabel("Search emotes").fill("");
  await picker.getByRole("tab", { name: "Favourites" }).click();
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
  await openSettings("Chat & mentions");
  const box = page.locator("#pref-highlight");
  await box.fill("giveaway");
  await box.press("Control+Enter");
  await closeSettings();
  await mockPost("/__say?channel=geckotown&text=" + encodeURIComponent("big GIVEAWAY tonight folks"));
  await page.locator('.chat-row[data-mention="true"]', { hasText: "GIVEAWAY tonight" }).waitFor({ timeout: 8_000 });
});

await step("mention sound chimes once per cooldown for any open chat", async () => {
  await openSettings("Chat & mentions");
  await page.locator('label[for="pref-mention-sound"]').click();
  const cooldown = page.getByLabel("Mention sound cooldown in seconds");
  await cooldown.fill("1");
  await cooldown.press("Enter");
  await page.getByRole("button", { name: "Play mention sound" }).click();
  await closeSettings();
  const chimes = () => page.evaluate(() => window.__zoochattrStats().mentionChimes);
  const afterPreview = await chimes();
  if (afterPreview < 1) throw new Error("Play did not start a chime");
  await mockPost("/__say?channel=lizardlounge&text=" + encodeURIComponent("just chatting"));
  await page.waitForTimeout(400);
  if ((await chimes()) !== afterPreview) throw new Error("an ordinary line chimed");
  // Focused on #geckotown; #lizardlounge is still an open chat in the sidebar.
  await mockPost("/__say?channel=lizardlounge&text=" + encodeURIComponent("hey geckotester"));
  await page.waitForFunction((n) => window.__zoochattrStats().mentionChimes > n, afterPreview, { timeout: 8_000 });
  await mockPost("/__say?channel=geckotown&text=" + encodeURIComponent("geckotester again"));
  await page.waitForTimeout(400);
  const held = await chimes();
  if (held !== afterPreview + 1) throw new Error(`cooldown did not hold: ${held} after preview ${afterPreview}`);
  await page.waitForTimeout(1_200);
  await mockPost("/__say?channel=geckotown&text=" + encodeURIComponent("nice take") + "&reply=geckotester");
  await page.locator('.chat-row[data-mention="true"]', { hasText: "nice take" }).waitFor({ timeout: 8_000 });
  await page.waitForFunction((n) => window.__zoochattrStats().mentionChimes > n, held, { timeout: 8_000 });
});

await step("text size, emote size and sources apply straight away", async () => {
  await openSettings("Appearance");
  await page.getByRole("radio", { name: "Huge" }).click();
  await openSettings("Emotes");
  await page.getByRole("radio", { name: "2×" }).click();
  const vars = await page.evaluate(() => {
    const el = document.querySelector(".chat-log");
    return [el?.style.getPropertyValue("--chat-font"), el?.style.getPropertyValue("--emote-scale")];
  });
  if (vars[0] !== "20px" || vars[1] !== "2") throw new Error(`css vars are ${JSON.stringify(vars)}`);
  await openSettings("Appearance");
  const px = page.getByLabel("Text size in pixels");
  await px.fill("16");
  await px.press("Enter");
  const font = await page.evaluate(() => document.querySelector(".chat-log")?.style.getPropertyValue("--chat-font"));
  if (font !== "16px") throw new Error(`custom px gave ${font}`);
  await openSettings("Emotes");
  await shot("06b-settings-emotes");
  await page.locator('label[for="pref-provider-7tv"]').click();
  await closeSettings();
  const row = page.locator(".chat-row", { has: page.locator('img[alt="LilZ"]') }).last();
  await row.locator('img[alt="geckoWave"]').waitFor({ state: "detached", timeout: 5_000 });
  await row.getByText("geckoWave peepoHappy").waitFor({ timeout: 5_000 });
  await row.locator('img[alt="LilZ"]').waitFor({ timeout: 2_000 });
  await openSettings("Emotes");
  await page.locator('label[for="pref-provider-7tv"]').click();
  await page.getByRole("radio", { name: "1×" }).click();
  await openSettings("Appearance");
  await page.getByRole("radio", { name: "Medium" }).click();
  await closeSettings();
  await row.locator('img[alt="geckoWave"]').waitFor({ timeout: 5_000 });
});

await step("settings back up, reset and restore", async () => {
  await openSettings("Appearance");
  const px = page.getByLabel("Text size in pixels");
  const pxIs = (value) =>
    page.waitForFunction((v) => {
      const el = document.querySelector('[aria-label="Text size in pixels"]');
      return el instanceof HTMLInputElement && el.value === v;
    }, value, { timeout: 3_000 });
  await px.fill("17");
  await px.press("Enter");
  await px.blur();
  await openSettings("About & data");
  const downloading = page.waitForEvent("download", { timeout: 5_000 });
  await page.getByRole("button", { name: "Back up" }).click();
  const file = await (await downloading).path();
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  if (backup.zoochattr !== 1 || backup.settings.textSize !== 17) throw new Error("backup file looks wrong");
  const reset = page.getByTestId("settings-reset");
  await reset.scrollIntoViewIfNeeded();
  await reset.click();
  await page.getByRole("button", { name: "Really reset?", exact: true }).waitFor({ timeout: 3_000 });
  await reset.click();
  await page.getByText("Settings reset").waitFor({ timeout: 3_000 });
  await openSettings("Appearance");
  await pxIs("13.5");
  await openSettings("About & data");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByText("Settings restored").waitFor({ timeout: 3_000 });
  await openSettings("Appearance");
  await pxIs("17");
  await px.fill("13.5");
  await px.press("Enter");
  await px.blur();
  await closeSettings();
});

await step("per-channel overrides turn a source off in one channel only", async () => {
  const panel = await openSettings("Per channel");
  await page.getByLabel("Channel for feature overrides").fill("geckotown");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByTestId("channel-override-geckotown").waitFor({ timeout: 3_000 });
  await page.locator('label[for="override-geckotown-7tv"]').click();
  await closeSettings();
  const row = page.locator(".chat-row", { has: page.locator('img[alt="LilZ"]') }).last();
  await row.locator('img[alt="geckoWave"]').waitFor({ state: "detached", timeout: 5_000 });
  await row.getByText("geckoWave").waitFor({ timeout: 5_000 });
  await row.locator('img[alt="LilZ"]').waitFor({ timeout: 2_000 });
  await openSettings("Per channel");
  await page.locator('label[for="override-geckotown-7tv"]').click();
  await page.getByTestId("channel-override-geckotown").getByRole("button", { name: "Remove" }).click();
  await closeSettings();
  await row.locator('img[alt="geckoWave"]').waitFor({ timeout: 5_000 });
});

await step("Problems lists a failed emote download", async () => {
  await mockPost("/__fail-emotes?provider=7tv");
  await page.getByRole("button", { name: "Emotes in #geckotown" }).first().click();
  await page.getByRole("button", { name: "Reload emotes" }).click();
  await page.waitForTimeout(1_000);
  await page.keyboard.press("Escape");
  await openSettings("Emotes");
  const list = page.getByTestId("problems-list");
  await list.waitFor({ timeout: 5_000 });
  await list.getByText(/7TV/).first().waitFor({ timeout: 3_000 });
  await shot("06c-problems");
  await page.getByRole("button", { name: "Clear the list" }).click();
  await page.getByText("No problems so far.").waitFor({ timeout: 3_000 });
  await closeSettings();
  await mockPost("/__unfail-emotes");
  await page.getByRole("button", { name: "Emotes in #geckotown" }).first().click();
  await page.getByRole("button", { name: "Reload emotes" }).click();
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
  // Plain "Back to live chat" on Crested; the gecko-flavoured "Stick to live chat" on other themes.
  const pill = page.getByRole("button", { name: /(Stick|Back) to live chat/ });
  await pill.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(3_000);
  await shot("05a-paused");
  await pill.click();
  await pill.waitFor({ state: "detached", timeout: 3_000 });
});

await step("the shared message box sends to the focused grid pane", async () => {
  await view(2);
  const box = page.getByRole("region", { name: "#lizardlounge chat" });
  // Clicking a pane makes it the focused one; the box then asks to confirm the new channel.
  await page.getByTestId("grid-header-lizardlounge").click();
  const unlock = page.getByTestId("channel-switch-unlock");
  await unlock.waitFor({ timeout: 5_000 });
  if ((await unlock.innerText()).trim() !== "chat in #lizardlounge") {
    throw new Error(`grid unlock text: "${await unlock.innerText()}"`);
  }
  await shot("05b-grid-channel-ack");
  await unlock.click();
  const input = page.getByLabel("Message #lizardlounge");
  await input.fill("hello from the lizardlounge box");
  await input.press("Enter");
  await box.locator(".chat-row", { hasText: "hello from the lizardlounge box" }).first().waitFor({ timeout: 8_000 });
  const elsewhere = await page
    .getByRole("region", { name: "#geckotown chat" })
    .locator(".chat-row", { hasText: "hello from the lizardlounge box" })
    .count();
  if (elsewhere) throw new Error("message showed up in the wrong box");
  // Switching to the other pane locks the box again until confirmed.
  await page.getByTestId("grid-header-geckotown").click();
  await page.getByTestId("channel-switch-ack").waitFor({ timeout: 3_000 });
  await shot("05b-grid-send");
});

await step("grid Tab-complete list stays visible (not clipped by the box)", async () => {
  await page.getByTestId("channel-switch-unlock").click();
  const input = page.getByLabel("Message #geckotown");
  await input.fill("geck");
  await input.press("Tab");
  const list = page.getByTestId("tab-complete");
  await list.waitFor({ state: "visible", timeout: 3_000 });
  const box2 = await list.boundingBox();
  if (!box2 || box2.height < 20) throw new Error("tab-complete clipped or zero-height in grid");
  await list.locator("img").first().waitFor({ state: "visible", timeout: 3_000 });
  await shot("05b2-grid-tab-complete");
  await input.fill("");
  await view(1);
});

await step("history server fills in chat said while ZooChattr was closed, once each", async () => {
  await openSettings();
  await page.getByTestId("settings-search").fill("History server");
  await page.getByLabel("History server address").fill(mock);
  await page.getByLabel("History server read token").fill("mock-read-token");
  await page.getByTestId("history-server-save").click();
  await page.getByTestId("history-server-status").filter({ hasText: "Connected" }).waitFor({ timeout: 5_000 });
  await shot("06d-history-server");
  await closeSettings();

  // Heard live and saved here, and by the history server too: it must not come back twice.
  await mockPost("/__say?channel=geckotown&text=" + encodeURIComponent("said before the restart"));
  await rowsWith("said before the restart").first().waitFor({ timeout: 8_000 });
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForFunction(
    () => (localStorage.getItem("zoochattr.chat.geckotown") ?? "").includes("said before the restart"),
    null,
    { timeout: 5_000 },
  );
  // Only the history server has these.
  await mockPost("/__history?channel=geckotown&n=3&text=" + encodeURIComponent("missed while closed"));
  await page.reload();
  await avatar("geckotown").click();
  await rowsWith("missed while closed 3").first().waitFor({ timeout: 15_000 });
  await page.getByText("Filled in 3 messages from your history server.").waitFor({ timeout: 3_000 });
  for (const text of ["missed while closed 1", "missed while closed 2", "missed while closed 3", "said before the restart"]) {
    const copies = await rowsWith(text).count();
    if (copies !== 1) throw new Error(`expected 1 row with "${text}", saw ${copies}`);
  }
  await shot("06e-history-filled");
});

await step("channels, view and login survive a reload", async () => {
  await page.reload();
  await avatar("lizardlounge").waitFor({ timeout: 10_000 });
  await canChat();
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
  await canChat();
  // Reload cleared the in-memory send ack — confirm the target again before typing.
  const unlock = page.getByTestId("channel-switch-unlock");
  if (await unlock.count()) await unlock.click();
  const input = page.getByLabel("Message #geckotown");
  await input.fill("still here after refresh");
  await input.press("Enter");
  await rowsWith("still here after refresh").first().waitFor({ timeout: 8_000 });
});

await step("animal themes", async () => {
  await openSettings("Appearance");
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
  await closeSettings();
});

await step("appearance themes", async () => {
  await openSettings("Appearance");
  const search = page.getByTestId("settings-search");
  await search.fill("Light");
  await page.getByRole("button", { name: /^Light/ }).click();
  let skin = await page.evaluate(() => document.documentElement.dataset.skin);
  if (skin !== "light") throw new Error(`theme is ${skin}, expected light`);
  await shot("07-theme-light");

  await search.fill("Deuteranopia");
  await page.getByRole("button", { name: /^Deuteranopia/ }).click();
  skin = await page.evaluate(() => document.documentElement.dataset.skin);
  if (skin !== "deuteranopia") throw new Error(`theme is ${skin}, expected deuteranopia`);

  await search.fill("Eye comfort");
  await page.getByRole("button", { name: /^Eye comfort/ }).click();
  skin = await page.evaluate(() => document.documentElement.dataset.skin);
  if (skin !== "eyecomfort") throw new Error(`theme is ${skin}, expected eyecomfort`);
  await shot("07-theme-eyecomfort");

  await search.fill("");
  await page.getByRole("button", { name: /Crested gecko/ }).click();
  await closeSettings();
});

await step("read only hides the message box (Ctrl+Shift+R and Settings)", async () => {
  const boxShown = () => page.locator('input[placeholder*=" to #"]').or(page.getByTestId("channel-switch-unlock")).first();
  await boxShown().waitFor({ timeout: 5_000 });
  await page.keyboard.press("Control+Shift+R");
  await page.getByTestId("composer").waitFor({ state: "detached", timeout: 3_000 });
  if (await page.getByTestId("channel-switch-ack").count()) {
    throw new Error("channel confirm still visible in read only");
  }
  if (await page.locator('input[placeholder*=" to #"]').count()) {
    throw new Error("composer still visible in read only");
  }
  await openSettings();
  await page.getByTestId("settings-search").fill("Read only");
  await page.locator("#pref-read-only").waitFor({ timeout: 3_000 });
  const readOnlySwitch = page.getByRole("switch", { name: /^Read only/ });
  if ((await readOnlySwitch.getAttribute("aria-checked")) !== "true") {
    throw new Error("Settings row doesn't show read only as on");
  }
  await page.locator('label[for="pref-read-only"]').click();
  await page.getByTestId("settings-search").fill("");
  await closeSettings();
  await boxShown().waitFor({ timeout: 5_000 });
  await shot("07-read-only-off");
});

await step("log out falls back to anonymous reading", async () => {
  await openSettings("Account & history");
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByText("Not logged in").waitFor({ timeout: 5_000 });
  await closeSettings();
  await page.getByText("You're reading anonymously").waitFor({ timeout: 5_000 });
  if (await page.locator("[data-live-dot]").count()) throw new Error("live dots shown while logged out");
});

await step("an older login without the follows permission asks to log in again", async () => {
  await mockPost("/__old-scopes");
  try {
    await page.getByRole("button", { name: "Log in with Twitch" }).first().click();
    await page.getByRole("button", { name: "Get a login code" }).click();
    const chip = page.getByTestId("follows-login");
    await chip.waitFor({ timeout: 15_000 });
    if (await page.locator('[data-drag-channel="chameleoncafe"]').count()) throw new Error("follows shown without the permission");
    await shot("07b-follows-relogin");
    await mockPost("/__new-scopes");
    await chip.click();
    await page.getByRole("button", { name: "Get a login code" }).click();
    await chip.waitFor({ state: "detached", timeout: 15_000 });
    await page.locator('[data-drag-channel="chameleoncafe"]').waitFor({ timeout: 10_000 });
  } finally {
    await mockPost("/__new-scopes");
  }
});

await step("small window: the strip still reaches every channel", async () => {
  await page.setViewportSize({ width: 420, height: 760 });
  await avatar("lizardlounge").click();
  await page.getByText("#Lizardlounge").first().waitFor({ timeout: 5_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) throw new Error(`page scrolls sideways by ${overflow}px`);
  await shot("08-small-window");
});

await step("no uncaught errors", async () => {
  if (pageErrors.length) throw new Error(pageErrors.join(" | "));
});

await browser.close();
console.log(failures ? `\n${failures} step(s) failed` : "\nAll steps passed");
process.exit(failures ? 1 : 0);

require("dotenv").config();

const config = {
  // ── Green API credentials ─────────────────────────────────────────────────
  // Get these from https://console.green-api.com after creating an instance
  GREEN_API_ID_INSTANCE: process.env.GREEN_API_ID_INSTANCE || "",
  GREEN_API_TOKEN: process.env.GREEN_API_TOKEN || "",

  // Base URL for the Green API — use the one shown in your console.
  // Usually https://api.greenapi.com but may differ by region/plan.
  GREEN_API_URL: process.env.GREEN_API_URL || "https://api.greenapi.com",

  // ── Rasa ─────────────────────────────────────────────────────────────────
  RASA_WEBHOOK_URL:
    process.env.RASA_WEBHOOK_URL || "http://localhost:5005/webhooks/rest/webhook",

  // ── Webhook registration ──────────────────────────────────────────────────
  // The publicly reachable URL of THIS service (Railway provides this).
  // If set, the bridge auto-registers itself with Green API on startup.
  // e.g. https://your-bridge.up.railway.app
  PUBLIC_URL: process.env.PUBLIC_URL || "",

  // Optional secret token sent in Authorization header by Green API.
  // Set this in Green API console → webhookUrlToken, and here as WEBHOOK_TOKEN.
  WEBHOOK_TOKEN: process.env.WEBHOOK_TOKEN || "",

  // ── Bot identity ──────────────────────────────────────────────────────────
  // The phone number of the Green API instance (digits only, country code, no +)
  // Used to strip @mentions from group messages before forwarding to Rasa
  BOT_PHONE_NUMBER: process.env.BOT_PHONE_NUMBER || "",

  // ── Response trigger mode ─────────────────────────────────────────────────
  // "mention"  → only respond when someone @mentions the bot number in the group
  // "keyword"  → only when message contains BOT_KEYWORD
  // "all"      → every message in the group
  GROUP_TRIGGER_MODE: process.env.GROUP_TRIGGER_MODE || "mention",

  BOT_KEYWORD: process.env.BOT_KEYWORD || "!bot",

  // ── Message scope ─────────────────────────────────────────────────────────
  HANDLE_GROUP_MESSAGES: process.env.HANDLE_GROUP_MESSAGES !== "false",
  HANDLE_DM_MESSAGES: process.env.HANDLE_DM_MESSAGES === "true",

  // ── Group filter ──────────────────────────────────────────────────────────
  // Comma-separated group chatIds (e.g. "120363...@g.us,120363...@g.us")
  // Leave blank to respond in ALL groups.
  // Run: node scripts/list-groups.js  to find your group IDs.
  ALLOWED_GROUP_IDS: process.env.ALLOWED_GROUP_IDS
    ? process.env.ALLOWED_GROUP_IDS.split(",").map((s) => s.trim())
    : [],

  // ── Server ────────────────────────────────────────────────────────────────
  PORT: parseInt(process.env.PORT || "3000", 10),
};

// Validate required credentials
const required = ["GREEN_API_ID_INSTANCE", "GREEN_API_TOKEN", "RASA_WEBHOOK_URL"];
for (const key of required) {
  if (!config[key]) {
    console.error(`[config] ERROR: ${key} is required`);
    process.exit(1);
  }
}

console.log("[config] Green API instance:", config.GREEN_API_ID_INSTANCE);
console.log("[config] Rasa webhook:", config.RASA_WEBHOOK_URL);
console.log("[config] Public URL:", config.PUBLIC_URL || "(not set — register webhook manually)");
console.log("[config] Group trigger mode:", config.GROUP_TRIGGER_MODE);
console.log(
  "[config] Allowed groups:",
  config.ALLOWED_GROUP_IDS.length ? config.ALLOWED_GROUP_IDS : "ALL"
);

module.exports = config;

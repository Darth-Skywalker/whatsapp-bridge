/**
 * Run this once to find the chatId of every WhatsApp group your
 * Green API instance is a member of.
 *
 * Usage:
 *   node scripts/list-groups.js
 *
 * Or with inline credentials (no .env needed):
 *   GREEN_API_ID_INSTANCE=xxx GREEN_API_TOKEN=yyy node scripts/list-groups.js
 *
 * Copy the chatId value(s) you want into ALLOWED_GROUP_IDS in your .env
 */

require("dotenv").config();
const axios = require("axios");

const ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE;
const TOKEN = process.env.GREEN_API_TOKEN;
const API_URL = process.env.GREEN_API_URL || "https://api.greenapi.com";

if (!ID_INSTANCE || !TOKEN) {
  console.error("Set GREEN_API_ID_INSTANCE and GREEN_API_TOKEN in .env or as env vars");
  process.exit(1);
}

async function main() {
  const url = `${API_URL}/waInstance${ID_INSTANCE}/getChats/${TOKEN}`;

  console.log("Fetching chats from Green API...\n");

  const resp = await axios.post(url, {});
  const chats = resp.data;

  const groups = chats.filter((c) => c.id && c.id.endsWith("@g.us"));

  if (groups.length === 0) {
    console.log("No groups found. Make sure the instance is authorized and in at least one group.");
    return;
  }

  console.log(`Found ${groups.length} group(s):\n`);
  groups.forEach((g) => {
    console.log(`  Name   : ${g.name || "(no name)"}`);
    console.log(`  chatId : ${g.id}`);
    console.log("");
  });

  console.log("──────────────────────────────────────────────");
  console.log("Add to your .env:");
  console.log(`ALLOWED_GROUP_IDS=${groups.map((g) => g.id).join(",")}`);
  console.log("──────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("Error:", err.response?.data || err.message);
  process.exit(1);
});

const express = require("express");
const axios = require("axios");
const config = require("./config");
const { extractMessageText, shouldBotRespond } = require("./utils");
const GreenApiClient = require("./greenapi");

const app = express();
app.use(express.json());

const greenApi = new GreenApiClient(config);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", uptime: process.uptime(), mode: "green-api" })
);

// ── Outbound: push a message into a group from external callers ───────────────
// e.g. called by a Rasa custom action to send proactive messages
app.post("/send", async (req, res) => {
  const { chatId, message } = req.body;
  if (!chatId || !message) {
    return res.status(400).json({ error: "chatId and message are required" });
  }
  try {
    const result = await greenApi.sendText(chatId, message);
    res.json({ ok: true, idMessage: result.idMessage });
  } catch (err) {
    console.error("[send] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Inbound: Green API pushes webhooks here ───────────────────────────────────
app.post("/webhook", async (req, res) => {
  // Always ACK immediately — Green API expects a 200 within 180s
  // and will retry otherwise
  res.sendStatus(200);

  const body = req.body;

  try {
    // Validate webhook token if configured
    if (config.WEBHOOK_TOKEN) {
      const token = req.headers["authorization"] || req.query.token;
      if (token !== config.WEBHOOK_TOKEN) {
        console.warn("[webhook] Rejected: invalid token");
        return;
      }
    }

    // We only care about incoming messages
    if (body.typeWebhook !== "incomingMessageReceived") return;

    const { senderData, messageData } = body;
    if (!senderData || !messageData) return;

    const chatId = senderData.chatId; // e.g. "120363...@g.us" for groups
    const sender = senderData.sender; // individual sender JID
    const isGroup = chatId.endsWith("@g.us");

    // Scope filter
    if (isGroup && !config.HANDLE_GROUP_MESSAGES) return;
    if (!isGroup && !config.HANDLE_DM_MESSAGES) return;

    // Group filter
    if (
      isGroup &&
      config.ALLOWED_GROUP_IDS.length > 0 &&
      !config.ALLOWED_GROUP_IDS.includes(chatId)
    ) {
      return;
    }

    const text = extractMessageText(messageData);
    if (!text) return;

    // Trigger check for group messages
    if (isGroup && !shouldBotRespond(text, config)) return;

    // Clean @mentions from the text before forwarding to Rasa
    const cleanText = text
      .replace(new RegExp(`@${config.BOT_PHONE_NUMBER}`, "g"), "")
      .replace(/@\d+/g, "")
      .trim() || text;

    console.log(`[webhook] ${isGroup ? "group" : "dm"} | sender=${sender} | text="${cleanText}"`);

    // Forward to Rasa
    const rasaReplies = await sendToRasa(sender, cleanText);

    if (!rasaReplies || rasaReplies.length === 0) {
      console.log("[rasa] No reply");
      return;
    }

    // Send each reply back via Green API
    for (const reply of rasaReplies) {
      await dispatchReply(chatId, reply);
      // Small delay to avoid flooding
      await new Promise((r) => setTimeout(r, 400));
    }
  } catch (err) {
    console.error("[webhook] Handler error:", err.message);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sendToRasa(sender, message) {
  const resp = await axios.post(
    config.RASA_WEBHOOK_URL,
    { sender, message },
    { timeout: 10_000 }
  );
  return resp.data;
}

async function dispatchReply(chatId, reply) {
  // Plain text
  if (reply.text && !reply.image) {
    await greenApi.sendText(chatId, reply.text);
  }

  // Image (with optional caption)
  if (reply.image) {
    await greenApi.sendFile(chatId, reply.image, "image.jpg", reply.text || "");
  }

  // Buttons → numbered text list (WhatsApp has no native buttons via Green API REST)
  if (reply.buttons && reply.buttons.length > 0 && !reply.image) {
    const btnText = reply.buttons.map((b, i) => `${i + 1}. ${b.title}`).join("\n");
    const prefix = reply.text ? `${reply.text}\n\n` : "";
    await greenApi.sendText(chatId, `${prefix}${btnText}`);
  }

  // Custom payload
  if (reply.custom) {
    if (reply.custom.type === "location" && reply.custom.lat && reply.custom.lon) {
      await greenApi.sendLocation(chatId, reply.custom.lat, reply.custom.lon, reply.custom.name || "");
    } else {
      // Dev fallback
      await greenApi.sendText(chatId, `[custom]\n${JSON.stringify(reply.custom, null, 2)}`);
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(config.PORT, async () => {
  console.log(`[bridge] Green API ↔ Rasa bridge running on :${config.PORT}`);
  console.log(`[bridge] Webhook endpoint: POST /webhook`);

  // Auto-register webhook URL with Green API if PUBLIC_URL is set
  if (config.PUBLIC_URL) {
    const webhookUrl = `${config.PUBLIC_URL}/webhook`;
    try {
      await greenApi.setSettings({
        webhookUrl,
        incomingWebhook: "yes",
        outgoingWebhook: "no",
        stateWebhook: "no",
        ...(config.WEBHOOK_TOKEN ? { webhookUrlToken: config.WEBHOOK_TOKEN } : {}),
      });
      console.log(`[bridge] ✅ Webhook registered: ${webhookUrl}`);
    } catch (err) {
      console.warn("[bridge] Could not auto-register webhook:", err.message);
      console.warn(`[bridge] Set it manually in the Green API console → ${webhookUrl}`);
    }
  } else {
    console.log("[bridge] PUBLIC_URL not set — register webhook manually in Green API console");
  }
});

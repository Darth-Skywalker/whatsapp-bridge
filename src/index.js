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
  res.sendStatus(200);
  console.log("[webhook] received body:", JSON.stringify(req.body));

  const body = req.body;

  try {
    if (config.WEBHOOK_TOKEN) {
      const token = (req.headers["authorization"] || req.query.token || "")
        .replace("Bearer ", "");
      if (token !== config.WEBHOOK_TOKEN) {
        console.warn("[webhook] Rejected: invalid token");
        return;
      }
    }

    console.log("[webhook] typeWebhook:", body.typeWebhook);
    if (body.typeWebhook !== "incomingMessageReceived") {
      console.log("[webhook] ignoring non-incoming webhook type:", body.typeWebhook);
      return;
    }

    const { senderData, messageData } = body;
    console.log("[webhook] senderData:", JSON.stringify(senderData));
    console.log("[webhook] messageData:", JSON.stringify(messageData));

    const chatId = senderData.chatId;
    const sender = senderData.sender;
    const isGroup = chatId.endsWith("@g.us");

    console.log("[webhook] chatId:", chatId, "isGroup:", isGroup);
    console.log("[webhook] ALLOWED_GROUP_IDS:", config.ALLOWED_GROUP_IDS);

    if (isGroup && !config.HANDLE_GROUP_MESSAGES) {
      console.log("[webhook] dropping: group messages disabled");
      return;
    }
    if (!isGroup && !config.HANDLE_DM_MESSAGES) {
      console.log("[webhook] dropping: DM messages disabled");
      return;
    }

    if (
      isGroup &&
      config.ALLOWED_GROUP_IDS.length > 0 &&
      !config.ALLOWED_GROUP_IDS.includes(chatId)
    ) {
      console.log("[webhook] dropping: chatId not in allowed list");
      return;
    }

    const text = extractMessageText(messageData);
    console.log("[webhook] extracted text:", text);

    if (!text) {
      console.log("[webhook] dropping: no text extracted");
      return;
    }

    if (isGroup && !shouldBotRespond(text, config)) {
      console.log("[webhook] dropping: shouldBotRespond returned false");
      return;
    }

    const cleanText = text
      .replace(new RegExp(`@${config.BOT_PHONE_NUMBER}`, "g"), "")
      .replace(/@\d+/g, "")
      .trim() || text;

    console.log("[webhook] forwarding to rasa, sender:", sender, "text:", cleanText);

    const rasaReplies = await sendToRasa(sender, cleanText);
    console.log("[webhook] rasa replies:", JSON.stringify(rasaReplies));

    if (!rasaReplies || rasaReplies.length === 0) {
      console.log("[rasa] No reply returned");
      return;
    }

    for (const reply of rasaReplies) {
      await dispatchReply(chatId, reply);
      await new Promise((r) => setTimeout(r, 400));
    }
  } catch (err) {
    console.error("[webhook] Handler error:", err.message);
    console.error("[webhook] Stack:", err.stack);
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

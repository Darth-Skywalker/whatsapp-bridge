# WhatsApp → Rasa Bridge (Green API)

Connects a WhatsApp group to your Rasa chatbot using **Green API** — a paid managed service that handles the WhatsApp connection for you. No QR codes to scan on Railway, no session files to persist, no ban risk on your personal number.

```
WhatsApp Group
      │  (message)
      ▼
  Green API
      │  POST /webhook  (push delivery)
      ▼
 This bridge (Railway)
      │  POST /webhooks/rest/webhook
      ▼
  Rasa on Railway
      │  JSON replies
      ▼
 This bridge calls Green API REST
      │
      ▼
WhatsApp Group
```

---

## Green API vs Baileys — which should I use?

| | Green API (this project) | Baileys |
|---|---|---|
| **Setup** | Register account, scan QR once in browser | Scan QR in terminal |
| **Session persistence on Railway** | ✅ Managed by Green API | ⚠️ Need Railway Volume |
| **Reliability** | ✅ Managed infra, reconnects for you | Your responsibility |
| **Ban risk** | Lower (dedicated infra) | Higher (reverse-engineered protocol) |
| **Cost** | ~$5–15/month | Free |
| **ToS** | Still unofficial/grey-area | Violates WhatsApp ToS |
| **Group support** | ✅ Yes | ✅ Yes |

---

## Prerequisites

- Node.js ≥ 18
- A **Green API account** — sign up at [green-api.com](https://green-api.com) (free tier available for testing)
- A phone number to link (can be a virtual number — does NOT need to be a WhatsApp Business number)
- Your Rasa app on Railway with REST channel enabled

### Enable Rasa REST channel

In `credentials.yml`:
```yaml
rest:
```
Webhook URL will be: `https://your-rasa-app.up.railway.app/webhooks/rest/webhook`

---

## Green API setup

1. Sign up at [console.green-api.com](https://console.green-api.com)
2. Create a new instance → note your **ID Instance** and **API Token**
3. Click **"Scan QR"** in the console and scan with the phone you want to use as the bot
4. Note the **apiUrl** shown in your console (e.g. `https://api.greenapi.com`)

The phone number is now linked. Unlike Baileys, this session lives in Green API's cloud — no re-scanning needed after deploys.

---

## Local setup

```bash
git clone <this-repo>
cd whatsapp-greenapi-rasa-bridge
npm install
cp .env.example .env
# Edit .env with your Green API credentials and Rasa URL
npm start
```

### Find your group chatIds

```bash
npm run list-groups
```

Prints all groups the instance is a member of. Copy the `chatId` values into `ALLOWED_GROUP_IDS` in `.env`.

### Add the bot to your group

In WhatsApp on the linked phone, add the bot's number to the group as a normal contact. Or ask someone in the group to add it.

---

## Deploy to Railway

### Option A — GitHub (recommended)

1. Push this repo to GitHub
2. **New Project → Deploy from GitHub repo** in Railway
3. Set environment variables in Railway's **Variables** tab
4. After first deploy, Railway gives you a public URL like `https://your-bridge.up.railway.app`
5. Set `PUBLIC_URL=https://your-bridge.up.railway.app` in Railway variables
6. Redeploy — the bridge will auto-register the webhook with Green API

> **No Volume needed** — unlike the Baileys version, there are no session files to persist.

### Option B — Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Set variables:
```bash
railway variables set GREEN_API_ID_INSTANCE=1101000000
railway variables set GREEN_API_TOKEN=your_token
railway variables set RASA_WEBHOOK_URL=https://your-rasa.up.railway.app/webhooks/rest/webhook
railway variables set PUBLIC_URL=https://your-bridge.up.railway.app
railway variables set BOT_PHONE_NUMBER=447911123456
```

### Manual webhook registration (if AUTO_REGISTER doesn't work)

In [Green API console](https://console.green-api.com):
1. Select your instance
2. Go to **Settings**
3. Set **Webhook URL** to `https://your-bridge.up.railway.app/webhook`
4. Enable: **Incoming messages**
5. Optionally set a **webhookUrlToken** (and add the same as `WEBHOOK_TOKEN` env var)

---

## Configuration reference

| Variable | Default | Description |
|---|---|---|
| `GREEN_API_ID_INSTANCE` | *(required)* | Your instance ID from Green API console |
| `GREEN_API_TOKEN` | *(required)* | Your API token from Green API console |
| `GREEN_API_URL` | `https://api.greenapi.com` | API base URL (check your console) |
| `RASA_WEBHOOK_URL` | *(required)* | Full URL to Rasa REST webhook |
| `PUBLIC_URL` | `""` | Public URL of this service for auto-registration |
| `WEBHOOK_TOKEN` | `""` | Secret to validate incoming webhooks |
| `BOT_PHONE_NUMBER` | `""` | Bot's phone number (for @mention detection) |
| `GROUP_TRIGGER_MODE` | `mention` | `mention` / `keyword` / `all` |
| `BOT_KEYWORD` | `!bot` | Keyword trigger (keyword mode only) |
| `ALLOWED_GROUP_IDS` | *(all)* | Comma-separated group chatIds |
| `HANDLE_GROUP_MESSAGES` | `true` | Handle group messages |
| `HANDLE_DM_MESSAGES` | `false` | Handle direct messages |
| `PORT` | `3000` | HTTP server port |

---

## HTTP API

### `GET /health`
Returns `{ status: "ok", uptime: <seconds>, mode: "green-api" }` — used by Railway health checks.

### `POST /send`
Push a message to a group from outside (e.g. a Rasa custom action, a cron job, another service).

```bash
curl -X POST https://your-bridge.up.railway.app/send \
  -H "Content-Type: application/json" \
  -d '{"chatId": "120363...@g.us", "message": "Hello from Rasa!"}'
```

### `POST /webhook`
Receives push notifications from Green API. This is called automatically by Green API — you don't call it yourself.

---

## Rasa response types supported

| Rasa response field | What's sent to WhatsApp |
|---|---|
| `text` | Text message |
| `image` | Image file with optional caption |
| `buttons` | Numbered text list |
| `custom.type = "location"` | WhatsApp location pin |

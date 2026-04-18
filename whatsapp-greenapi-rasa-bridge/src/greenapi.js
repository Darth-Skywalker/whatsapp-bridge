const axios = require("axios");

/**
 * Thin wrapper around the Green API REST endpoints.
 * Docs: https://green-api.com/en/docs/api/
 *
 * All Green API calls follow the pattern:
 *   POST {apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}
 */
class GreenApiClient {
  constructor(config) {
    this.baseUrl = config.GREEN_API_URL; // e.g. https://api.greenapi.com
    this.idInstance = config.GREEN_API_ID_INSTANCE;
    this.token = config.GREEN_API_TOKEN;
  }

  _url(method) {
    return `${this.baseUrl}/waInstance${this.idInstance}/${method}/${this.token}`;
  }

  async _post(method, payload) {
    const resp = await axios.post(this._url(method), payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15_000,
    });
    return resp.data;
  }

  /**
   * Send a plain text message.
   * chatId: "120363...@g.us" for groups, "79999999999@c.us" for DMs
   */
  async sendText(chatId, message) {
    return this._post("sendMessage", { chatId, message });
  }

  /**
   * Send a file (image, document, etc.) by URL.
   * fileName should include the extension so WhatsApp renders it correctly.
   */
  async sendFile(chatId, urlFile, fileName, caption = "") {
    return this._post("sendFileByUrl", { chatId, urlFile, fileName, caption });
  }

  /**
   * Send a location pin.
   */
  async sendLocation(chatId, latitude, longitude, nameLocation = "") {
    return this._post("sendLocation", { chatId, latitude, longitude, nameLocation });
  }

  /**
   * Register / update the webhook URL and settings for this instance.
   * Called automatically on startup if PUBLIC_URL env var is set.
   *
   * settings shape: {
   *   webhookUrl: "https://...",
   *   incomingWebhook: "yes" | "no",
   *   outgoingWebhook: "yes" | "no",
   *   stateWebhook: "yes" | "no",
   *   webhookUrlToken: "<secret>"   // optional
   * }
   */
  async setSettings(settings) {
    return this._post("setSettings", settings);
  }

  /**
   * Get all groups this instance is a member of.
   * Returns an array of { id, subject, participants }.
   * Use to find your group chatId values.
   */
  async getGroups() {
    // Green API doesn't have a single "list groups" endpoint.
    // The closest is getChats — filter by @g.us suffix.
    const chats = await this._post("getChats", {});
    return chats.filter((c) => c.id && c.id.endsWith("@g.us"));
  }
}

module.exports = GreenApiClient;

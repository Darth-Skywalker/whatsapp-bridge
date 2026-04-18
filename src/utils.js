/**
 * Extract plain text from a Green API messageData object.
 *
 * Green API message types and their text fields:
 *   textMessage           → textMessageData.textMessage
 *   extendedTextMessage   → extendedTextMessageData.text
 *   imageMessage          → fileMessageData.caption
 *   videoMessage          → fileMessageData.caption
 *   documentMessage       → fileMessageData.caption
 *   reactionMessage       → extendedTextMessageData.text (the emoji)
 *   buttonsResponseMessage → buttonsResponseMessage.selectedDisplayText
 *   listResponseMessage   → listResponseMessage.title
 */
function extractMessageText(messageData) {
  if (!messageData) return null;

  const type = messageData.typeMessage;

  switch (type) {
    case "textMessage":
      return messageData.textMessageData?.textMessage || null;

    case "extendedTextMessage":
      return messageData.extendedTextMessageData?.text || null;

    case "imageMessage":
    case "videoMessage":
    case "documentMessage":
    case "audioMessage":
      return messageData.fileMessageData?.caption || null;

    case "buttonsResponseMessage":
      return messageData.buttonsResponseMessage?.selectedDisplayText || null;

    case "listResponseMessage":
      return messageData.listResponseMessage?.title || null;

    // Ignore reactions, stickers, contacts, polls etc.
    default:
      return null;
  }
}

/**
 * Decide whether the bot should respond to a group message.
 *
 * Green API webhooks don't include the mention JID list like Baileys does,
 * so we rely on @phone_number patterns in the text.
 */
function shouldBotRespond(text, config) {
  const lowerText = text.toLowerCase();

  switch (config.GROUP_TRIGGER_MODE) {
    case "all":
      return true;

    case "keyword":
      return lowerText.includes(config.BOT_KEYWORD.toLowerCase());

    case "mention":
    default: {
      // @mention check: Green API sends the raw text with @phonenumber
      if (config.BOT_PHONE_NUMBER && text.includes(`@${config.BOT_PHONE_NUMBER}`)) {
        return true;
      }
      // Also support !bot keyword as a fallback in mention mode
      if (lowerText.startsWith("!bot")) return true;
      return false;
    }
  }
}

module.exports = { extractMessageText, shouldBotRespond };

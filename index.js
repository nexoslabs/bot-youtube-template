// Core dependencies
const fs = require("fs");
const yaml = require("js-yaml");
const { google } = require("googleapis");
const winston = require("winston");
// ---- LOGGER SETUP ----
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "bot-error.log", level: "error" }),
    new winston.transports.File({ filename: "bot-combined.log" }),
  ],
});
// Dynamic import for node-fetch (ESM compatibility)
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

// ---- CONFIGURATION & DATA LOADING ----

/**
 * OAuth2 credentials for YouTube API (from Google Cloud Console)
 * @type {object}
 */
let CLIENT_SECRET;
try {
  CLIENT_SECRET = require("./client_secret.json");
  if (!CLIENT_SECRET || !CLIENT_SECRET.installed) {
    logger.error(
      "Missing or invalid client_secret.json file. Please download it from Google Cloud Console and place it in the project directory."
    );
    process.exit(1);
  }
} catch (err) {
  logger.error(`Failed to load client_secret.json: ${err.message}`);
  process.exit(1);
}

/**
 * File to persist list of users who have chatted in the stream
 * @type {string}
 */
const PARTICIPANTS_FILE = "participants.json";

/**
 * Load bot configuration and commands from YAML file
 * @type {object}
 */
let botYml;
try {
  botYml = yaml.load(fs.readFileSync("bot.yml", "utf8"));
  if (!botYml) {
    logger.warning("bot.yml is missing or empty.");
    process.exit(1);
  }
  if (!Array.isArray(botYml.commands)) {
    logger.error("bot.yml: 'commands' section is missing or not an array.");
    process.exit(1);
  }
  if (botYml.timedMessages && !Array.isArray(botYml.timedMessages)) {
    logger.error("bot.yml: 'timedMessages' must be an array if present.");
    process.exit(1);
  }
  if (botYml.badWords && !Array.isArray(botYml.badWords)) {
    logger.error("bot.yml: 'badWords' must be an array if present.");
    process.exit(1);
  }
  if (!botYml.discordWebhook) {
    logger.error("bot.yml: 'discordWebhook' section is missing.");
    process.exit(1);
  }
} catch (err) {
  logger.error(`Failed to load bot.yml: ${err.message}`);
  process.exit(1);
}

/**
 * Main bot configuration object
 * @type {{badWords: string[], discordWebhook: object|null, timedMessages: Array<{interval: number, message: string}>}}
 */
const config = {
  badWords: botYml.badWords || [],
  discordWebhook: botYml.discordWebhook || null,
  timedMessages: Array.isArray(botYml.timedMessages)
    ? botYml.timedMessages.map((tm) => ({
        interval: tm.interval,
        message: tm.message,
      }))
    : [],
};

/**
 * Commands mapping (lowercase trigger/alias -> command object)
 * @type {Object.<string, {response: string, description: string, aliases: string[]}>}
 */
const commands = {};
if (Array.isArray(botYml.commands)) {
  botYml.commands.forEach((cmd) => {
    if (cmd.trigger && cmd.response) {
      // Map main trigger
      commands[cmd.trigger.toLowerCase()] = {
        response: cmd.response,
        description: cmd.description || "",
        aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
      };
      // Map aliases
      if (Array.isArray(cmd.aliases)) {
        cmd.aliases.forEach((alias) => {
          commands[alias.toLowerCase()] = {
            response: cmd.response,
            description: cmd.description || "",
            aliases: cmd.aliases,
          };
        });
      }
    }
  });
}

/**
 * Set of users who have chatted in the stream (for welcome messages)
 * @type {Set<string>}
 */
let participants = new Set();
try {
  if (fs.existsSync(PARTICIPANTS_FILE)) {
    participants = new Set(JSON.parse(fs.readFileSync(PARTICIPANTS_FILE)));
  }
} catch (err) {
  logger.warn(`Could not load participants file: ${err.message}`);
}

/**
 * Persist the current set of participants to disk
 */
function saveParticipants() {
  try {
    fs.writeFileSync(PARTICIPANTS_FILE, JSON.stringify([...participants]));
  } catch (err) {
    logger.error(`Failed to save participants: ${err.message}`);
  }
}

/**
 * Required OAuth2 scopes for YouTube API
 * @type {string[]}
 */
const SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"];

/**
 * File to persist OAuth2 tokens
 * @type {string}
 */
const TOKEN_PATH = "token.json";

// ---------- AUTH ----------

/**
 * Authorize the bot with YouTube API using OAuth2
 * Prompts the user for a code if no token is saved
 * @returns {Promise<object>} Authenticated OAuth2 client
 */
async function authorize() {
  const { client_secret, client_id, redirect_uris } = CLIENT_SECRET.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if token already saved
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }

  // If not, generate new auth URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  logger.info(`Authorize this app by visiting: ${authUrl}`);

  // After visiting, paste the code here
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question("Enter the code from that page: ", async (code) => {
      readline.close();
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      resolve(oAuth2Client);
      logger.info("OAuth2 token saved successfully.");
    });
  });
  logger.error(`Failed to get OAuth2 token: ${err.message}`);
}

// ---------- CHAT FUNCTIONS ----------

/**
 * Get the live chat ID for the currently active YouTube broadcast
 * @param {object} auth - Authenticated OAuth2 client
 * @returns {Promise<string>} The live chat ID
 */
async function getLiveChatId(auth) {
  const youtube = google.youtube({ version: "v3", auth });
  const res = await youtube.liveBroadcasts.list({
    part: "snippet,contentDetails,status",
    // broadcastStatus: "active",
    mine: true,
  });

  if (!res.data.items.length) {
    logger.error(
      "No active live stream found! Please start a YouTube live broadcast and try again."
    );
    process.exit(1);
  }

  const active = res.data.items.find(
    (b) => b.status?.lifeCycleStatus === "live"
  );
  if (!active) {
    logger.error(
      "No currently active broadcast! Please make sure your stream is live."
    );
    process.exit(1);
  }

  const liveChatId = active.snippet.liveChatId;
  logger.info(`Live Chat ID: ${liveChatId}`);
  return liveChatId;
}

/**
 * Send a message to the YouTube live chat
 * @param {object} youtube - YouTube API client
 * @param {string} liveChatId - Live chat ID
 * @param {string} text - Message text
 * @returns {Promise<void>}
 */
async function sendMessage(youtube, liveChatId, text) {
  await youtube.liveChatMessages.insert({
    part: "snippet",
    requestBody: {
      snippet: {
        liveChatId,
        type: "textMessageEvent",
        textMessageDetails: { messageText: text },
      },
    },
  });
}

// ---------- DISCORD WEBHOOK ----------

/**
 * Send a message to a Discord channel via webhook
 * @param {string} user - Username to display
 * @param {string|null} avatar - Avatar URL (optional)
 * @param {string} message - Message content
 * @returns {Promise<void>}
 */
async function sendToDiscord(user, avatar, message) {
  if (
    !config.discordWebhook ||
    !config.discordWebhook.enable ||
    !config.discordWebhook.url
  )
    return;

  await fetch(config.discordWebhook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: user,
      avatar_url: avatar,
      content: message,
    }),
  });
}

// ---------- HELPERS ----------

/**
 * Format the stream uptime as a human-readable string
 * @param {number} startTime - Timestamp when the stream started (ms)
 * @returns {string} Uptime string (e.g. "1h 23m 45s")
 */
function formatUptime(startTime) {
  const diff = Date.now() - startTime;
  const secs = Math.floor(diff / 1000) % 60;
  const mins = Math.floor(diff / 60000) % 60;
  const hours = Math.floor(diff / 3600000);
  return `${hours}h ${mins}m ${secs}s`;
}

// ---------- BOT LOOP ----------

/**
 * Main bot loop: listens to chat, responds to commands, filters words, and sends Discord notifications
 * @param {object} auth - Authenticated OAuth2 client
 * @param {string} liveChatId - Live chat ID
 */
async function listenAndRespond(auth, liveChatId) {
  const youtube = google.youtube({ version: "v3", auth });
  let nextPageToken = null;
  let firstRun = true;
  const startTime = Date.now();

  // Setup timed messages (auto-messages at intervals)
  config.timedMessages.forEach((tm) => {
    setInterval(() => {
      sendMessage(youtube, liveChatId, tm.message).catch(console.error);
    }, tm.interval);
  });

  /**
   * Polls the YouTube live chat for new messages and processes them
   */
  async function pollChat() {
    try {
      const res = await youtube.liveChatMessages.list({
        liveChatId,
        part: "snippet,authorDetails",
        pageToken: nextPageToken || "",
      });

      if (!firstRun) {
        for (const item of res.data.items) {
          const user = item.authorDetails.displayName;
          const avatar = item.authorDetails.profileImageUrl;
          const message = item.snippet.displayMessage;
          logger.info(`${user}: ${message}`);

          // Send every message to Discord
          await sendToDiscord(user, avatar, message);

          // Welcome first-time chatters
          if (!participants.has(user)) {
            participants.add(user);
            saveParticipants();
            await sendMessage(
              youtube,
              liveChatId,
              `👋 Welcome @${user} to the stream, Thanks for joining!`
            );
          }

          // Word filter: check for banned words
          if (config.badWords.some((w) => message.toLowerCase().includes(w))) {
            await sendMessage(
              youtube,
              liveChatId,
              `@${user}, please avoid bad language!`
            );
            await sendToDiscord(
              "Bot",
              null,
              `@${user} used a banned word: "${message}"`
            );
            continue;
          }

          // Command handler: respond to recognized commands or aliases
          const cmdObj = commands[message.toLowerCase()];
          if (cmdObj) {
            let reply = cmdObj.response
              .replace("{user}", user)
              .replace("{uptime}", formatUptime(startTime));
            // If command expects arguments, replace {args}
            if (reply.includes("{args}")) {
              // Extract args (everything after the command)
              const parts = message.split(" ");
              const args = parts.slice(1).join(" ");
              reply = reply.replace("{args}", args);
            }
            await sendMessage(youtube, liveChatId, reply);
          }
        }
      }

      firstRun = false;
      nextPageToken = res.data.nextPageToken;
      // Use YouTube’s suggested polling interval
      const interval = res.data.pollingIntervalMillis || 5000;
      setTimeout(pollChat, interval);
    } catch (err) {
      logger.error("Polling error:", err.message);
      // If quota exceeded, wait longer before retry
      const backoff = err.message.includes("quota") ? 60000 : 10000;
      setTimeout(pollChat, backoff);
    }
  }

  pollChat();
}

// ---------- MAIN ----------

/**
 * Entry point: Authorize, get live chat ID, and start bot loop
 */
(async () => {
  try {
    const auth = await authorize();
    const liveChatId = await getLiveChatId(auth);
    listenAndRespond(auth, liveChatId);
  } catch (err) {
    logger.error(`[FATAL] Unhandled error: ${err.message}`);
    process.exit(1);
  }
})();

import express, { text } from "express";
import dotenv from "dotenv";
import { createEventAdapter } from "@slack/events-api";
import { WebClient } from "@slack/web-api";
import cron from "node-cron";

dotenv.config();

const app = express();

const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const slackToken = process.env.SLACK_BOT_TOKEN;

const slackEvents = createEventAdapter(slackSigningSecret);
const slackClient = new WebClient(slackToken);

const port = process.env.PORT || 4000;

app.use(express.json());

let standupUpdates = [];
let blockers = [];

// handles slack's url verification request
app.post("/slack/events", (req, res) => {
  const { type, challenge } = req.body;

  if (type === "url_verification") {
    res.status(200).send(challenge);
  } else {
    res.status(200).send("OK");
  }
});

// daily reminder
cron.schedule("00 10 * * 1-5", () => {
  slackClient.chat
    .postMessage({
      channel: "channel-standup",
      text: "Good morning! Please share your daily standup updates here. Remember to include what you worked on, what you're working on, and any blockers encounted.",
    })
    .catch(console.error);
});

// listen for new messages
slackEvents.on("message", (event) => {
  if (event.text) {
    console.log(`Message from ${event.user}: ${event.text}`);

    // save the update and check for blockers
    const update = {
      user: event.user,
      text: event.text,
    };
    standupUpdates.push(update);

    if (event.text.toLowerCase().includes("blockers")) {
      blockers.push(update);
    }
  }
});

// summarize updates
slackEvents.on("app_mention", async (event) => {
  if (event.text.includes("summary")) {
    const summary = standupUpdates
      .map((update) => `<@${update.user}>: ${update.text}`)
      .join("\n");
    await slackClient.chat.postMessage({
      channel: event.channel,
      text: `Here is the summary of updates:\n${summary || "No updates yet"}`,
    });
  } else if (event.text.includes("blockers")) {
    const blockerList = blockers
      .map((blocker) => `<@${blocker.user}>: ${blocker.text}`)
      .join("\n");
    await slackClient.chat.postMessage({
      channel: event.channel,
      text: `Here are the reported blockers: \n${
        blockerList || "No blockers reported"
      }`,
    });
  }
});

slackEvents.start(port)
    .then(() => {
    console.log(`Slack bot is running on port ${port} `);
  })
  .catch((error) => {
    console.log("Failed to start the Slack bot:", error);
  });



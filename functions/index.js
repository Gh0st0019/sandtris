const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const DAILY_TOPIC = "daily-reminder";
const APP_URL = "https://worlde.online";
const DEFAULT_NOTIFICATION = {
  title: "Sandtris",
  body: "Torna a giocare: il record ti aspetta.",
  icon: `${APP_URL}/assets/icon-192.png`,
  badge: `${APP_URL}/assets/app-icon.png`,
};
const REMINDER_MESSAGES = [
  "La sabbia ti aspetta. Torna a giocare!",
  "Un match perfetto e dietro l'angolo.",
  "La corona vuole un nuovo re.",
  "Hai 5 minuti? Fai una partita.",
  "Scuoti la sabbia, e ora di vincere.",
  "Il record non si supera da solo.",
  "Nuove combo, stessa voglia di giocare.",
  "Pronto per una partita lampo?",
];

exports.registerPushToken = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const token = req.body?.token;
  if (!token || typeof token !== "string") {
    res.status(400).json({ ok: false, error: "missing_token" });
    return;
  }
  try {
    await admin.messaging().subscribeToTopic([token], DAILY_TOPIC);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "subscribe_failed" });
  }
});

exports.dailyReminder = functions.pubsub
  .schedule("every 35 minutes")
  .timeZone("Europe/Rome")
  .onRun(async () => {
    const body = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
    const message = {
      topic: DAILY_TOPIC,
      notification: {
        title: DEFAULT_NOTIFICATION.title,
        body,
      },
      webpush: {
        notification: {
          icon: DEFAULT_NOTIFICATION.icon,
          badge: DEFAULT_NOTIFICATION.badge,
        },
      },
      data: {
        url: APP_URL,
      },
    };
    await admin.messaging().send(message);
    return null;
  });

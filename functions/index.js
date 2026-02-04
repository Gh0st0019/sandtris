const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const DAILY_TOPIC = "daily-reminder";
const APP_URL = "https://sandtris.fun";
const DEFAULT_NOTIFICATION = {
  title: "Sandtris",
  body: "Torna a giocare: il record ti aspetta.",
  icon: `${APP_URL}/assets/icon-192.png`,
  badge: `${APP_URL}/assets/app-icon.png`,
};
const REMINDER_MESSAGES = [
  "⏳ La sabbia scorre e il tabellone ti chiama. Ti va una partita veloce?",
  "👑 La corona aspetta un nuovo re. Rientra e prova a battere il record!",
  "✨ Una combo perfetta ti aspetta dietro l’angolo. Torna a giocare ora!",
  "🔥 Hai 5 minuti? Abbastanza per una run epica. Entra e spacca tutto!",
  "🎯 Il match perfetto non si fa da solo. Dai, facciamo scintille!",
  "🌀 Muovi la sabbia, crea magie. Pronto per un’altra sfida?",
  "🚀 Rientra e fai volare il punteggio. Il tabellone ha fame di match!",
  "💛 Piccolo reminder: c’è una partita pronta per te. Si gioca?",
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
  .schedule("every 30 minutes")
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

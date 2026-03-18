const express = require("express");
const fs = require("fs");
const pino = require("pino");
const { makeid } = require("./gen-id");
const { saveSession } = require("./auth"); // your Mongo save function
const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  makeCacheableSignalKeyStore,
  delay
} = require("@whiskeysockets/baileys");

const router = express.Router();

function removeFile(path) {
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  const id = makeid();
  let number = req.query.number;
  if (!number) return res.status(400).json({ code: "❗ Number required" });

  async function generatePair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./temp/${id}`);
    try {
      const sock = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
        printQRInTerminal: false,
        browser: Browsers.macOS("Safari")
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          console.log(`✅ WhatsApp connected for ${number}`);
          await delay(2000);

          // Read creds and save to Mongo
          const credsPath = `./temp/${id}/creds.json`;
          const data = fs.readFileSync(credsPath, "utf-8");
          await saveSession(number, JSON.parse(data));

          // Send a live message to the user
          await sock.sendMessage(number + "@s.whatsapp.net", {
            text: "✅ Your WhatsApp bot is now connected and session saved!"
          });

          removeFile(`./temp/${id}`);
          if (!res.headersSent) res.json({ code: "Session saved to DB ✅" });

          await sock.ws.close();
        } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
          console.log("🔄 Connection closed unexpectedly, retrying...");
          generatePair();
        }
      });

      // Wait a bit and request pairing code
      await delay(1000);
      number = number.replace(/[^0-9]/g, "");
      const code = await sock.requestPairingCode(number);
      console.log(`📨 Pairing code sent to ${number}`);
      if (!res.headersSent) res.json({ code });

    } catch (err) {
      console.error("❌ Pairing Error:", err);
      removeFile(`./temp/${id}`);
      if (!res.headersSent) res.json({ code: `❗ Service Unavailable: ${err.message}` });
    }
  }

  generatePair();
});

module.exports = router;
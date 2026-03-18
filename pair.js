const express = require("express");
const fs = require("fs");
const pino = require("pino");
const { makeid } = require("./gen-id");
const { saveSession } = require("./auth");
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, delay } = require("@whiskeysockets/baileys");

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

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          await delay(2000);

          // Read credentials file
          const data = fs.readFileSync(`./temp/${id}/creds.json`);
          const credsJSON = JSON.parse(data.toString());

          // Save session to MongoDB
          await saveSession(number, credsJSON);

          // Send live message to user after bot is connected
          try {
            await sock.sendMessage(number + "@s.whatsapp.net", { 
              text: "✅ Your WhatsApp bot is now connected and your session is saved!" 
            });
          } catch (err) {
            console.log("Failed to send live message:", err);
          }

          removeFile(`./temp/${id}`);

          if (!res.headersSent) res.json({ code: "Session saved & live message sent ✅" });
          await sock.ws.close();

        } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
          generatePair(); // retry if disconnected unexpectedly
        }
      });

      // Request pairing code
      number = number.replace(/[^0-9]/g, '');
      const code = await sock.requestPairingCode(number);
      if (!res.headersSent) res.json({ code });

      sock.ev.on("creds.update", saveCreds);

    } catch (err) {
      console.log(err);
      removeFile(`./temp/${id}`);
      if (!res.headersSent) res.json({ code: "❗ Service Unavailable" });
    }
  }

  generatePair();
});

module.exports = router;
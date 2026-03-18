const express = require("express");
const fs = require("fs");
const pino = require("pino");
const QRCode = require("qrcode");
const { makeid } = require("./gen-id");
const { saveSession } = require("./auth");
const { default: makeWASocket, useMultiFileAuthState, Browsers, makeCacheableSignalKeyStore, delay } = require("@whiskeysockets/baileys");

const router = express.Router();

function removeFile(path) {
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  const id = makeid();
  const { number } = req.query;

  if (!number) return res.status(400).json({ code: "❗ Number required" });

  async function generateQR() {
    const { state, saveCreds } = await useMultiFileAuthState(`./temp/${id}`);
    try {
      const sock = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) },
        printQRInTerminal: false,
        browser: Browsers.macOS("Safari")
      });

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Send QR as image buffer
        if (qr && !res.headersSent) {
          const qrBuffer = await QRCode.toBuffer(qr);
          res.setHeader("Content-Type", "image/png");
          res.end(qrBuffer);
        }

        // On successful connection, save session to MongoDB
        if (connection === "open") {
          await delay(2000);
          const data = fs.readFileSync(`./temp/${id}/creds.json`);
          await saveSession(number, JSON.parse(data.toString()));
          removeFile(`./temp/${id}`);
          await sock.ws.close();
          console.log(`👤 Session saved for ${number}`);
        }

        // Reconnect logic
        else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
          generateQR();
        }
      });

      sock.ev.on("creds.update", saveCreds);
    } catch (err) {
      console.log("QR Service error:", err);
      removeFile(`./temp/${id}`);
      if (!res.headersSent) res.json({ code: "❗ Service Unavailable" });
    }
  }

  generateQR();
});

module.exports = router;
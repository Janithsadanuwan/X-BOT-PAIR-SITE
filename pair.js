const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { upload } = require('./mega');
const { saveSession } = require('./auth'); // MongoDB session saving
const router = express.Router();

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number;

  async function GIFTED_MD_PAIR_CODE() {
    const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
    try {
      let sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        syncFullHistory: false,
        browser: Browsers.macOS("Safari")
      });

      // If number not registered yet, request pairing code
      if (!sock.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      // Save credentials to disk & MongoDB
      sock.ev.on('creds.update', async () => {
        saveCreds();
        try {
          let creds = fs.readFileSync(`./temp/${id}/creds.json`, 'utf-8');
          await saveSession(num, JSON.parse(creds));
        } catch (e) {
          console.log("Failed saving session to MongoDB:", e.message);
        }
      });

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          console.log(`👤 ${num} connected ✅`);

          // Send live connected message
          await sock.sendMessage(sock.user.id, {
            text: `✅ BOT CONNECTED\nHello! Your session is now active.`
          });

          // Optionally upload session to Mega for backup
          const rf = `./temp/${id}/creds.json`;
          try {
            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
            console.log("Session uploaded to Mega:", mega_url);
          } catch (e) {
            console.log("Mega upload failed:", e.message);
          }

          // Clean up temp folder
          await removeFile(`./temp/${id}`);
        } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
          console.log("Restarting pair process...");
          await delay(5000);
          GIFTED_MD_PAIR_CODE();
        }
      });

    } catch (err) {
      console.log("Service error:", err);
      await removeFile('./temp/' + id);
      if (!res.headersSent) res.send({ code: "❗ Service Unavailable" });
    }
  }

  return await GIFTED_MD_PAIR_CODE();
});

module.exports = router;
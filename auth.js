const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://janithsadanuwan1:janith@1234@queennilu.fgbql4r.mongodb.net/?appName=queennilu";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const sessionSchema = new mongoose.Schema({
  number: String,
  sessionData: Object,
  createdAt: { type: Date, default: Date.now }
});

const Session = mongoose.model("Session", sessionSchema);

async function saveSession(number, data) {
  const session = new Session({ number, sessionData: data });
  await session.save();
  console.log("Session saved for", number);
}

module.exports = { saveSession };
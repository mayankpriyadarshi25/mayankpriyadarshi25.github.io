const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const newsAutomator = require('./newsAutomator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const TOKEN = process.env.TOKEN;
const MONGO_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

// ─── Mongoose Schema ──────────────────────────────────────────────────────────
const certSchema = new mongoose.Schema({
  certId:     { type: Number, required: true, unique: true },
  title:      { type: String, required: true },
  issuer:     { type: String, required: true },
  issuerSub:  { type: String, default: '' },
  cat:        { type: String, default: 'General' },
  date:       { type: String, default: '' },
  duration:   { type: String, default: 'N/A' },
  examDur:    { type: String, default: 'N/A' },
  score:      { type: String, default: 'N/A' },
  level:      { type: String, default: 'Associate' },
  desc:       { type: String, required: true },
  overview:   { type: String, default: '' },
  learnings:  { type: [String], default: [] },
  prereqs:    { type: [String], default: [] },
  skills:     { type: [String], default: [] },
  tags:       { type: [String], default: [] },
  link:       { type: String, default: '' },
  featured:   { type: Boolean, default: false },
  verified:   { type: Boolean, default: true },
  imgData:    { type: String, default: '' }   // base64 data URI
}, { timestamps: true });

const Cert = mongoose.model('Cert', certSchema);

// ─── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (req.headers.authorization !== TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, token: TOKEN });
  } else {
    res.status(401).json({ success: false, error: 'Invalid username or password' });
  }
});

// GET all certs
app.get('/api/certs', async (req, res) => {
  try {
    const certs = await Cert.find().sort({ certId: 1 }).lean();
    // Return in the shape the frontend expects (certId -> id)
    res.json(certs.map(c => ({ ...c, id: c.certId, _id: undefined, __v: undefined })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create a new cert
app.post('/api/certs', auth, async (req, res) => {
  try {
    const body = req.body;
    // Generate a unique certId (max existing + 1)
    const last = await Cert.findOne().sort({ certId: -1 }).lean();
    const certId = last ? last.certId + 1 : 1;
    const cert = new Cert({ ...body, certId });
    await cert.save();
    res.json({ success: true, id: certId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update an existing cert
app.put('/api/certs/:id', auth, async (req, res) => {
  try {
    const certId = parseInt(req.params.id);
    await Cert.findOneAndUpdate({ certId }, req.body, { new: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE a cert
app.delete('/api/certs/:id', auth, async (req, res) => {
  try {
    const certId = parseInt(req.params.id);
    await Cert.findOneAndDelete({ certId });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Project Schema ───────────────────────────────────────────────────────────
const VALID_SECTIONS = ['projects', 'notes', 'summary', 'research', 'ctf'];

const projectSchema = new mongoose.Schema({
  section:  { type: String, required: true, enum: VALID_SECTIONS },
  itemId:   { type: Number, required: true },
  title:    { type: String, required: true },
  tag:      { type: String, default: '' },
  date:     { type: String, default: '' },
  body:     { type: String, default: '' },
  folder:   { type: String, default: '' },
  desc:     { type: String, default: '' },
  stack:    { type: [String], default: [] },
  link:     { type: String, default: '' }
}, { timestamps: true });

projectSchema.index({ section: 1, itemId: 1 }, { unique: true });
const ProjectItem = mongoose.model('ProjectItem', projectSchema);

// GET all items in a section
app.get('/api/projects/:section', async (req, res) => {
  const section = req.params.section;
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  try {
    const items = await ProjectItem.find({ section }).sort({ itemId: 1 }).lean();
    res.json(items.map(i => ({ ...i, id: i.itemId, _id: undefined, __v: undefined, section: undefined })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create item in a section
app.post('/api/projects/:section', auth, async (req, res) => {
  const section = req.params.section;
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  try {
    const last = await ProjectItem.findOne({ section }).sort({ itemId: -1 }).lean();
    const itemId = last ? last.itemId + 1 : 1;
    const item = new ProjectItem({ ...req.body, section, itemId });
    await item.save();
    res.json({ success: true, id: itemId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update item in a section
app.put('/api/projects/:section/:id', auth, async (req, res) => {
  const section = req.params.section;
  const itemId = parseInt(req.params.id);
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  try {
    await ProjectItem.findOneAndUpdate({ section, itemId }, req.body, { new: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE item in a section
app.delete('/api/projects/:section/:id', auth, async (req, res) => {
  const section = req.params.section;
  const itemId = parseInt(req.params.id);
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  try {
    await ProjectItem.findOneAndDelete({ section, itemId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── News Schema & Routes ─────────────────────────────────────────────────────
const newsSchema = new mongoose.Schema({
  newsId: { type: Number, required: true },
  title: { type: String, required: true },
  tag: { type: String, default: '' },
  date: { type: String, default: '' },
  body: { type: String, default: '' },
  link: { type: String, default: '' },
  cve: { type: [String], default: [] },
  isTrending: { type: Boolean, default: false }
}, { timestamps: true });

const NewsItem = mongoose.model('NewsItem', newsSchema);

app.get('/api/news', async (req, res) => {
  try {
    const newsItems = await NewsItem.find().sort({ newsId: 1 }).lean();
    res.json(newsItems.map(n => ({ ...n, id: n.newsId, _id: undefined, __v: undefined })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mock generic KV endpoint if news.html still hits POST /api/data to save manual changes
app.post('/api/data', auth, (req, res) => {
  res.json({ success: true }); // We're ignoring manual edits for now and relying on automation
});

// Contact form (EmailJS proxy)
app.post('/api/contact', async (req, res) => {
  const { name, email, msg } = req.body;
  if (!name || !email || !msg) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const EJ_SERVICE  = process.env.EJ_SERVICE;
  const EJ_TEMPLATE = process.env.EJ_TEMPLATE;
  const EJ_KEY      = process.env.EJ_KEY;
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EJ_SERVICE,
        template_id: EJ_TEMPLATE,
        user_id: EJ_KEY,
        template_params: { from_name: name, reply_to: email, message: msg }
      })
    });
    if (response.ok) {
      res.json({ success: true });
    } else {
      const text = await response.text();
      res.status(500).json({ success: false, error: text });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bot AI Chat (OpenRouter)
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.json({ reply: "I'm sorry, my AI brain (OpenRouter API Key) isn't plugged in yet! But I can tell you Mayank is an amazing Cybersecurity student." });
  }

  try {
    // Dynamic import of node-fetch since native fetch may not be robust in older Node, 
    // or we can use native fetch if Node version supports it.
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mayankpriyadarshi25.github.io", 
        "X-Title": "Mayank Portfolio Bot"
      },
      body: JSON.stringify({
        "model": "meta-llama/llama-3-8b-instruct:free", // A stable, 100% free fallback model
        "messages": [
          {"role": "system", "content": "You are Mayank's helpful 3D AI baby robot assistant on his portfolio website. You keep answers concise, friendly, and relevant to cybersecurity and his skills."},
          {"role": "user", "content": message}
        ]
      })
    });
    
    if(!response.ok) {
         const errorText = await response.text();
         console.error("OpenRouter API Error:", errorText);
         
         // Parse the error if possible to give a cleaner message
         let msg = "Unknown Error";
         try {
             const j = JSON.parse(errorText);
             msg = JSON.stringify(j.error || j).substring(0, 100);
         } catch(e) {
             msg = errorText.substring(0, 100);
         }

         return res.json({ reply: `OpenRouter Rejected the request! Error: ${msg}` });
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      res.json({ reply: data.choices[0].message.content });
    } else {
      res.json({ reply: "My circuits are feeling a bit clogged right now!" });
    }
  } catch (e) {
    res.json({ reply: "Glitch in the matrix! Connection failed." });
  }
});

// ─── Connect to MongoDB then start server ─────────────────────────────────────
if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI is not set in .env — please add it and restart.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected.');
    
    // Initialize automated news fetching
    newsAutomator.initNewsCron(NewsItem);

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

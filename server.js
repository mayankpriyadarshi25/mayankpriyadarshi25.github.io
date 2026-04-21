const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const newsAutomator = require('./newsAutomator');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
// Falls back to TOKEN so existing .env files work without changes
const JWT_SECRET = process.env.JWT_SECRET || process.env.TOKEN;
const MONGO_URI = process.env.MONGODB_URI;

// ── Allowed Origins ───────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://mayankpriyadarshi.xyz',           // custom domain (primary)
  'https://www.mayankpriyadarshi.xyz',        // with www
  'https://mayankpriyadarshi25.github.io',   // GitHub Pages fallback
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

// ── Security Headers (VULN-12) ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS — allowlist only (VULN-03) ──────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body Parsing — 5 MB cap (VULN-04) ────────────────────────────────────────
// 5 MB is enough for base64 cert images; public endpoints get extra checks below.
app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// ── Rate Limiters (VULN-01, 08, 09) ──────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  message: { reply: 'Too many requests. Please slow down!' },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: { error: 'Too many messages sent. Please wait a minute before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth Middleware — JWT (VULN-02) ───────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token) return res.status(403).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ error: 'Unauthorized or session expired' });
  }
}

// ── Input Helpers (VULN-06) ───────────────────────────────────────────────────
function sanitize(v, max = 5000) {
  if (v === null || v === undefined) return '';
  return String(v).trim().substring(0, max);
}

function isValidUrl(v) {
  if (!v) return true; // optional field — empty is fine
  return /^https?:\/\//i.test(String(v).trim());
}

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.status(200).send('pong'));

// ── Cert Schema ───────────────────────────────────────────────────────────────
const certSchema = new mongoose.Schema({
  certId:    { type: Number, required: true, unique: true },
  title:     { type: String, required: true, maxlength: 200 },
  issuer:    { type: String, required: true, maxlength: 200 },
  issuerSub: { type: String, default: '', maxlength: 200 },
  cat:       { type: String, default: 'General', maxlength: 100 },
  date:      { type: String, default: '', maxlength: 30 },
  duration:  { type: String, default: 'N/A', maxlength: 50 },
  examDur:   { type: String, default: 'N/A', maxlength: 50 },
  score:     { type: String, default: 'N/A', maxlength: 50 },
  level:     { type: String, default: 'Associate', maxlength: 100 },
  desc:      { type: String, required: true, maxlength: 3000 },
  overview:  { type: String, default: '', maxlength: 3000 },
  learnings: { type: [String], default: [] },
  prereqs:   { type: [String], default: [] },
  skills:    { type: [String], default: [] },
  tags:      { type: [String], default: [] },
  link:      { type: String, default: '', maxlength: 500 },
  featured:  { type: Boolean, default: false },
  verified:  { type: Boolean, default: true },
  imgData:   { type: String, default: '' },  // base64 data URI
}, { timestamps: true });

const Cert = mongoose.model('Cert', certSchema);

// ── Login (VULN-01, 02) ───────────────────────────────────────────────────────
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Missing credentials' });
  }
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // Issue a short-lived JWT instead of returning the raw static token
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid username or password' });
  }
});

// GET all certs
app.get('/api/certs', async (req, res) => {
  try {
    const certs = await Cert.find().sort({ certId: 1 }).lean();
    res.json(certs.map(c => ({ ...c, id: c.certId, _id: undefined, __v: undefined })));
  } catch {
    res.status(500).json({ error: 'Failed to fetch certificates' }); // VULN-07: no e.message
  }
});

// POST create a new cert
app.post('/api/certs', auth, async (req, res) => {
  try {
    const { title, issuer, desc, link, imgData, ...rest } = req.body;
    if (!title || !issuer || !desc) {
      return res.status(400).json({ error: 'Missing required fields: title, issuer, desc' });
    }
    if (link && !isValidUrl(link)) return res.status(400).json({ error: 'Invalid link URL' });

    const last = await Cert.findOne().sort({ certId: -1 }).lean();
    const certId = last ? last.certId + 1 : 1;

    const cert = new Cert({
      ...rest,
      certId,
      title:    sanitize(title, 200),
      issuer:   sanitize(issuer, 200),
      desc:     sanitize(desc, 3000),
      link:     sanitize(link, 500),
      imgData:  typeof imgData === 'string' ? imgData.substring(0, 2_500_000) : '',
    });
    await cert.save();
    res.json({ success: true, id: certId });
  } catch {
    res.status(500).json({ error: 'Failed to create certificate' });
  }
});

// PUT update an existing cert
app.put('/api/certs/:id', auth, async (req, res) => {
  try {
    const certId = parseInt(req.params.id);
    if (isNaN(certId)) return res.status(400).json({ error: 'Invalid cert ID' });

    const { link, imgData, title, issuer, desc, ...rest } = req.body;
    if (link && !isValidUrl(link)) return res.status(400).json({ error: 'Invalid link URL' });

    const update = {
      ...rest,
      title:   sanitize(title, 200),
      issuer:  sanitize(issuer, 200),
      desc:    sanitize(desc, 3000),
      link:    sanitize(link, 500),
      imgData: typeof imgData === 'string' ? imgData.substring(0, 2_500_000) : '',
    };
    await Cert.findOneAndUpdate({ certId }, update, { new: true });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update certificate' });
  }
});

// DELETE a cert
app.delete('/api/certs/:id', auth, async (req, res) => {
  try {
    const certId = parseInt(req.params.id);
    if (isNaN(certId)) return res.status(400).json({ error: 'Invalid cert ID' });
    await Cert.findOneAndDelete({ certId });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete certificate' });
  }
});

// ── Project Schema ────────────────────────────────────────────────────────────
const VALID_SECTIONS = ['projects', 'notes', 'summary', 'research', 'ctf'];

const projectSchema = new mongoose.Schema({
  section: { type: String, required: true, enum: VALID_SECTIONS },
  itemId:  { type: Number, required: true },
  title:   { type: String, required: true, maxlength: 200 },
  tag:     { type: String, default: '', maxlength: 100 },
  date:    { type: String, default: '', maxlength: 30 },
  body:    { type: String, default: '', maxlength: 50000 },
  folder:  { type: String, default: '', maxlength: 100 },
  desc:    { type: String, default: '', maxlength: 1000 },
  stack:   { type: [String], default: [] },
  link:    { type: String, default: '', maxlength: 500 },
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
  } catch {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST create item in a section
app.post('/api/projects/:section', auth, async (req, res) => {
  const section = req.params.section;
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  try {
    const { title, body, link, tag, date, folder, desc, stack } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (link && !isValidUrl(link)) return res.status(400).json({ error: 'Invalid link URL' });

    const last = await ProjectItem.findOne({ section }).sort({ itemId: -1 }).lean();
    const itemId = last ? last.itemId + 1 : 1;

    const item = new ProjectItem({
      section,
      itemId,
      title:  sanitize(title, 200),
      tag:    sanitize(tag, 100),
      date:   sanitize(date, 30),
      body:   sanitize(body, 50000),
      folder: sanitize(folder, 100),
      desc:   sanitize(desc, 1000),
      stack:  Array.isArray(stack) ? stack.map(s => sanitize(s, 100)).slice(0, 20) : [],
      link:   sanitize(link, 500),
    });
    await item.save();
    res.json({ success: true, id: itemId });
  } catch {
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT update item in a section
app.put('/api/projects/:section/:id', auth, async (req, res) => {
  const section = req.params.section;
  const itemId = parseInt(req.params.id);
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });
  try {
    const { title, body, link, tag, date, folder, desc, stack } = req.body;
    if (link && !isValidUrl(link)) return res.status(400).json({ error: 'Invalid link URL' });

    const update = {
      title:  sanitize(title, 200),
      tag:    sanitize(tag, 100),
      date:   sanitize(date, 30),
      body:   sanitize(body, 50000),
      folder: sanitize(folder, 100),
      desc:   sanitize(desc, 1000),
      stack:  Array.isArray(stack) ? stack.map(s => sanitize(s, 100)).slice(0, 20) : [],
      link:   sanitize(link, 500),
    };
    await ProjectItem.findOneAndUpdate({ section, itemId }, update, { new: true });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE item in a section
app.delete('/api/projects/:section/:id', auth, async (req, res) => {
  const section = req.params.section;
  const itemId = parseInt(req.params.id);
  if (!VALID_SECTIONS.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });
  try {
    await ProjectItem.findOneAndDelete({ section, itemId });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// ── News Schema & Routes ──────────────────────────────────────────────────────
const newsSchema = new mongoose.Schema({
  newsId:     { type: Number, required: true },
  title:      { type: String, required: true, maxlength: 500 },
  tag:        { type: String, default: '', maxlength: 100 },
  date:       { type: String, default: '', maxlength: 30 },
  body:       { type: String, default: '', maxlength: 5000 },
  link:       { type: String, default: '', maxlength: 500 },
  cve:        { type: [String], default: [] },
  isTrending: { type: Boolean, default: false },
}, { timestamps: true });

const NewsItem = mongoose.model('NewsItem', newsSchema);

app.get('/api/news', async (req, res) => {
  try {
    const newsItems = await NewsItem.find().sort({ newsId: 1 }).lean();
    res.json(newsItems.map(n => ({ ...n, id: n.newsId, _id: undefined, __v: undefined })));
  } catch {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Mock generic KV endpoint
app.post('/api/data', auth, (req, res) => {
  res.json({ success: true });
});

// Contact form (EmailJS proxy) — rate limited + validated (VULN-09)
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, msg } = req.body;
  if (!name || !email || !msg) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Enforce length caps
  if (name.length > 100 || email.length > 254 || msg.length > 5000) {
    return res.status(400).json({ error: 'Input exceeds maximum length' });
  }

  const EJ_SERVICE  = process.env.EJ_SERVICE;
  const EJ_TEMPLATE = process.env.EJ_TEMPLATE;
  const EJ_KEY      = process.env.EJ_KEY;
  const EJ_PRIVATE  = process.env.EJ_PRIVATE_KEY;

  if (!EJ_PRIVATE) {
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://mayankpriyadarshi25.github.io',
      },
      body: JSON.stringify({
        service_id:  EJ_SERVICE,
        template_id: EJ_TEMPLATE,
        user_id:     EJ_KEY,
        accessToken: EJ_PRIVATE,
        template_params: {
          from_name: sanitize(name, 100),
          reply_to:  sanitize(email, 254),
          message:   sanitize(msg, 5000),
        },
      }),
    });
    if (response.ok) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: 'Failed to send email' });
    }
  } catch {
    res.status(500).json({ success: false, error: 'Email service unavailable' });
  }
});

// Bot AI Chat — rate limited + message length capped (VULN-08)
app.post('/api/chat', chatLimiter, async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message required' });
  }
  if (message.length > 800) {
    return res.status(400).json({ error: 'Message too long (max 800 characters)' });
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.json({ reply: "I'm sorry, my AI brain isn't plugged in yet! But I can tell you Mayank is an amazing Cybersecurity student." });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mayankpriyadarshi25.github.io',
        'X-Title': 'Mayank Portfolio Bot',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: "You are Mayank's helpful hacker bot assistant on his portfolio website. You keep answers concise, friendly, and relevant to cybersecurity and his skills." },
          { role: 'user',   content: message },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API Error:', errorText);
      return res.json({ reply: 'OpenRouter rejected the request. Try again in a moment!' });
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      res.json({ reply: data.choices[0].message.content });
    } else {
      res.json({ reply: 'My circuits are feeling a bit clogged right now!' });
    }
  } catch {
    res.json({ reply: 'Glitch in the matrix! Connection failed.' });
  }
});

// ── Connect to MongoDB then start server ──────────────────────────────────────
if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI is not set in .env');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET (or TOKEN) is not set in .env');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected.');
    newsAutomator.initNewsCron(NewsItem);
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

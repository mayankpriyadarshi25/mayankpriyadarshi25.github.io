const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const TOKEN = process.env.TOKEN;

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return {};
}

app.get('/api/all', (req, res) => {
  res.json(loadData());
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, token: TOKEN });
  } else {
    res.status(401).json({ success: false, error: 'Invalid username or password' });
  }
});

app.post('/api/data', (req, res) => {
  const token = req.headers.authorization;
  if (token !== TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const { key, value } = req.body;
  const data = loadData();
  data[key] = value;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, msg } = req.body;
  if (!name || !email || !msg) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const EJ_SERVICE = process.env.EJ_SERVICE;
  const EJ_TEMPLATE = process.env.EJ_TEMPLATE;
  const EJ_KEY = process.env.EJ_KEY;

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EJ_SERVICE,
        template_id: EJ_TEMPLATE,
        user_id: EJ_KEY,
        template_params: {
          from_name: name,
          reply_to: email,
          message: msg
        }
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const ADMIN_USER = process.env.ADMIN_USER || 'mayank';
const ADMIN_PASS = process.env.ADMIN_PASS || 'mayank';
const TOKEN = process.env.TOKEN || 'secret-portfolio-token-2026';

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

router.post('/', async (req, res) => {
  try {
    const body = req.body;

    const response = await fetch('https://YOUR-EXTERNAL-MOODBOARD-API.com/endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MOODBOARD_API_KEY}` // Example if your external API needs auth
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Moodboard proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy moodboard API' });
  }
});

module.exports = router;

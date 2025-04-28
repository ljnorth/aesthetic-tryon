const express = require('express');
const router = express.Router();
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');

const upload = multer({ storage: multer.memoryStorage() }); // Store uploads in memory

router.post('/', upload.array('images'), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one image file is required.' });
    }

    // HARD CODED PROMPT
    const prompt = "Create an outfit moodboard featuring the following items. Keep the layout aesthetic and fashion-forward.";

    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', prompt);

    // Attach each uploaded image
    files.forEach((file) => {
      formData.append('image[]', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
    });

    const openaiResponse = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const openaiData = await openaiResponse.json();

    if (!openaiData.data || !openaiData.data[0] || !openaiData.data[0].b64_json) {
      console.error('OpenAI Edit API returned unexpected data:', openaiData);
      return res.status(500).json({ error: 'Failed to generate moodboard image' });
    }

    const moodboardBase64 = openaiData.data[0].b64_json;

    res.status(200).json({
      base64Image: moodboardBase64
    });

  } catch (error) {
    console.error('Moodboard generation error:', error);
    res.status(500).json({ error: 'Server error generating moodboard' });
  }
});

module.exports = router;

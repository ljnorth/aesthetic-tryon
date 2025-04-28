const express = require('express');
const cors = require('cors');
const moodboardRoute = require('./routes/moodboard');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // To parse incoming JSON bodies

// Mount routes
app.use('/api/moodboard', moodboardRoute);

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

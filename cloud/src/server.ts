// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   Vidsync Cloud Server             ║
║   Listening on port ${PORT}           ║
╚════════════════════════════════════╝
  `);
});

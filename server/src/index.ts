import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import brandSafetyRoutes from './brandSafety/brandSafetyRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/brand-safety', brandSafetyRoutes);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

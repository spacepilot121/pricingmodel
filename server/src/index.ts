import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import brandSafetyRoutes from './brandSafety/brandSafetyRoutes.js';
import influencersClubRoutes from './influencersClub/influencersClubRoutes.js';


const app = express();
const port = process.env.PORT || 4000;

const allowedOrigins=(process.env.ALLOWED_ORIGINS || 'https://spacepilot121.github.io,http://localhost:5173').split(',').map(value=>value.trim());
app.use(cors({origin:allowedOrigins,methods:['GET','POST','OPTIONS'],allowedHeaders:['Authorization','Content-Type']}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/brand-safety', brandSafetyRoutes);
app.use('/api/influencers-club', influencersClubRoutes);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});


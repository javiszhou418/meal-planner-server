import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import { testConnection } from './db/connection';
import mealRoutes from './routes/meals';
import dishRoutes from './routes/dishes';
import logRoutes  from './routes/log';
import { scheduleDailyDiscovery } from './services/dishDiscoveryService';
import { regenerateAllImages } from './services/imageService';
import { pregenerateAllThumbnails, clearThumbnails } from './services/thumbnailService';
const app  = express();
const PORT = process.env.PORT ?? 3000;

// CORS 配置 - 允许所有来源
app.use(cors({ 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Helmet 配置 - 禁用 CSP 限制图片加载
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(express.json());
// 提供静态图片资源 - 优先从项目根目录的 assets 读取
const assetsPath = path.resolve(__dirname, '../../assets');
app.use('/assets', express.static(assetsPath, {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true,
}));
console.log('[Server] Serving assets from:', assetsPath);

// Cache control headers for better performance
app.use('/assets/dishes', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
  next();
});
app.use('/assets/thumbnails', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days for thumbnails
  next();
});
app.use('/api/meals',  mealRoutes);
app.use('/api/dishes', dishRoutes);
app.use('/api/log',    logRoutes);
app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.post('/admin/regenerate-images', (_, res) => {
  res.json({ message: 'Regenerating all dish images. Check server logs for progress.' });
  regenerateAllImages().catch(err => console.error('[admin] regenerate failed:', err));
});

app.post('/admin/regenerate-thumbnails', async (_, res) => {
  res.json({ message: 'Regenerating all thumbnails. Check server logs for progress.' });
  pregenerateAllThumbnails().catch(err => console.error('[admin] thumbnail regen failed:', err));
});

app.post('/admin/clear-thumbnails', async (_, res) => {
  await clearThumbnails();
  res.json({ message: 'All thumbnails cleared.' });
});
app.use((_, res) => res.status(404).json({ error: 'Not found' }));
app.use((err: Error, _req: any, res: any, _next: any) => { console.error('[Unhandled]', err); res.status(500).json({ error: 'Internal server error' }); });
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🍚 Server running on port ${PORT}`);
  // Test DB connection after startup (don't block server from starting)
  testConnection()
    .then(() => scheduleDailyDiscovery())
    .catch(err => console.error('[DB] Connection failed on startup:', err.message));
});

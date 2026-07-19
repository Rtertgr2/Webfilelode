const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDb, getAllFiles, getFileById, insertFile, deleteFile } = require('./database');

function fixEncoding(str) {
  try {
    const bytes = Buffer.from(str, 'latin1');
    const decoded = bytes.toString('utf8');
    const hasThai = /[\u0E00-\u0E7F]/.test(decoded);
    return hasThai ? decoded : str;
  } catch {
    return str;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

// Detect if running behind cloudflared tunnel
const IS_TUNNEL = process.env.TUNNEL === '1' || process.argv.includes('--tunnel');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

app.use((req, res, next) => {
  // Don't set keep-alive when behind cloudflared — it manages connections itself
  if (!IS_TUNNEL) {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=300, max=1000');
  }

  // Handle abrupt client disconnections gracefully
  req.on('aborted', () => {
    console.warn(`[WARN] Request aborted: ${req.method} ${req.url}`);
  });
  res.on('close', () => {
    if (!res.writableFinished) {
      console.warn(`[WARN] Response closed before finish: ${req.method} ${req.url}`);
    }
  });

  next();
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/files', (req, res) => {
  try {
    const files = getAllFiles();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', (req, res, next) => {
  // Handle multer upload with abort awareness
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (req.aborted) {
        console.warn('[WARN] Upload aborted by client');
        return;
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large (max 500MB)' });
      }
      return res.status(500).json({ error: err.message });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const id = insertFile({
      filename: req.file.filename,
      original_name: fixEncoding(req.file.originalname),
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const file = getFileById(id);
    res.status(201).json(file);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.get('/api/files/:id/download', (req, res) => {
  try {
    const file = getFileById(Number(req.params.id));
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadsDir, file.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const encodedName = encodeURIComponent(file.original_name);

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');

    // Use streaming instead of sendFile for better tunnel compatibility
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      console.error('[ERROR] File stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'File read error' });
      }
    });
    req.on('aborted', () => {
      console.warn('[WARN] Download aborted by client:', file.original_name);
      stream.destroy();
    });
    stream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.delete('/api/files/:id', (req, res) => {
  try {
    const file = deleteFile(Number(req.params.id));
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json({ message: 'File deleted', file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (IS_TUNNEL) {
    console.log('Tunnel mode enabled — keep-alive headers disabled');
  }
});

// Increase timeouts for large file operations
server.keepAliveTimeout = IS_TUNNEL ? 120000 : 300000;
server.headersTimeout = IS_TUNNEL ? 125000 : 300000;
server.requestTimeout = 0; // Disable request timeout for large uploads
server.timeout = 0;        // Disable socket timeout

initDb().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
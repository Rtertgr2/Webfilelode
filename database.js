const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'files.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = {
  getAllFiles() {
    return db.prepare('SELECT * FROM files ORDER BY upload_date DESC').all();
  },

  getFileById(id) {
    return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  },

  insertFile({ filename, original_name, mimetype, size }) {
    const stmt = db.prepare(
      'INSERT INTO files (filename, original_name, mimetype, size) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(filename, original_name, mimetype, size);
    return result.lastInsertRowid;
  },

  deleteFile(id) {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (file) {
      const filePath = path.join(uploadsDir, file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.prepare('DELETE FROM files WHERE id = ?').run(id);
    }
    return file;
  }
};

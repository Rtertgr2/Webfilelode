const initSqlJs = require('sql.js');
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

const dbPath = path.join(dataDir, 'files.db');
let db = null;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  saveDb();
}

function getAllFiles() {
  const results = db.exec('SELECT * FROM files ORDER BY upload_date DESC');
  if (results.length === 0) return [];
  const cols = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function getFileById(id) {
  const stmt = db.prepare('SELECT * FROM files WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function insertFile({ filename, original_name, mimetype, size }) {
  db.run(
    'INSERT INTO files (filename, original_name, mimetype, size) VALUES (?, ?, ?, ?)',
    [filename, original_name, mimetype, size]
  );
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  saveDb();
  return id;
}

function deleteFile(id) {
  const file = getFileById(id);
  if (file) {
    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    db.run('DELETE FROM files WHERE id = ?', [id]);
    saveDb();
  }
  return file;
}

module.exports = { initDb, getAllFiles, getFileById, insertFile, deleteFile };

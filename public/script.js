const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filesList = document.getElementById('filesList');
const emptyState = document.getElementById('emptyState');
const fileCount = document.getElementById('fileCount');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const toast = document.getElementById('toast');

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getFileCategory(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.includes('pdf') || mimetype.includes('document') || mimetype.includes('text')) return 'document';
  if (mimetype.includes('zip') || mimetype.includes('archive') || mimetype.includes('compressed')) return 'archive';
  return 'other';
}

function getFileExtLabel(mimetype) {
  const map = {
    'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/gif': 'GIF',
    'image/webp': 'WEBP', 'image/svg+xml': 'SVG',
    'video/mp4': 'MP4', 'video/webm': 'WEBM', 'video/quicktime': 'MOV',
    'audio/mpeg': 'MP3', 'audio/wav': 'WAV', 'audio/ogg': 'OGG',
    'application/pdf': 'PDF',
    'application/zip': 'ZIP', 'application/x-rar': 'RAR',
    'text/plain': 'TXT', 'text/html': 'HTML',
  };
  return map[mimetype] || mimetype.split('/')[1]?.toUpperCase() || 'FILE';
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = 'toast ' + type;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function renderFiles(files) {
  if (files.length === 0) {
    emptyState.hidden = false;
    fileCount.textContent = '0 ไฟล์';
    return;
  }

  emptyState.hidden = true;
  fileCount.textContent = files.length + ' ไฟล์';

  const html = files.map(f => {
    const cat = getFileCategory(f.mimetype);
    const label = getFileExtLabel(f.mimetype);
    return `
      <div class="file-item" data-id="${f.id}">
        <div class="file-icon ${cat}">${label}</div>
        <div class="file-info">
          <div class="file-name" title="${f.original_name}">${f.original_name}</div>
          <div class="file-meta">${formatSize(f.size)} · ${formatDate(f.upload_date)}</div>
        </div>
        <div class="file-actions">
          <a class="btn btn-download" href="/api/files/${f.id}/download">ดาวน์โหลด</a>
          <button class="btn btn-delete" onclick="deleteFile(${f.id})">ลบ</button>
        </div>
      </div>`;
  }).join('');

  filesList.innerHTML = html;
}

async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    const files = await res.json();
    renderFiles(files);
  } catch (err) {
    showToast('ไม่สามารถโหลดไฟล์ได้', 'error');
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  progressContainer.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = '0%';

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + '%';
      }
    };

    await new Promise((resolve, reject) => {
      xhr.onload = () => {
        if (xhr.status === 201) {
          resolve();
        } else {
          reject(new Error('Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(formData);
    });

    showToast('อัปโหลดสำเร็จ: ' + file.name);
    await loadFiles();
  } catch (err) {
    showToast('อัปโหลดล้มเหลว', 'error');
  } finally {
    setTimeout(() => {
      progressContainer.hidden = true;
    }, 500);
  }
}

async function deleteFile(id) {
  if (!confirm('ต้องการลบไฟล์นี้จริงๆ ใช่ไหม?')) return;

  try {
    const res = await fetch('/api/files/' + id, { method: 'DELETE' });
    if (res.ok) {
      showToast('ลบไฟล์สำเร็จ');
      await loadFiles();
    } else {
      showToast('ไม่สามารถลบไฟล์ได้', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  for (const file of files) {
    uploadFile(file);
  }
});

fileInput.addEventListener('change', () => {
  for (const file of fileInput.files) {
    uploadFile(file);
  }
  fileInput.value = '';
});

loadFiles();

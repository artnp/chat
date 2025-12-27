// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDbey3w2Pd3WsFxEBs1uMYr_mNhSMZaO9c",
    authDomain: "chat-11059.firebaseapp.com",
    projectId: "chat-11059",
    messagingSenderId: "488357665824",
    appId: "1:488357665824:web:717a7be19945cc2462b045",
    databaseURL: "https://chat-11059-default-rtdb.asia-southeast1.firebasedatabase.app"
};

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, push, onChildAdded, onChildRemoved, query, orderByChild, limitToLast, remove, get } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// State
let currentRoom = null;
let currentUser = 'User_' + Math.floor(Math.random() * 1000);
const DELETION_TIME_MS = 10 * 60 * 1000; // 10 minutes
const SMALL_MAX_SIZE = 3 * 1024 * 1024; // 3MB

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const startBtn = document.getElementById('startBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesWrapper = document.getElementById('messagesWrapper');
const shareLinkText = document.getElementById('shareLinkText');
const copyBtn = document.getElementById('copyBtn');
const chatDropZone = document.getElementById('chatDropZone');
const inputAttachBtn = document.getElementById('inputAttachBtn');
const mainFileInput = document.getElementById('mainFileInput');
const sidebarDropZone = document.getElementById('sidebarDropZone');
const sidebarFileInput = document.getElementById('sidebarFileInput');
const sidebarStatus = document.getElementById('sidebarStatus');
const sidebarProgressBar = document.getElementById('sidebarProgressBar');
const sidebarProgress = document.getElementById('sidebarProgress');
const notifyBtn = document.getElementById('notifyBtn');

// Sound for notification
const NOTIFY_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
const notifyAudio = new Audio(NOTIFY_SOUND_URL);

// ===== Initialization & Navigation =====
function generateRoomId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function getRoomIdFromURL() {
    return new URLSearchParams(window.location.search).get('room');
}

function joinRoom(roomId) {
    currentRoom = roomId;
    window.history.pushState({}, '', '?room=' + roomId);
    shareLinkText.textContent = window.location.href;

    loginScreen.classList.remove('active');
    chatScreen.classList.add('active');

    initChatListeners();
}

startBtn.addEventListener('click', () => joinRoom(generateRoomId()));

window.addEventListener('load', () => {
    const rid = getRoomIdFromURL();
    if (rid) joinRoom(rid);
});

// ===== Large File Upload Logic (Cloud) =====
async function uploadToCloud(file) {
    if (!file) return;

    sidebarStatus.textContent = 'กำลังเตรียมไฟล์: ' + (file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name);
    sidebarProgressBar.style.display = 'block';
    sidebarProgress.style.width = '0%';

    try {
        const form = new FormData();
        form.append('files', file);
        form.append('expiryHours', 1);

        const res = await fetch('https://tempfile.org/api/upload/local', {
            method: 'POST',
            body: form
        });

        const data = await res.json();

        if (data.success) {
            const fileId = data.files[0].id;
            const downloadUrl = `https://tempfile.org/${fileId}`;
            const previewUrl = file.type.startsWith('image/') ? `https://tempfile.org/api/download/${fileId}` : downloadUrl;

            sidebarStatus.textContent = 'ส่งสำเร็จ!';
            sidebarProgress.style.width = '100%';

            // ส่งข้อมูลไฟล์ไปยัง Firebase
            sendMessage(`🔗 ดาวน์โหลด: ${downloadUrl}`, {
                name: file.name,
                type: file.type,
                data: previewUrl,
                shortUrl: downloadUrl,
                isExternal: true
            });

            setTimeout(() => {
                sidebarStatus.textContent = '';
                sidebarProgressBar.style.display = 'none';
                sidebarProgress.style.width = '0%';
            }, 3000);
        } else {
            sidebarStatus.textContent = 'ล้มเหลว: ' + (data.message || 'Error');
        }
    } catch (err) {
        console.error(err);
        sidebarStatus.textContent = 'ข้อผิดพลาดการเชื่อมต่อ';
    }
}

// Sidebar Upload Listeners
sidebarDropZone.onclick = () => sidebarFileInput.click();
sidebarFileInput.onchange = (e) => uploadToCloud(e.target.files[0]);

sidebarDropZone.ondragover = (e) => {
    e.preventDefault();
    sidebarDropZone.classList.add('active');
};
sidebarDropZone.ondragleave = () => sidebarDropZone.classList.remove('active');
sidebarDropZone.ondrop = (e) => {
    e.preventDefault();
    sidebarDropZone.classList.remove('active');
    if (e.dataTransfer.files.length > 0) uploadToCloud(e.dataTransfer.files[0]);
};

// ===== Chat Functions =====
function initChatListeners() {
    const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
    const q = query(messagesRef, orderByChild('timestamp'), limitToLast(50));

    onChildAdded(q, (snapshot) => {
        const data = snapshot.val();
        renderMessage(data, snapshot.key);

        // Play sound if it's a notification and not from me
        if (data.type === 'notification' && data.sender !== currentUser) {
            notifyAudio.play().catch(e => console.log('Autoplay blocked:', e));
        }
    });

    onChildRemoved(messagesRef, (snapshot) => {
        const el = document.querySelector(`[data-id="${snapshot.key}"]`);
        if (el) el.remove();
    });

    // Cleanup Loop
    setInterval(async () => {
        const snap = await get(messagesRef);
        if (snap.exists()) {
            const now = Date.now();
            snap.forEach((child) => {
                if (now - child.val().timestamp > DELETION_TIME_MS) {
                    remove(ref(database, `rooms/${currentRoom}/messages/${child.key}`));
                }
            });
        }
    }, 60000);

    // Countdown UI Update Loop
    setInterval(updateCountdowns, 1000);
}

function renderMessage(data, id) {
    if (document.querySelector(`[data-id="${id}"]`)) return;

    const div = document.createElement('div');
    const isMe = data.sender === currentUser;

    // Special handle for notification type
    if (data.type === 'notification') {
        div.className = 'message-notification';
        div.innerHTML = `🔔 คู่สนทนาเรียกคุณ...`;
        messagesWrapper.appendChild(div);
        scrollToBottom();
        return;
    }

    div.className = `message-bubble ${isMe ? 'me' : 'other'}`;
    div.setAttribute('data-id', id);
    div.setAttribute('data-timestamp', data.timestamp);

    let contentHTML = '';

    // Check for files (handles both Base64 and External URLs)
    if (data.file) {
        const isImage = data.file.type && data.file.type.startsWith('image/');
        const fileUrl = data.file.data;
        const linkUrl = data.file.shortUrl || fileUrl;

        if (isImage) {
            contentHTML += `
                <div class="message-media-container" onclick="forceDownload('${linkUrl}', '${data.file.name}')">
                    <img src="${fileUrl}" class="message-img" alt="Image" onerror="handleImgError(this, '${linkUrl}', '${data.file.name}')">
                    <div class="download-overlay">คลิกเพื่อดาวน์โหลด</div>
                </div>
            `;
        } else {
            contentHTML += `
                <a href="javascript:void(0)" onclick="forceDownload('${linkUrl}', '${data.file.name}')" class="file-link">
                    <span>📎 ${data.file.name}</span>
                </a>
            `;
        }
    }

    if (data.text) {
        // Detect URLs and make them clickable (except for the ones we already handled as file media)
        let text = sanitize(data.text);
        text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--accent); text-decoration:underline;">$1</a>');
        contentHTML += `<div class="text-content" style="white-space: pre-wrap;">${text}</div>`;
    }

    contentHTML += `
        <div class="message-meta">
            <span>ทำลายภายใน </span><span class="countdown">--:--</span>
        </div>
    `;

    div.innerHTML = contentHTML;
    messagesWrapper.appendChild(div);
    scrollToBottom();
}

// Global error handler for images that fail to load
window.handleImgError = function (img, linkUrl, filename) {
    const container = img.closest('.message-media-container');
    if (container) {
        // Replace container with a simple file link
        const alias = document.createElement('a');
        alias.href = 'javascript:void(0)';
        alias.className = 'file-link';
        alias.onclick = () => forceDownload(linkUrl, filename);
        alias.innerHTML = `<span>📎 ${filename} (ดูภาพไม่ได้ - คลิกเพื่อเปิด)</span>`;
        container.parentNode.insertBefore(alias, container);
        container.remove();
    }
};

// Function to force download when clicked
window.forceDownload = function (url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    // For external URLs that might not support download attribute directly, 
    // we open in a new tab if it's a URL, or use the link hack for Base64.
    if (url.startsWith('http')) {
        // Tempfile might need some handling or just direct link
        window.open(url, '_blank');
    } else {
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

function updateCountdowns() {
    const now = Date.now();
    document.querySelectorAll('.message-bubble').forEach(el => {
        const timestamp = parseInt(el.getAttribute('data-timestamp'));
        const remaining = DELETION_TIME_MS - (now - timestamp);
        const timerEl = el.querySelector('.countdown');

        if (remaining <= 0) {
            timerEl.textContent = 'ลบแล้ว';
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    });
}

async function sendMessage(text = null, fileData = null) {
    if (!text && !fileData) return;
    if (!currentRoom) return;

    const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
    await push(messagesRef, {
        sender: currentUser,
        text: text,
        file: fileData,
        timestamp: Date.now()
    });
}

sendBtn.onclick = async () => {
    const val = messageInput.value.trim();
    if (val) {
        await sendMessage(val);
        messageInput.value = '';
        messageInput.style.height = 'auto';
    }
};

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// ===== Notification Logic =====
notifyBtn.onclick = async () => {
    if (!currentRoom) return;

    // Play locally too
    notifyAudio.play().catch(e => console.log('Audio error:', e));

    const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
    await push(messagesRef, {
        sender: currentUser,
        type: 'notification',
        timestamp: Date.now()
    });

    // Simple cooldown
    notifyBtn.disabled = true;
    notifyBtn.style.opacity = '0.5';
    setTimeout(() => {
        notifyBtn.disabled = false;
        notifyBtn.style.opacity = '1';
    }, 5000);
};

// ===== Consolidated Upload Logic =====
function handleFileUpload(file) {
    if (!currentRoom) {
        alert('กรุณาเข้าร่วมห้องแชทก่อน');
        return;
    }

    if (file.size <= SMALL_MAX_SIZE) {
        // Use normal Base64 method
        const reader = new FileReader();
        reader.onload = (e) => {
            sendMessage(null, {
                name: file.name,
                type: file.type,
                data: e.target.result
            });
        };
        reader.readAsDataURL(file);
    } else {
        // Delegate to Cloud Upload
        alert('ไฟล์มีขนาดใหญ่ (>3MB) ระบบกำลังอัพโหลดผ่านเซิร์ฟเวอร์สำรอง...');
        uploadToCloud(file);
    }
}

// Attachment button near textarea
inputAttachBtn.onclick = () => mainFileInput.click();
mainFileInput.onchange = (e) => {
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
    mainFileInput.value = '';
};

// ===== Drag & Drop Logic =====
let dragCounter = 0;
chatDropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    chatDropZone.classList.add('dragging');
});

chatDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
});

chatDropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) chatDropZone.classList.remove('dragging');
});

chatDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    chatDropZone.classList.remove('dragging');

    if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
    }
});

// ===== Utilities =====
function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLinkText.textContent);
    const orig = copyBtn.textContent;
    copyBtn.textContent = 'คัดลอกแล้ว!';
    setTimeout(() => copyBtn.textContent = orig, 2000);
});

messageInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
});

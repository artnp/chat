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
const notifyBtn = document.getElementById('notifyBtn');

// Large Upload Modal Elements
const uploadModal = document.getElementById('uploadModal');
const modalFileName = document.getElementById('modalFileName');
const modalProgressBar = document.getElementById('modalProgressBar');
const modalStatus = document.getElementById('modalStatus');

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
    if (rid) {
        joinRoom(rid);
    } else {
        // อัตโนมัติสร้างห้องใหม่ทันทีถ้าไม่มี Room ID ใน URL
        joinRoom(generateRoomId());
    }
});

// ===== Large File Upload Logic (Cloud) =====
async function uploadToCloud(file) {
    if (!file) return;

    // Setup Modal UI
    modalFileName.textContent = file.name;
    modalProgressBar.style.width = '0%';
    modalStatus.textContent = '0%';
    uploadModal.classList.add('active');

    const isImage = file.type.startsWith('image/');

    // Helper for XHR Upload
    const tryUpload = (url, formData, isLitterbox = false) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);

            // Progress Tracking
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    modalProgressBar.style.width = percent + '%';
                    modalStatus.textContent = percent + '%';
                }
            };

            xhr.onload = function () {
                if (xhr.status === 200) {
                    if (isLitterbox) {
                        const resultUrl = xhr.responseText.trim();
                        if (resultUrl.startsWith('http')) {
                            resolve({ downloadUrl: resultUrl, previewUrl: resultUrl });
                        } else {
                            reject(new Error('Litterbox response invalid'));
                        }
                    } else {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (data.success) {
                                const fileId = data.files[0].id;
                                const downloadUrl = `https://tempfile.org/${fileId}`;
                                const previewUrl = isImage ? `https://tempfile.org/api/download/${fileId}` : downloadUrl;
                                resolve({ downloadUrl, previewUrl });
                            } else {
                                reject(new Error(data.message || 'Empty response'));
                            }
                        } catch (e) {
                            reject(new Error('JSON Parse Error'));
                        }
                    }
                } else {
                    reject(new Error('Status ' + xhr.status));
                }
            };

            xhr.onerror = () => reject(new Error('Network Error'));
            xhr.send(formData);
        });
    };

    try {
        let result = null;

        // 1. ลอง Litterbox เป็นหลักสำหรับทุกไฟล์ (ผ่าน CORS Proxy)
        const litterboxData = new FormData();
        litterboxData.append('reqtype', 'fileupload');
        litterboxData.append('time', '1h');
        litterboxData.append('fileToUpload', file);

        const LITTERBOX_API = 'https://litterbox.catbox.moe/resources/internals/api.php';
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(LITTERBOX_API)}`;

        try {
            result = await tryUpload(proxyUrl, litterboxData, true);
        } catch (err) {
            console.warn('Litterbox upload failed, falling back to Tempfile...', err);
            modalProgressBar.style.width = '0%';
            modalStatus.textContent = 'ระบบหลักขัดข้อง... กำลังลองอัปโหลดสำรอง';
        }

        // 2. ถ้า Litterbox ล้มเหลว ให้ใช้ Tempfile เป็นตัวสำรอง (สำหรับทุกไฟล์)
        if (!result) {
            const tempfileData = new FormData();
            tempfileData.append('files', file);
            tempfileData.append('expiryHours', 1);

            result = await tryUpload('https://tempfile.org/api/upload/local', tempfileData, false);
        }

        if (result) {
            sendMessage(`🔗 ดาวน์โหลด: ${result.downloadUrl}`, {
                name: file.name,
                type: file.type,
                data: result.previewUrl,
                shortUrl: result.downloadUrl,
                isExternal: true
            });

            // Close Modal
            setTimeout(() => {
                uploadModal.classList.remove('active');
            }, 800);
        }
    } catch (err) {
        console.error(err);
        alert('อัปโหลดล้มเหลว: ' + err.message);
        uploadModal.classList.remove('active');
    }
}

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
                    <div class="message-image-icon" onclick="openCropTool('${linkUrl}', event)">
                        <img src="https://cdn-icons-png.flaticon.com/128/11771/11771746.png" alt="Crop" style="width: 18px; height: 18px; filter: invert(1);">
                    </div>
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
        // Strict match: message must be ONLY "xxxบาท" or "xxx บาท" from start to end
        const strictPriceMatch = data.text.trim().match(/^(\d+(?:\.\d{1,2})?)\s*บาท$/);

        if (strictPriceMatch) {
            // It's ONLY the price: Show only QR Code
            const amount = strictPriceMatch[1];
            contentHTML += `
                <div class="promptpay-container" style="margin-top: 12px; border-radius: 12px; overflow: hidden; background: #fff; padding: 15px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                    <div style="color: #1a1a1a; font-weight: 600; font-size: 0.85rem; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <span>💵พร้อมเพย์ :</span><span style="color: #0046b8; font-size: 1rem;">${amount} บาท</span>
                    </div>
                    <img src="https://promptpay.io/0988573074/${amount}.png" style="width: 100%; max-width: 180px; height: auto; display: block; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 4px;" alt="PromptPay QR Code">
                    <div style="font-size: 0.60rem; color: #666;">ID: 0988573074</div>
                    <div style="margin-top: 8px; font-size: 0.65rem; color: #666;">สแกนเพื่อชำระเงินได้ทันที</div>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 12px 10px;">
                    <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; padding-bottom: 5px;">
                        <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/KBANK.png" style="width: 18px; height: 18px; border-radius: 4px;" alt="KBANK">
                        <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/SCB.png" style="width: 18px; height: 18px; border-radius: 4px;" alt="SCB">
                        <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/BBL.png" style="width: 18px; height: 18px; border-radius: 4px;" alt="BBL">
                        <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/KTB.png" style="width: 18px; height: 18px; border-radius: 4px;" alt="KTB">
                        <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/BAY.png" style="width: 18px; height: 18px; border-radius: 4px;" alt="BAY">
                        <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/TTB.png" style="width: 18px; height: 18px; border-radius: 4px;" alt="TTB">
                        <img src="https://raw.githubusercontent.com/casperstack/thai-banks-logo/master/icons/GSB.png" style="width: 18px; height: 18px; border-radius: 4px;" alt="GSB">
                    </div>
                </div>
            `;
        } else {
            // Regular message: Show text and URL links
            let text = sanitize(data.text);
            text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--accent); text-decoration:underline;">$1</a>');
            contentHTML += `<div class="text-content" style="white-space: pre-wrap;">${text}</div>`;
        }
    }

    contentHTML += `
        <div class="message-meta">
            <span>ทำลายทิ้งใน </span><span class="countdown">--:--</span>
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

// DOM Elements for Crop Modal
const cropModal = document.getElementById('cropModal');
const cropIframe = document.getElementById('cropIframe');
const closeCropModal = document.getElementById('closeCropModal');

// Function to open crop tool (cutpdf.html) in an in-page modal
window.openCropTool = function (url, event) {
    if (event) event.stopPropagation();

    let targetUrl = '';
    // If it's a Base64 string (starts with data:), it might be too long for a URL
    if (url.startsWith('data:')) {
        try {
            sessionStorage.setItem('cropImageData', url);
            targetUrl = `cutpdf.html?source=session`;
        } catch (e) {
            console.error('Failed to save to sessionStorage:', e);
            targetUrl = `cutpdf.html?imgUrl=${encodeURIComponent(url.substring(0, 1000))}...`;
            alert('ไฟล์มีขนาดใหญ่เกินไปสำหรับการอัพโหลดแบบ Modal');
        }
    } else {
        targetUrl = `cutpdf.html?imgUrl=${encodeURIComponent(url)}`;
    }

    // Set iframe source and show modal
    cropIframe.src = targetUrl;
    cropModal.classList.add('active');
};

// Close Modal logic
if (closeCropModal) {
    closeCropModal.onclick = () => {
        cropModal.classList.remove('active');
        cropIframe.src = 'about:blank'; // Clear iframe to stop processes
    };
}

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
        // Delegate to Cloud Upload with UI
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

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
import { getDatabase, ref, push, onChildAdded, onChildRemoved, query, orderByChild, limitToLast, remove, get, set, onValue, onDisconnect as fbOnDisconnect } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// State
let currentRoom = null;
let currentUser = 'User_' + Math.floor(Math.random() * 1000);
const DELETION_TIME_MS = 10 * 60 * 1000; // 10 minutes
const SMALL_MAX_SIZE = 3 * 1024 * 1024; // 3MB
let pendingImageData = null; // Store pasted image data

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
const micBtn = document.getElementById('micBtn');

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
    const searchParams = new window.URLSearchParams(window.location.search);
    searchParams.set('room', roomId);
    window.history.pushState({}, '', '?' + searchParams.toString());
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

    // Listen for Voice Broadcast Offers
    const voiceOfferRef = ref(database, `rooms/${currentRoom}/voice/offer`);
    onValue(voiceOfferRef, (snap) => {
        const offerData = snap.val();
        if (offerData && offerData.sdp) {
            startListening(offerData);
        } else {
            // Offer removed, stop listening
            stopListening();
        }
    });
}

function renderMessage(data, id) {
    if (document.querySelector(`[data-id="${id}"]`)) return;

    const div = document.createElement('div');
    const isMe = data.sender === currentUser;

    // Special handle for notification type
    if (data.type === 'notification') {
        div.className = 'message-notification';
        if (data.text === '🔊') {
            div.innerHTML = `👽 กำลังถ่ายทอดเสียงสด...`;
            div.style.background = 'rgba(168, 85, 247, 0.15)';
            div.style.color = '#c084fc';
        } else if (data.text === '🔇') {
            div.innerHTML = `🏁 สิ้นสุดการถ่ายทอดเสียงสด`;
            div.style.background = 'rgba(239, 68, 68, 0.15)';
            div.style.color = '#ef4444';
        } else {
            div.innerHTML = `🔔 คู่สนทนาเรียกคุณ...`;
        }
        messagesWrapper.appendChild(div);
        scrollToBottom();
        return;
    }

    div.className = `message-bubble ${isMe ? 'me' : 'other'}`;
    div.setAttribute('data-id', id);
    div.setAttribute('data-timestamp', data.timestamp);

    let contentHTML = '';

    if (data.file) {
        const isImage = data.file.type && data.file.type.startsWith('image/');
        const isAudio = data.file.type && data.file.type.startsWith('audio/');
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
        } else if (isAudio) {
            contentHTML += `
                <div style="margin-top: 5px; border-radius: 20px; overflow: hidden; background: rgba(0,0,0,0.05); padding: 5px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">
                    <audio controls src="${fileUrl}" style="max-width: 100%; height: 35px; outline: none;"></audio>
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
                    <div class="qr-container" onclick="downloadQRCode('https://promptpay.io/0988573074/${amount}.png', '${amount}')" title="คลิกเพื่อบันทึก QR Code">
                        <img src="https://promptpay.io/0988573074/${amount}.png" class="qr-image" alt="PromptPay QR Code">
                        <div class="qr-download-overlay">
                            <div class="qr-download-icon">
                                <img src="https://cdn-icons-png.flaticon.com/128/4196/4196713.png" style="width: 24px; height: 24px;" alt="Save">
                            </div>
                        </div>
                    </div>
                    <div class="copyable-id" onclick="copyToClipboard('0988573074', event)" title="คลิกเพื่อคัดลอกเบอร์พร้อมเพย์">
                        <div style="font-size: 0.60rem; color: #666; font-weight: 500;">ID: <span class="copy-number">0988573074</span></div>
                    </div>
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

// Handle message from iframe (Crop Tool)
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CROP_DONE') {
        // Close Modal
        cropModal.classList.remove('active');
        cropIframe.src = 'about:blank';

        // Insert text into message input and auto-submit
        if (messageInput && sendBtn) {
            messageInput.value = event.data.text;
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';

            // Auto-submit to chat
            setTimeout(() => {
                sendBtn.click();
            }, 100);
        }
    }
});

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

    // Check if we have pending image data
    if (pendingImageData) {
        await sendMessage(val || null, pendingImageData);
        // Clear the image preview
        removeImagePreview();
    } else if (val) {
        await sendMessage(val);
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';
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
    // แสดง overlay เฉพาะเมื่อลากไฟล์เข้ามา (ไม่ใช่ข้อความ)
    if (e.dataTransfer.types.includes('Files')) {
        chatDropZone.classList.add('dragging');
    }
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
    } else {
        // รองรับลากข้อความจากแอปอื่นเข้ามาส่งในแชท
        const droppedText = e.dataTransfer.getData('text/plain');
        if (droppedText && droppedText.trim()) {
            sendMessage(droppedText.trim());
        }
    }
});

// ===== Screenshot Button =====
const screenshotBtn = document.getElementById('screenshotBtn');
if (screenshotBtn) {
    let clipboardBefore = null; // เก็บ hash ของ clipboard ก่อนแคป เพื่อตรวจว่ามีภาพใหม่จริง

    screenshotBtn.addEventListener('click', async () => {
        // จำ clipboard เดิมไว้ก่อน เพื่อเปรียบเทียบว่าได้ภาพใหม่จริง
        try {
            const beforeItems = await navigator.clipboard.read();
            for (const item of beforeItems) {
                const imgType = item.types.find(t => t.startsWith('image/'));
                if (imgType) {
                    const blob = await item.getType(imgType);
                    clipboardBefore = blob.size; // ใช้ size เป็น fingerprint
                    break;
                }
            }
        } catch (e) {
            clipboardBefore = null;
        }

        // เปิด Windows Snip & Sketch
        try {
            window.open('ms-screenclip:', '_self');
        } catch (e) { /* fallback: user กด Win+Shift+S เอง */ }

        // UI feedback
        screenshotBtn.style.opacity = '0.4';
        screenshotBtn.style.pointerEvents = 'none';

        // ดัก clipboard ทุก 500ms สูงสุด 60 วินาที เจอภาพใหม่ = ส่งทันที
        let attempts = 0;
        const clipCheck = setInterval(async () => {
            attempts++;
            if (attempts > 120) {
                clearInterval(clipCheck);
                screenshotBtn.style.opacity = '1';
                screenshotBtn.style.pointerEvents = '';
                return;
            }
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imageType = item.types.find(t => t.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        // ตรวจว่าเป็นภาพใหม่ ไม่ใช่ภาพเดิมที่อยู่ใน clipboard อยู่แล้ว
                        if (clipboardBefore !== null && blob.size === clipboardBefore) {
                            return; // ยังเป็นภาพเดิม รอต่อ
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            // ส่งเข้าแชทเลยทันที
                            sendMessage(null, {
                                name: `screenshot_${Date.now()}.png`,
                                type: imageType,
                                data: ev.target.result
                            });
                            clearInterval(clipCheck);
                            screenshotBtn.style.opacity = '1';
                            screenshotBtn.style.pointerEvents = '';
                        };
                        reader.readAsDataURL(blob);
                        clearInterval(clipCheck); // หยุด loop ทันที
                        return;
                    }
                }
            } catch (e) {
                // clipboard permission denied - ไม่เป็นไร รอ user Ctrl+V เอง
            }
        }, 500);
    });
}

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

// Auto-select text on click for convenience
messageInput.addEventListener('click', function () {
    if (this.value.length > 0) this.select();
});

shareLinkText.addEventListener('click', function () {
    const range = document.createRange();
    range.selectNodeContents(this);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
});

messageInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';

    if (this.value.trim() === '@line') {
        this.value = `ติดต่อฉันได้ที่:
=================
LINE : artap5321
https://line.me/ti/p/gqIluRmdJ_

Facebook:
https://www.facebook.com/ImageTextEditor

=================
อ่านจบแล้วปิดหน้าเว็บนี้ได้เลย!!`;
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
        setTimeout(() => sendBtn.click(), 100);
    } else if (/^(\d+(?:\.\d{1,2})?)\s*บาท$/.test(this.value.trim())) {
        setTimeout(() => sendBtn.click(), 100);
    }
});

// ===== Paste Event Handler for Images =====
messageInput.addEventListener('paste', function (e) {
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.indexOf('image') !== -1) {
            e.preventDefault();

            const file = item.getAsFile();
            if (file) {
                // Convert image to base64 and store in pendingImageData
                const reader = new FileReader();
                reader.onload = (e) => {
                    pendingImageData = {
                        name: `pasted_image_${Date.now()}.png`,
                        type: file.type,
                        data: e.target.result
                    };

                    // Show image preview in input
                    showImageInInput(e.target.result);
                };
                reader.readAsDataURL(file);
            }
            break;
        }
    }
});

// Function to display image in the input area
function showImageInInput(imageSrc) {
    // Create image preview element
    const previewContainer = document.createElement('div');
    previewContainer.className = 'image-preview-container';
    previewContainer.innerHTML = `
        <img src="${imageSrc}" class="image-preview" alt="Preview">
        <button class="remove-image-btn" onclick="removeImagePreview()">×</button>
    `;

    // Insert before the textarea
    const inputWrapper = messageInput.parentElement;
    inputWrapper.insertBefore(previewContainer, messageInput);

    // Add some visual feedback
    messageInput.placeholder = "พิมพ์ข้อความเพิ่มเติม... (กด Enter เพื่อส่ง)";
}

// Function to remove image preview
window.removeImagePreview = function () {
    const preview = document.querySelector('.image-preview-container');
    if (preview) {
        preview.remove();
        pendingImageData = null;
        messageInput.placeholder = "พิมพ์ข้อความที่นี่...";
    }
};

// Utility to copy to clipboard with toast feedback and visual selection
window.copyToClipboard = function (text, event) {
    if (event) {
        event.stopPropagation();
        // Visual selection feedback (Select only the number if .copy-number exists)
        const target = event.currentTarget;
        const numberSpan = target.querySelector('.copy-number');
        const range = document.createRange();
        range.selectNodeContents(numberSpan || target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    navigator.clipboard.writeText(text).then(() => {
        const toast = document.getElementById('copyToast');
        if (toast) {
            toast.textContent = `คัดลอกบัญชีพร้อมเพย์: ${text}`;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 2500);
        }
    }).catch(err => {
        console.error('Could not copy text: ', err);
    });
};

// Function to download QR Code image
window.downloadQRCode = async function (url, amount) {
    try {
        // Use CORS proxy to ensure we can fetch as blob for direct download
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) throw new Error('Network response was not ok');

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `PromptPay_${amount}_Baht.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    } catch (err) {
        console.warn('Proxy download failed, trying direct link as fallback...', err);
        // Direct link fallback (might still open in new tab if CORS fails)
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.download = `PromptPay_${amount}_Baht.png`;
        link.click();
    }
};

// ===== Live Voice Broadcast System (WebRTC + Alien Voice) =====

const ICE_SERVERS = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
]};

let isBroadcasting = false;
let broadcastPC = null;       // RTCPeerConnection for broadcaster
let listenerPC = null;        // RTCPeerConnection for listener
let broadcastStream = null;   // Original mic stream
let broadcastAudioCtx = null; // AudioContext for voice effects
let visualizerRAF = null;     // requestAnimationFrame ID for visualizer

// DOM elements for broadcast
const voiceListenerBar = document.getElementById('voiceListenerBar');
const remoteAudio = document.getElementById('remoteAudio');
const voiceVisualizer = document.getElementById('voiceVisualizer');

// ===== Deep Villain / Scammer Voice Effect Chain =====
function createScammerVoiceStream(stream) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    broadcastAudioCtx = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const destination = ctx.createMediaStreamDestination();

    // 1. Terrifying Monster / Kidnapper Pitch-Shifter (Extreme Ring Modulation)
    const villainOsc = ctx.createOscillator();
    villainOsc.type = 'sine';
    villainOsc.frequency.value = 30; // 30Hz creates an ultra-deep, slow, terrifying growl (Sub-bass)
    
    const ringModGain = ctx.createGain();
    ringModGain.gain.value = 0; 
    villainOsc.connect(ringModGain.gain);

    // 2. Gritty Menacing Distortion (Makes it sound evil and harsh)
    function makeGritCurve(amount) {
      const k = amount;
      const n = 44100;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; ++i ) {
        const x = i * 2 / n - 1;
        curve[i] = (3 + k) * x * 20 * (Math.PI / 180) / (Math.PI + k * Math.abs(x));
      }
      return curve;
    }
    const distortion = ctx.createWaveShaper();
    distortion.curve = makeGritCurve(25); // Heavy grit
    distortion.oversample = '2x';

    // 3. Massive Sub-Bass Boost (Makes the chest voice sound incredibly huge/inhuman)
    const bassBoost = ctx.createBiquadFilter();
    bassBoost.type = 'peaking';
    bassBoost.frequency.value = 150; // Target the lowest chest frequencies
    bassBoost.Q.value = 1.0;
    bassBoost.gain.value = 25; // EXTREME bass boost (+25dB)

    // 4. High-cut Filter (Muffles the voice to hide the original human tone entirely)
    const highCut = ctx.createBiquadFilter();
    highCut.type = 'lowpass';
    highCut.frequency.value = 1000; // Ultra dark (cuts all high pitch)

    // 5. ANTI-HOWLING Brickwall Limiter (Safety)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -20; 
    limiter.knee.value = 0; 
    limiter.ratio.value = 20; 
    limiter.attack.value = 0.001; 
    limiter.release.value = 0.1;
    
    // 6. Safe Output Volume 
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.5; 

    // Connection Chain
    source.connect(ringModGain);    // Apply Sub-bass growl
    ringModGain.connect(distortion); // Grit the growl
    distortion.connect(bassBoost);  // Make the growl massive
    bassBoost.connect(highCut);     // Darken the room
    highCut.connect(limiter);       // Squash feedback limits
    limiter.connect(masterGain);    
    masterGain.connect(destination);

    villainOsc.start(); // Start the dark engine

    return destination.stream;
}

// ===== WebRTC Signaling via Firebase =====
function getVoiceSignalRef() {
    return ref(database, `rooms/${currentRoom}/voice`);
}

async function startBroadcast() {
    if (!currentRoom) {
        alert('กรุณาเข้าร่วมห้องแชทก่อน');
        return;
    }

    try {
        // Get mic
        broadcastStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        // Apply Deep Scammer Effect
        const activeStream = createScammerVoiceStream(broadcastStream);
        
        // VITAL: Browsers suspend AudioContexts if created after `await`. Must explicitly resume!
        if (broadcastAudioCtx && broadcastAudioCtx.state === 'suspended') {
            await broadcastAudioCtx.resume().catch(() => {});
        }

        // Create peer connection
        broadcastPC = new RTCPeerConnection(ICE_SERVERS);

        // Add the pure audio track
        activeStream.getAudioTracks().forEach(track => {
            broadcastPC.addTrack(track, activeStream);
        });

        // ICE Candidates → Firebase
        broadcastPC.onicecandidate = (e) => {
            if (e.candidate) {
                const candidatesRef = ref(database, `rooms/${currentRoom}/voice/broadcasterCandidates`);
                push(candidatesRef, e.candidate.toJSON());
            }
        };

        // Create offer
        const offer = await broadcastPC.createOffer();
        await broadcastPC.setLocalDescription(offer);

        // Write offer to Firebase
        const voiceRef = getVoiceSignalRef();
        await set(ref(database, `rooms/${currentRoom}/voice/offer`), {
            type: offer.type,
            sdp: offer.sdp,
            broadcaster: currentUser,
            timestamp: Date.now()
        });

        // Auto-cleanup on disconnect
        fbOnDisconnect(voiceRef).remove();

        let listenerCandidatesQueue = [];

        // Listen for answer
        onValue(ref(database, `rooms/${currentRoom}/voice/answer`), async (snap) => {
            const answer = snap.val();
            if (answer && broadcastPC && broadcastPC.signalingState === 'have-local-offer') {
                await broadcastPC.setRemoteDescription(new RTCSessionDescription(answer));

                // Process queued listener candidates
                while(listenerCandidatesQueue.length > 0) {
                    const c = listenerCandidatesQueue.shift();
                    await broadcastPC.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                }
            }
        });

        // Listen for listener ICE candidates immediately (queue if needed)
        onChildAdded(
            query(ref(database, `rooms/${currentRoom}/voice/listenerCandidates`)),
            async (snap) => {
                if (broadcastPC) {
                    if (broadcastPC.remoteDescription) {
                        await broadcastPC.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => {});
                    } else {
                        listenerCandidatesQueue.push(snap.val());
                    }
                }
            }
        );

        // UI
        isBroadcasting = true;
        micBtn.classList.add('broadcasting');
        micBtn.innerHTML = '<span style="font-size:18px; line-height:1;">⏹️</span>';
        micBtn.title = "หยุดถ่ายทอดสด";
        document.querySelector('.dot').classList.add('broadcasting');

        // Notify in chat
        const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
        await push(messagesRef, {
            sender: currentUser,
            type: 'notification',
            text: '🔊',
            timestamp: Date.now()
        });

    } catch (err) {
        console.error('Broadcast error:', err);
        alert('ไม่สามารถเปิดไมโครโฟนได้: ' + err.message);
        stopBroadcast();
    }
}

function stopBroadcast() {
    // Close peer connection
    if (broadcastPC) {
        broadcastPC.close();
        broadcastPC = null;
    }

    // Stop mic
    if (broadcastStream) {
        broadcastStream.getTracks().forEach(t => t.stop());
        broadcastStream = null;
    }

    // Close audio context
    if (broadcastAudioCtx && broadcastAudioCtx.state !== 'closed') {
        broadcastAudioCtx.close();
        broadcastAudioCtx = null;
    }

    // Clean Firebase signaling data
    if (currentRoom) {
        remove(ref(database, `rooms/${currentRoom}/voice`)).catch(() => {});
        
        // Notify in chat that broadcast stopped explicitly
        // Only if it was currently broadcasting
        if (isBroadcasting) {
            const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
            push(messagesRef, {
                sender: currentUser,
                type: 'notification',
                text: '🔇',
                timestamp: Date.now()
            }).catch(() => {});
        }
    }

    // UI
    isBroadcasting = false;
    micBtn.classList.remove('broadcasting');
    micBtn.innerHTML = '<span style="font-size:18px; line-height:1;">📞</span>';
    micBtn.title = "ถ่ายทอดเสียงสด";
    document.querySelector('.dot').classList.remove('broadcasting');
}

// ===== Listener Side =====
function startListening(offerData) {
    // Don't listen to your own broadcast
    if (offerData.broadcaster === currentUser) return;

    // Cleanup previous listener
    if (listenerPC) {
        listenerPC.close();
        listenerPC = null;
    }

    listenerPC = new RTCPeerConnection(ICE_SERVERS);

    // Receive audio
    listenerPC.ontrack = (e) => {
        if (e.streams && e.streams[0]) {
            remoteAudio.srcObject = e.streams[0];
            
            // Explicit Autoplay Handling
            const playPromise = remoteAudio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    if (document.getElementById('voiceListenerText')) {
                        document.getElementById('voiceListenerText').innerHTML = "👽 กำลังรับเสียง...";
                        document.getElementById('voiceListenerText').style.color = "#c084fc";
                    }
                }).catch(err => {
                    console.warn("Autoplay blocked. User needs to tap.", err);
                    if (document.getElementById('voiceListenerText')) {
                        document.getElementById('voiceListenerText').innerHTML = "🔇 แตะหน้าจอบริเวณนี้เพื่อเปิดเสียง!";
                        document.getElementById('voiceListenerText').style.color = "#ef4444";
                    }
                });
            }

            // Show listener bar
            voiceListenerBar.classList.remove('hidden');

            // Start visualizer
            startVisualizer(e.streams[0]);
        }
    };

    // ICE candidates → Firebase
    listenerPC.onicecandidate = (e) => {
        if (e.candidate) {
            push(ref(database, `rooms/${currentRoom}/voice/listenerCandidates`), e.candidate.toJSON());
        }
    };

    listenerPC.onconnectionstatechange = () => {
        if (listenerPC && (listenerPC.connectionState === 'disconnected' || listenerPC.connectionState === 'failed' || listenerPC.connectionState === 'closed')) {
            stopListening();
        }
    };

    // Set remote description and create answer
    (async () => {
        try {
            await listenerPC.setRemoteDescription(new RTCSessionDescription(offerData));
            const answer = await listenerPC.createAnswer();
            await listenerPC.setLocalDescription(answer);

            await set(ref(database, `rooms/${currentRoom}/voice/answer`), {
                type: answer.type,
                sdp: answer.sdp
            });

            // Listen for broadcaster ICE candidates
            onChildAdded(
                query(ref(database, `rooms/${currentRoom}/voice/broadcasterCandidates`)),
                async (snap) => {
                    if (listenerPC && listenerPC.remoteDescription) {
                        try {
                            await listenerPC.addIceCandidate(new RTCIceCandidate(snap.val()));
                        } catch (e) { /* ignore */ }
                    }
                }
            );
        } catch (err) {
            console.error('Listener setup error:', err);
        }
    })();
}

function stopListening() {
    if (listenerPC) {
        listenerPC.close();
        listenerPC = null;
    }

    remoteAudio.srcObject = null;
    voiceListenerBar.classList.add('hidden');

    if (visualizerRAF) {
        cancelAnimationFrame(visualizerRAF);
        visualizerRAF = null;
    }

    // Clear canvas
    if (voiceVisualizer) {
        const vCtx = voiceVisualizer.getContext('2d');
        vCtx.clearRect(0, 0, voiceVisualizer.width, voiceVisualizer.height);
    }
}

// ===== Audio Visualizer (Receiver) =====
function startVisualizer(stream) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = voiceVisualizer;
    const ctx = canvas.getContext('2d');
    const barWidth = canvas.width / bufferLength;

    function draw() {
        visualizerRAF = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            const hue = 270 + (i / bufferLength) * 60; // Purple to pink
            ctx.fillStyle = `hsla(${hue}, 80%, 65%, 0.9)`;
            ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 1, barHeight);
        }
    }

    draw();
}

// ===== Watch for Voice Signals (Listener auto-detect) =====
function initVoiceListener() {
    if (!currentRoom) return;

    // Watch for new broadcast offers
    onValue(ref(database, `rooms/${currentRoom}/voice/offer`), (snap) => {
        const offerData = snap.val();
        if (offerData && offerData.broadcaster !== currentUser) {
            startListening(offerData);
        } else if (!offerData) {
            // Broadcast ended
            stopListening();
        }
    });
}

// ===== Mic Button Click Handler =====
if (micBtn) {
    micBtn.addEventListener('click', () => {
        if (isBroadcasting) {
            stopBroadcast();
        } else {
            startBroadcast();
        }
    });
}

// Hook into room join to start voice listener
const _originalJoinRoom = joinRoom;
// We need to init voice listener after joining room, override done below
// since joinRoom is called from window.load, we add a MutationObserver-style hook

// Watch for chatScreen becoming active, then init voice listener
const chatScreenObserver = new MutationObserver(() => {
    if (chatScreen.classList.contains('active') && currentRoom) {
        initVoiceListener();
        chatScreenObserver.disconnect();
    }
});
chatScreenObserver.observe(chatScreen, { attributes: true, attributeFilter: ['class'] });

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (isBroadcasting) stopBroadcast();
    if (listenerPC) stopListening();
});

// Autoplay policy bypass for listener
document.body.addEventListener('click', () => {
    if (remoteAudio && remoteAudio.paused && remoteAudio.srcObject) {
        remoteAudio.play().then(() => {
            if (voiceListenerBar && !voiceListenerBar.classList.contains('hidden') && document.getElementById('voiceListenerText')) {
                document.getElementById('voiceListenerText').innerHTML = "👽 กำลังรับเสียง (ออนไลน์)...";
                document.getElementById('voiceListenerText').style.color = "#10b981";
            }
        }).catch(()=>{});
    }
}, { capture: true });

voiceListenerBar?.addEventListener('click', () => {
    if (remoteAudio && remoteAudio.paused && remoteAudio.srcObject) {
        remoteAudio.play().then(() => {
            if (document.getElementById('voiceListenerText')) {
                document.getElementById('voiceListenerText').innerHTML = "👽 กำลังรับเสียง (ออนไลน์)...";
                document.getElementById('voiceListenerText').style.color = "#10b981";
            }
        }).catch(()=>{});
    }
});



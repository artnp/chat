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
import { getDatabase, ref, push, onChildAdded, onChildChanged, onChildRemoved, query, orderByChild, limitToLast, remove, get, set, onValue, endAt, onDisconnect as fbOnDisconnect } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// State
let currentRoom = null;
let currentUser = 'User_' + Math.floor(Math.random() * 1000);
const DELETION_TIME_MS = 10 * 60 * 1000; // 10 minutes
const SMALL_MAX_SIZE = 3 * 1024 * 1024; // 3MB
let pendingImageData = null; // Store pasted image data
let isRoomClosed = false;

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
const cancelContactBtn = document.getElementById('cancelContactBtn');
const cancelConfirmModal = document.getElementById('cancelConfirmModal');
const closeCancelModalBtn = document.getElementById('closeCancelModalBtn');
const cancelModalDismissBtn = document.getElementById('cancelModalDismissBtn');
const confirmCancelContactBtn = document.getElementById('confirmCancelContactBtn');

// Upload Progress Overlay Elements
const progressOverlay = document.getElementById('progressOverlay');
const barFile = document.getElementById('bar-file');
const percentFile = document.getElementById('percent-file');
const stepFileLabel = document.getElementById('step-file-label');
const stepFileText = document.getElementById('step-file-text');

// Sound for notification
let _notifCtx = null;
function playSoftNotification() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            if (!_notifCtx || _notifCtx.state === 'closed') {
                _notifCtx = new AudioContextClass();
            }
            const ctx = _notifCtx;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const now = ctx.currentTime;

            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(950, now);
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1250, now + 0.08);
            gain2.gain.setValueAtTime(0.12, now + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.25);
            return;
        }
    } catch (e) {
        console.warn("Web Audio API failed or blocked, falling back to Audio object", e);
    }
    try {
        const fallbackAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        fallbackAudio.volume = 0.3;
        fallbackAudio.play().catch(() => { });
    } catch (e) {
        console.error("Audio fallback failed", e);
    }
}

// === Alarm Bell Sound (for notify/bell button) ===
function playAlarmBell() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            if (!_notifCtx || _notifCtx.state === 'closed') {
                _notifCtx = new AudioContextClass();
            }
            const ctx = _notifCtx;
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;

            // Classic alarm clock: rapid "ding-ding-ding" pattern
            const bellFreqs = [2200, 1800, 2200, 1800, 2200, 1800];
            bellFreqs.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                const t = now + i * 0.12;
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.18, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + 0.09);
            });
            return;
        }
    } catch (e) {
        console.warn('Alarm bell failed', e);
    }
    playSoftNotification();
}

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

    // Handle Billing Query
    const params = new URLSearchParams(window.location.search);
    const billAmount = params.get('bill');
    const billTime = parseInt(params.get('t') || '0');
    const billKey = params.get('k');
    const lineContact = params.get('line');

    if (billAmount && billKey === 'eworker') {
        const checkAndShowBill = () => {
            if (window.paymentDone) {
                document.getElementById('billingModal').classList.remove('active');
                if (window.billTimerInterval) clearInterval(window.billTimerInterval);
                return;
            }
            const now = Date.now();
            const remaining = 10 * 60 * 1000 - (now - billTime);

            if (remaining > 0) {
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                const container = document.getElementById('billingContainer');
                if (container.innerHTML.trim() === '') {
                    container.innerHTML = `
                        <div class="promptpay-container" style="margin-top: 12px; border-radius: 12px; overflow: hidden; background: #fff; padding: 15px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                            <div style="color: #ef4444; font-weight: 600; font-size: 0.95rem; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 5px;">
                                <i class="fa-regular fa-clock"></i> <span>กรุณาโอนภายใน:</span> <span id="billTimerDisplay" style="background: rgba(239, 68, 68, 0.1); padding: 2px 6px; border-radius: 4px;">${timeStr}</span> <span>นาที</span>
                            </div>
                            <div style="color: #1a1a1a; font-weight: 600; font-size: 0.85rem; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                <span>💵พร้อมเพย์ :</span><span style="color: #0046b8; font-size: 1rem;">${billAmount} บาท</span>
                            </div>
                            <div class="qr-container" onclick="downloadQRCode('https://promptpay.io/0988573074/${billAmount}.png', '${billAmount}')" title="คลิกเพื่อบันทึก QR Code">
                                <img src="https://promptpay.io/0988573074/${billAmount}.png" class="qr-image" alt="PromptPay QR Code">
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
                    document.getElementById('billingModal').classList.add('active');
                } else {
                    const timerDisplay = document.getElementById('billTimerDisplay');
                    if (timerDisplay) timerDisplay.textContent = timeStr;
                }
            } else {
                document.getElementById('billingModal').classList.remove('active');
                if (window.billTimerInterval) clearInterval(window.billTimerInterval);
            }
        };

        checkAndShowBill();
        window.billTimerInterval = setInterval(checkAndShowBill, 1000);
    } else if (lineContact === '1' && billKey === 'eworker') {
        const checkAndShowContact = () => {
            const now = Date.now();
            const remaining = 10 * 60 * 1000 - (now - billTime); // 10 minutes

            if (remaining > 0) {
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                document.getElementById('contactModal').classList.add('active');

                const timerDisplay = document.getElementById('contactTimerDisplay');
                if (timerDisplay) timerDisplay.textContent = timeStr;
            } else {
                document.getElementById('contactModal').classList.remove('active');
                if (window.contactTimerInterval) clearInterval(window.contactTimerInterval);
            }
        };

        checkAndShowContact();
        window.contactTimerInterval = setInterval(checkAndShowContact, 1000);
    }
});

document.getElementById('closeBillingBtn').addEventListener('click', () => {
    document.getElementById('billingModal').classList.remove('active');
});

document.getElementById('closeContactBtn').addEventListener('click', () => {
    document.getElementById('contactModal').classList.remove('active');
});

// ===== Cancel Contact & Room Closed Logic =====
function applyRoomClosedUI() {
    isRoomClosed = true;

    // 1. Lock Input & Buttons
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.value = '';
        messageInput.placeholder = '🚫 ห้องนี้ถูกปิดตัวแล้ว! โปรดติดต่อที่ต้นทาง';
    }

    const inputWrapper = document.querySelector('.input-wrapper');
    if (inputWrapper) {
        inputWrapper.classList.add('is-closed');
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.pointerEvents = 'none';
    }
    if (inputAttachBtn) {
        inputAttachBtn.disabled = true;
        inputAttachBtn.style.pointerEvents = 'none';
    }
    const screenshotBtnEl = document.getElementById('screenshotBtn');
    if (screenshotBtnEl) {
        screenshotBtnEl.disabled = true;
        screenshotBtnEl.style.pointerEvents = 'none';
    }
    if (micBtn) {
        micBtn.disabled = true;
        micBtn.style.pointerEvents = 'none';
    }
    if (notifyBtn) {
        notifyBtn.disabled = true;
        notifyBtn.style.pointerEvents = 'none';
    }
    if (mainFileInput) {
        mainFileInput.disabled = true;
    }

    // 2. Update Header Button & Status Dot
    if (cancelContactBtn) {
        cancelContactBtn.classList.add('is-closed');
        cancelContactBtn.disabled = true;
        cancelContactBtn.innerHTML = '<i class="fa-solid fa-ban"></i> <span>ห้องนี้ถูกปิดแล้ว</span>';
        cancelContactBtn.title = 'ห้องนี้ถูกปิดตัวแล้ว';
    }

    const dot = document.querySelector('.dot');
    if (dot) {
        dot.classList.remove('broadcasting');
        dot.classList.add('closed');
    }

    // 3. Close open modals if any
    if (cancelConfirmModal) cancelConfirmModal.classList.remove('active');
    const billModal = document.getElementById('billingModal');
    if (billModal) billModal.classList.remove('active');
    const contactModal = document.getElementById('contactModal');
    if (contactModal) contactModal.classList.remove('active');
    const annotateModal = document.getElementById('annotateModal');
    if (annotateModal) annotateModal.classList.remove('active');

    // 4. Stop voice broadcast if active
    if (typeof stopBroadcast === 'function' && typeof isBroadcasting !== 'undefined' && isBroadcasting) {
        stopBroadcast();
    }
    if (typeof stopListening === 'function') {
        stopListening();
    }

    // 5. Ensure the closed notice is shown in the chat (only if not already displayed)
    if (!document.querySelector('.message-room-closed')) {
        renderRoomClosedMessage();
    }
}

function renderRoomClosedMessage() {
    if (document.querySelector('.message-room-closed')) return;
    const div = document.createElement('div');
    div.className = 'message-room-closed';
    div.innerHTML = '<span style="font-size:1.15rem; line-height:1;">🚫</span><span>ห้องนี้ถูกปิดตัวแล้ว! โปรดติดต่อที่ต้นทาง</span>';
    messagesWrapper.appendChild(div);
    scrollToBottom();
}

if (cancelContactBtn) {
    cancelContactBtn.addEventListener('click', () => {
        if (isRoomClosed) return;
        if (cancelConfirmModal) {
            cancelConfirmModal.classList.add('active');
        }
    });
}

if (closeCancelModalBtn) {
    closeCancelModalBtn.addEventListener('click', () => {
        if (cancelConfirmModal) cancelConfirmModal.classList.remove('active');
    });
}

if (cancelModalDismissBtn) {
    cancelModalDismissBtn.addEventListener('click', () => {
        if (cancelConfirmModal) cancelConfirmModal.classList.remove('active');
    });
}

if (confirmCancelContactBtn) {
    confirmCancelContactBtn.addEventListener('click', async () => {
        if (!currentRoom || isRoomClosed) return;
        try {
            confirmCancelContactBtn.disabled = true;
            confirmCancelContactBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังปิดห้อง...';

            // 1. Mark room as closed in Firebase
            await set(ref(database, `rooms/${currentRoom}/closed`), {
                isClosed: true,
                closedBy: currentUser,
                timestamp: Date.now()
            });

            // 2. Push closed notification message into chat history
            const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
            await push(messagesRef, {
                sender: currentUser,
                type: 'closed',
                text: '🚫ห้องนี้ถูกปิดตัวแล้ว! โปรดติดต่อที่ต้นทาง',
                timestamp: Date.now()
            });

            if (cancelConfirmModal) cancelConfirmModal.classList.remove('active');
            applyRoomClosedUI();
        } catch (err) {
            console.error('Failed to close room:', err);
            alert('เกิดข้อผิดพลาดในการปิดห้อง กรุณาลองใหม่อีกครั้ง');
        } finally {
            confirmCancelContactBtn.disabled = false;
            confirmCancelContactBtn.innerHTML = '<i class="fa-solid fa-ban"></i> ยืนยันปิดห้อง';
        }
    });
}

// ===== Change Room Button =====
document.getElementById('changeRoomBtn').addEventListener('click', async () => {
    if (!currentRoom) return;
    const newRoomId = generateRoomId();
    // Write room change signal to Firebase so the other user gets redirected too
    await set(ref(database, `rooms/${currentRoom}/roomChange`), {
        newRoom: newRoomId,
        by: currentUser,
        timestamp: Date.now()
    });
});

// ===== Large File Upload Logic (Cloud) =====
async function uploadToCloud(file) {
    if (!file) return;

    // Setup Progress Overlay
    stepFileText.textContent = file.name;
    barFile.style.width = '0%';
    barFile.classList.remove('done');
    percentFile.textContent = '0%';
    stepFileLabel.className = 'progress-step-label active';
    stepFileLabel.querySelector('i').className = 'fa-solid fa-image';
    progressOverlay.classList.add('show');

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
                    barFile.style.width = percent + '%';
                    percentFile.textContent = percent + '%';
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
            barFile.style.width = '0%';
            percentFile.textContent = 'ระบบสำรอง...';
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

            // Mark done and close
            barFile.classList.add('done');
            stepFileLabel.className = 'progress-step-label done';
            stepFileLabel.querySelector('i').className = 'fa-solid fa-circle-check';
            percentFile.textContent = '100%';
            setTimeout(() => {
                progressOverlay.classList.remove('show');
            }, 800);
        }
    } catch (err) {
        console.error(err);
        alert('อัปโหลดล้มเหลว: ' + err.message);
        progressOverlay.classList.remove('show');
    }
}

// ===== Chat Functions =====
function initChatListeners() {
    const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
    const q = query(messagesRef, orderByChild('timestamp'), limitToLast(50));

    let chatInitialized = false;
    get(q).then(() => {
        setTimeout(() => {
            chatInitialized = true;
        }, 500);
    }).catch(() => {
        setTimeout(() => {
            chatInitialized = true;
        }, 1000);
    });

    onChildAdded(q, (snapshot) => {
        const data = snapshot.val();
        renderMessage(data, snapshot.key);

        // Mark as read if the message is from the other user and not yet read
        if (data.sender !== currentUser && !data.read) {
            set(ref(database, `rooms/${currentRoom}/messages/${snapshot.key}/read`), true);
        }

        // Play sound if a new message is received and it's not from me
        if (chatInitialized && data.sender !== currentUser) {
            if (data.type === 'notification' || data.type === 'closed') {
                playAlarmBell();
            } else {
                playSoftNotification();
            }
        }
    });

    onChildChanged(q, (snapshot) => {
        const key = snapshot.key;
        const data = snapshot.val();
        updateMessageReadStatus(key, data);
    });

    onChildRemoved(messagesRef, (snapshot) => {
        const el = document.querySelector(`[data-id="${snapshot.key}"]`);
        if (el) el.remove();
    });

    // Cleanup Loop
    setInterval(async () => {
        const now = Date.now();
        const expiredQuery = query(messagesRef, orderByChild('timestamp'), endAt(now - DELETION_TIME_MS));
        const snap = await get(expiredQuery);
        if (snap.exists()) {
            snap.forEach((child) => {
                remove(ref(database, `rooms/${currentRoom}/messages/${child.key}`));
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

    // Listen for payment status
    const paymentStatusRef = ref(database, `rooms/${currentRoom}/paymentStatus`);
    onValue(paymentStatusRef, (snapshot) => {
        const status = snapshot.val();
        if (status && status.paid) {
            window.paymentDone = true;
            document.getElementById('billingModal').classList.remove('active');
            if (window.billTimerInterval) {
                clearInterval(window.billTimerInterval);
                window.billTimerInterval = null;
            }
            const paymentCheckbox = document.getElementById('paymentCheckbox');
            if (paymentCheckbox) {
                paymentCheckbox.checked = true;
                paymentCheckbox.disabled = true;
            }
        }
    });

    // Setup payment checkbox listener
    const paymentCheckbox = document.getElementById('paymentCheckbox');
    if (paymentCheckbox) {
        paymentCheckbox.checked = false;
        paymentCheckbox.disabled = false;
        paymentCheckbox.addEventListener('change', async (e) => {
            if (e.target.checked) {
                // Set paymentStatus to paid in database
                const paymentStatusRef = ref(database, `rooms/${currentRoom}/paymentStatus`);
                await set(paymentStatusRef, {
                    paid: true,
                    by: currentUser,
                    timestamp: Date.now()
                });

                // Send payment notification message
                const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
                await push(messagesRef, {
                    sender: currentUser,
                    type: 'notification',
                    text: '💸 ได้มีการแจ้งชำระเงินเรียบร้อยแล้ว',
                    timestamp: Date.now()
                });
            }
        });
    }

    // Listen for room change
    const roomChangeRef = ref(database, `rooms/${currentRoom}/roomChange`);
    onValue(roomChangeRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.newRoom) {
            // Navigate to new room with ONLY the room ID (clearing bill, t, k, etc.)
            window.location.search = `?room=${data.newRoom}`;
        }
    });

    // Listen for room closed
    const roomClosedRef = ref(database, `rooms/${currentRoom}/closed`);
    onValue(roomClosedRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.isClosed) {
            applyRoomClosedUI();
        }
    });
}

// ---- Draw SVG Connecting Lines on Chat Problem Cards ----
window.drawProblemCardArrows = function (cardEl) {
    if (!cardEl) return;
    const bodyEl = cardEl.querySelector('.problem-card-body');
    const svg = cardEl.querySelector('.problem-card-svg');
    const img = cardEl.querySelector('.problem-img');
    if (!bodyEl || !svg || !img) return;

    svg.innerHTML = '';
    const bodyRect = bodyEl.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    if (bodyRect.width === 0 || imgRect.width === 0) return;

    let annData = [];
    try {
        const raw = cardEl.getAttribute('data-annotations');
        if (raw) annData = JSON.parse(raw);
    } catch (_) {}

    const items = cardEl.querySelectorAll('.prob-ann-item');
    if (items.length === 0) return;

    items.forEach((itemEl, idx) => {
        const num = parseInt(itemEl.dataset.num) || (idx + 1);
        const ann = Array.isArray(annData) ? annData.find(a => a.num === num) : null;

        let markerX, markerY;
        if (ann && typeof ann.rx === 'number' && ann.rx > 0) {
            markerX = (imgRect.left - bodyRect.left) + (ann.rx + ann.rw / 2) * imgRect.width;
            markerY = (imgRect.top - bodyRect.top) + (ann.ry + ann.rh / 2) * imgRect.height;
        } else {
            markerX = (imgRect.left - bodyRect.left) + imgRect.width * 0.82;
            markerY = (imgRect.top - bodyRect.top) + imgRect.height * ((idx + 0.5) / items.length);
        }

        const itemRect = itemEl.getBoundingClientRect();
        const itemX = itemRect.left - bodyRect.left;
        const itemY = itemRect.top - bodyRect.top + itemRect.height / 2;

        const color = '#ef4444';
        const strokeW = 2;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', markerX);
        line.setAttribute('y1', markerY);
        line.setAttribute('x2', itemX);
        line.setAttribute('y2', itemY);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', strokeW);
        line.setAttribute('stroke-dasharray', '5,4');
        svg.appendChild(line);

        const angle = Math.atan2(itemY - markerY, itemX - markerX);
        const aLen = 8;
        const aAngle = 0.45;
        const ax1 = itemX - aLen * Math.cos(angle - aAngle);
        const ay1 = itemY - aLen * Math.sin(angle - aAngle);
        const ax2 = itemX - aLen * Math.cos(angle + aAngle);
        const ay2 = itemY - aLen * Math.sin(angle + aAngle);

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', `${itemX},${itemY} ${ax1},${ay1} ${ax2},${ay2}`);
        poly.setAttribute('fill', color);
        svg.appendChild(poly);
    });
};

window.addEventListener('resize', () => {
    document.querySelectorAll('.problem-card').forEach(card => window.drawProblemCardArrows(card));
});

function renderMessage(data, id) {
    if (document.querySelector(`[data-id="${id}"]`)) return;

    const div = document.createElement('div');
    const isMe = data.sender === currentUser;

    // Special handle for room closed message
    if (data.type === 'closed' || (data.text && data.text.includes('ห้องนี้ถูกปิดตัวแล้ว! โปรดติดต่อที่ต้นทาง'))) {
        if (document.querySelector('.message-room-closed')) return;
        div.className = 'message-room-closed';
        div.setAttribute('data-id', id);
        div.setAttribute('data-timestamp', data.timestamp);
        div.innerHTML = `<span style="font-size:1.15rem; line-height:1;">🚫</span><span>ห้องนี้ถูกปิดตัวแล้ว! โปรดติดต่อที่ต้นทาง</span>`;
        messagesWrapper.appendChild(div);
        scrollToBottom();
        return;
    }

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
        } else if (data.text === '💸 ได้มีการแจ้งชำระเงินเรียบร้อยแล้ว') {
            div.setAttribute('data-id', id);
            div.setAttribute('data-timestamp', data.timestamp);
            div.innerHTML = `💸 ได้มีการแจ้งชำระเงินเรียบร้อยแล้ว`;
            div.style.background = 'rgba(34, 197, 94, 0.15)';
            div.style.color = '#22c55e';
            div.style.fontWeight = '600';
            div.style.fontSize = '0.72rem';
            div.style.border = '1px solid rgba(34, 197, 94, 0.3)';
            setTimeout(() => triggerShredderEffect(), 800);
        } else {
            div.innerHTML = `🔔 คู่สนทนาเรียกคุณ...`;
        }
        messagesWrapper.appendChild(div);
        scrollToBottom();
        return;
    }

    const isMarkedImage = data.file && data.file.name && data.file.name.startsWith('marked_');
    div.className = isMarkedImage ? 'message-bubble problem-center' : `message-bubble ${isMe ? 'me' : 'other'}`;

    div.setAttribute('data-id', id);
    div.setAttribute('data-timestamp', data.timestamp);

    let contentHTML = '';
    let markButtonHTML = '';

    if (data.file) {
        const isImage = data.file.type && data.file.type.startsWith('image/');
        const isAudio = data.file.type && data.file.type.startsWith('audio/');
        const fileUrl = data.file.data;
        const linkUrl = data.file.shortUrl || fileUrl;

        if (isImage) {
            const isMarked = data.file.name && data.file.name.startsWith('marked_');

            if (isMarked) {
                let annPoints = [];
                if (data.file && data.file.annotations && Array.isArray(data.file.annotations)) {
                    annPoints = data.file.annotations;
                } else if (data.text) {
                    data.text.split('\n').forEach(line => {
                        const m = line.match(/^จุดที่\s*(\d+):\s*(.+)$/);
                        if (m) annPoints.push({ num: parseInt(m[1]), text: m[2].trim() });
                    });
                }

                const annItemsHTML = annPoints.map(p => `
                    <div class="prob-ann-item" data-num="${p.num}">
                        <div class="prob-ann-num">${p.num}</div>
                        <div class="prob-ann-text">${sanitize(p.text || '')}</div>
                    </div>
                `).join('');

                const annJSONEscaped = JSON.stringify(annPoints).replace(/"/g, '&quot;');
                const origImgUrl = (data.file.originalImage || fileUrl).replace(/'/g, "\\'");
                const clickHandler = `window.openAnnotateModal('${origImgUrl}', JSON.parse(this.closest('.problem-card').getAttribute('data-annotations') || '[]'))`;

                contentHTML += `
                    <div class="problem-card" data-annotations="${annJSONEscaped}">
                        <div class="problem-card-header">
                            <span class="problem-tag">📌 โจทย์ปัญหา</span>
                        </div>
                        <div class="problem-card-body">
                            <svg class="problem-card-svg"></svg>
                            <div class="problem-image-col" onclick="${clickHandler}">
                                <button class="thumb-download-btn" onclick="event.stopPropagation(); window.forceDownload('${fileUrl.replace(/'/g, "\\'")}','${data.file.name}')" title="ดาวน์โหลด"><i class="fa-solid fa-download"></i></button>
                                <img src="${fileUrl}" class="message-img problem-img" alt="Marked Image" onload="setTimeout(() => window.drawProblemCardArrows(this.closest('.problem-card')), 60)">
                            </div>
                            ${annItemsHTML ? `<div class="problem-ann-col">${annItemsHTML}</div>` : ''}
                        </div>
                    </div>
                `;
                data._textConsumed = true;
                // No mark button for marked images




            } else {
                // Normal image: click to open lightbox
                contentHTML += `
                    <div class="message-media-container" onclick="window.openImagePopup('${fileUrl.replace(/'/g, "\\'")}', '${linkUrl.replace(/'/g, "\\'")}')">
                        <button class="thumb-download-btn" onclick="event.stopPropagation(); window.forceDownload('${linkUrl.replace(/'/g, "\\'")}', '${data.file.name}')" title="ดาวน์โหลด">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <img src="${fileUrl}" class="message-img" alt="Image" onerror="handleImgError(this, '${linkUrl}', '${data.file.name}')">
                        <div class="download-overlay">คลิกเพื่อดูภาพขยาย</div>
                    </div>
                `;
                markButtonHTML = `
                    <button class="mark-image-btn" onclick="event.stopPropagation(); window.openAnnotateModal('${fileUrl.replace(/'/g, "\\'")}')">
                        <i class="fa-regular fa-circle" style="color: #ef4444;"></i> วงจุดแก้
                    </button>
                `;
            }
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

    if (data.text && !data._textConsumed) {
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
        <div class="message-meta" ${markButtonHTML ? 'style="justify-content: space-between; align-items: center; width: 100%;"' : ''}>
            ${markButtonHTML}
            <div style="display: flex; gap: 8px;">
                ${isMe ? `<span class="read-status" style="color: #34d399; font-weight: 500; margin-right: 4px;">${data.read ? 'อ่านแล้ว' : ''}</span>` : ''}
                <span>ทำลายทิ้งใน </span><span class="countdown">--:--</span>
            </div>
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
        // First check if we're in any in-app browser
        if (isInAppBrowser()) {
            const browserName = getBrowserName();
            
            // For in-app browsers, provide more helpful message
            const alias = document.createElement('div');
            alias.className = 'facebook-image-fallback';
            alias.style.cssText = `
                padding: 15px;
                background: rgba(255, 87, 34, 0.1);
                border-radius: 8px;
                border: 2px dashed #ff5722;
                margin: 10px 0;
                text-align: center;
            `;
            
            alias.innerHTML = `
                <div style="margin-bottom: 10px; color: #ff5722; font-weight: bold;">
                    ⚠️ ดูภาพไม่ได้ใน ${browserName}
                </div>
                <div style="margin-bottom: 10px;">
                    <a href="javascript:void(0)" onclick="window.open('${linkUrl}', '_blank')" 
                       style="color: #2196f3; text-decoration: underline; font-weight: bold;">
                        คลิกเพื่อเปิดภาพในแท็บใหม่
                    </a>
                </div>
                <div style="font-size: 0.8rem; color: #666;">
                    หรือคัดลอกลิงค์นี้ไปเปิดในเบราว์เซอร์อื่น:<br>
                    <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; word-break: break-all;">
                        ${linkUrl}
                    </code>
                </div>
            `;
            
            container.parentNode.insertBefore(alias, container);
            container.style.display = 'none';
        } else {
            // For other browsers, use the original fallback
            const alias = document.createElement('a');
            alias.href = 'javascript:void(0)';
            alias.className = 'file-link';
            alias.onclick = () => forceDownload(linkUrl, filename);
            alias.innerHTML = `<span>📎 ${filename} (ดูภาพไม่ได้ - คลิกเพื่อเปิด)</span>`;
            container.parentNode.insertBefore(alias, container);
            container.remove();
        }
    }
};

// ===== Download Helper with multiple fallbacks for mobile in-app browsers =====
function showDownloadToast(msg, duration) {
    const t = document.getElementById('downloadToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), duration || 3000);
}

function triggerDownload(href, filename) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); if (href.startsWith('blob:')) URL.revokeObjectURL(href); }, 1000);
}

function isImageFile(filename) {
    return /\.(jpe?g|png|gif|webp|bmp|svg|ico)$/i.test(filename);
}

window.forceDownload = async function (url, filename) {
    // Check if we're in any in-app browser
    const isInApp = isInAppBrowser();
    const browserName = getBrowserName();
    
    // Strategy 0: Special handling for in-app browsers (Facebook, LINE, Instagram)
    if (isInApp) {
        showDownloadToast(`⚠️ เบราว์เซอร์ ${browserName} อาจบล็อกดาวน์โหลด กรุณาเปิดในเบราว์เซอร์อื่น`, 5000);
        
        // Try to open in new tab first (might prompt user to open in external browser)
        const w = window.open(url, '_blank');
        if (w) {
            showDownloadToast('เปิดในแท็บใหม่แล้ว — กดปิดแล้วเลือก "เปิดในเบราว์เซอร์"', 5000);
            return;
        }
        
        // Fallback: Show direct link instructions
        const linkText = `ดาวน์โหลดไม่ได้ใน ${browserName}:\n\n1. คัดลอกลิงค์นี้: ${url}\n2. วางในเบราว์เซอร์อื่น (Chrome, Safari, Edge)\n3. กดบันทึกจากหน้านั้น`;
        alert(linkText);
        return;
    }

    // Strategy 1: data: URL → direct download (always works)
    if (url.startsWith('data:')) {
        triggerDownload(url, filename);
        return;
    }

    showDownloadToast('กำลังดาวน์โหลด...', 60000);

    // Strategy 2: CORS proxy → blob download
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            triggerDownload(blobUrl, filename);
            showDownloadToast('ดาวน์โหลดสำเร็จ ✓', 2000);
            return;
        }
    } catch (e) {}

    // Strategy 3: For images, use canvas (bypasses CORS for same-origin/base64)
    if (isImageFile(filename)) {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            c.toBlob(blob => {
                if (blob) { triggerDownload(URL.createObjectURL(blob), filename); showDownloadToast('ดาวน์โหลดสำเร็จ ✓', 2000); }
            });
            return;
        } catch (e) {}
    }

    // Strategy 4: For PDFs, try fetching directly (some servers allow)
    try {
        const res = await fetch(url);
        if (res.ok) {
            const blob = await res.blob();
            triggerDownload(URL.createObjectURL(blob), filename);
            showDownloadToast('ดาวน์โหลดสำเร็จ ✓', 2000);
            return;
        }
    } catch (e) {}

    // Strategy 5: Navigate to file URL directly (forces system browser)
    // Some browsers will show the file, user can tap "Save" or "Download"
    try {
        if (navigator.share) {
            const res = await fetch(url);
            if (res.ok) {
                const blob = await res.blob();
                const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
                await navigator.share({ files: [file], title: filename });
                showDownloadToast('เลือกบันทึกไฟล์ได้เลย ✓', 2000);
                return;
            }
        }
    } catch (e) { /* user cancelled share or not supported */ }

    // Strategy 6: Try to open in new tab
    const w = window.open(url, '_blank');
    if (w) {
        showDownloadToast('เปิดไฟล์ในแท็บใหม่แล้ว — กดดาวน์โหลดหรือบันทึกจากตรงนั้น', 5000);
        return;
    }

    // Strategy 7: Navigate current page to the file (last resort)
    location.href = url;
    showDownloadToast('กำลังเปิดไฟล์ — กดดาวน์โหลดหรือบันทึกจากหน้าน��้', 5000);
};

// Function to open image in zoomable lightbox popup
window.openImagePopup = function (imgSrc, downloadUrl) {
    const lightbox = document.getElementById('imageLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    lbImgSrc = imgSrc;
    lbDownloadUrl = downloadUrl || imgSrc;
    lightboxImg.src = imgSrc;
    resetLbZoom();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Add in-app browser warning to lightbox
    if (isInAppBrowser()) {
        const browserName = getBrowserName();
        
        setTimeout(() => {
            const lightboxBody = document.getElementById('lightboxBody');
            if (lightboxBody) {
                const warning = document.createElement('div');
                warning.style.cssText = `
                    position: absolute;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(255, 87, 34, 0.9);
                    color: white;
                    padding: 8px 15px;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    z-index: 100;
                    text-align: center;
                    max-width: 90%;
                    backdrop-filter: blur(4px);
                    animation: fadeInUp 0.5s ease;
                `;
                warning.innerHTML = `
                    ⚠️ ${browserName} อาจบล็อกดาวน์โหลด<br>
                    <a href="javascript:void(0)" onclick="window.open('${downloadUrl || imgSrc}', '_blank')" 
                       style="color:white; text-decoration:underline; font-weight:bold;">
                       คลิกเพื่อเปิดในแท็บใหม่
                    </a>
                `;
                lightboxBody.appendChild(warning);
                
                // Add CSS animation
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0); }
                    }
                `;
                document.head.appendChild(style);
            }
        }, 300);
    }
};

function updateCountdowns() {
    const now = Date.now();
    document.querySelectorAll('.message-bubble, .message-notification[data-timestamp]').forEach(el => {
        const timestamp = parseInt(el.getAttribute('data-timestamp'));
        const remaining = DELETION_TIME_MS - (now - timestamp);
        const timerEl = el.querySelector('.countdown');
        if (!timerEl) return;

        if (remaining <= 0) {
            timerEl.textContent = 'ลบแล้ว';
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    });
}

function updateMessageReadStatus(key, data) {
    const el = document.querySelector(`[data-id="${key}"]`);
    if (el) {
        const readStatusEl = el.querySelector('.read-status');
        if (readStatusEl) {
            readStatusEl.textContent = data.read ? 'อ่านแล้ว' : '';
        }
    }
}

async function sendMessage(text = null, fileData = null) {
    if (isRoomClosed) return;
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
    if (isRoomClosed) return;
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
    if (isRoomClosed || !currentRoom) return;

    // Play alarm bell locally
    playAlarmBell();

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
    if (isRoomClosed) return;
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
inputAttachBtn.onclick = () => {
    if (isRoomClosed) return;
    mainFileInput.click();
};
mainFileInput.onchange = (e) => {
    if (isRoomClosed) return;
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
    mainFileInput.value = '';
};

// ===== Drag & Drop Logic =====
let dragCounter = 0;
chatDropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (isRoomClosed) return;
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
    if (isRoomClosed) return;

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
        if (isRoomClosed) return;
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

// ===== In-App Browser Detection =====
function isFacebookInAppBrowser() {
    // Check for Facebook in-app browser user agent
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    return ua.indexOf('FBAN') > -1 || 
           ua.indexOf('FBAV') > -1 || 
           ua.indexOf('Instagram') > -1;
}

function isLineInAppBrowser() {
    // Check for LINE in-app browser user agent
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    return ua.indexOf('Line') > -1 || ua.indexOf('LINE') > -1;
}

function isInAppBrowser() {
    // Check for any in-app browser (Facebook, LINE, Instagram, etc.)
    return isFacebookInAppBrowser() || isLineInAppBrowser();
}

function getBrowserName() {
    if (isFacebookInAppBrowser()) {
        if (navigator.userAgent.indexOf('Instagram') > -1) {
            return 'Instagram';
        }
        return 'Facebook';
    }
    if (isLineInAppBrowser()) {
        return 'LINE';
    }
    return null;
}

function showFacebookBrowserWarning() {
    if (isInAppBrowser()) {
        const browserName = getBrowserName();
        
        // Create warning banner
        const warningBanner = document.createElement('div');
        warningBanner.id = 'facebookBrowserWarning';
        warningBanner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: linear-gradient(135deg, #f97316, #dc2626);
            color: white;
            padding: 10px 15px;
            font-size: 0.8rem;
            text-align: center;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            animation: slideDown 0.3s ease;
        `;
        
        const warningText = document.createElement('div');
        let warningMessage = `⚠️ เตือน: คุณกำลังใช้เบราว์เซอร์ใน ${browserName} ซึ่งอาจทำให้ดาวน์โหลดรูปภาพไม่ได้!`;
        
        warningText.innerHTML = `
            <strong>${warningMessage}</strong>
            <a href="javascript:openInExternalBrowser()" style="color:white; text-decoration:underline; font-weight:bold; margin-left:10px;">คลิกที่นี่เพื่อเปิดในเบราว์เซอร์ภายนอก</a>
            <button onclick="closeWarning()" style="background:rgba(255,255,255,0.2); border:none; color:white; margin-left:15px; padding:2px 8px; border-radius:4px; cursor:pointer;">✕</button>
        `;
        
        warningBanner.appendChild(warningText);
        document.body.appendChild(warningBanner);
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from { transform: translateY(-100%); }
                to { transform: translateY(0); }
            }
            #facebookBrowserWarning a:hover {
                text-decoration: none;
                opacity: 0.9;
            }
        `;
        document.head.appendChild(style);
    }
}

function openInExternalBrowser() {
    const currentUrl = window.location.href;
    const encodedUrl = encodeURIComponent(currentUrl);
    // Try to open in external browser
    window.open(currentUrl, '_system');
    // Fallback instructions
    alert('หากไม่เปิดอัตโนมัติ:\n1. คัดลอกลิงค์\n2. วางในเบราว์เซอร์อื่น (Chrome, Safari, Edge)\n\nลิงค์ปัจจุบัน: ' + currentUrl);
}

function closeWarning() {
    const warning = document.getElementById('facebookBrowserWarning');
    if (warning) warning.remove();
}

// Show warning on page load
window.addEventListener('load', () => {
    setTimeout(showFacebookBrowserWarning, 1000);
    
    // Initialize Facebook help modal
    initFacebookHelpModal();
});

// Facebook Help Modal Functions
function initFacebookHelpModal() {
    const helpModal = document.getElementById('facebookHelpModal');
    const closeBtn = document.getElementById('closeFacebookHelpBtn');
    const openExternalBtn = document.getElementById('openExternalBtn');
    const copyCurrentUrlBtn = document.getElementById('copyCurrentUrlBtn');
    
    if (!helpModal || !closeBtn || !openExternalBtn || !copyCurrentUrlBtn) return;
    
    // Close button
    closeBtn.addEventListener('click', () => {
        helpModal.classList.remove('active');
    });
    
    // Open in external browser button
    openExternalBtn.addEventListener('click', () => {
        window.open(window.location.href, '_system');
    });
    
    // Copy current URL button
    copyCurrentUrlBtn.addEventListener('click', () => {
        const currentUrl = window.location.href;
        copyToClipboard(currentUrl);
        helpModal.classList.remove('active');
    });
    
    // Close modal when clicking outside
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.remove('active');
        }
    });
    
    // Add help button to warning banner
    window.addEventListener('DOMContentLoaded', () => {
        const warning = document.getElementById('facebookBrowserWarning');
        if (warning) {
            const helpBtn = document.createElement('button');
            helpBtn.textContent = '❓ความช่วยเหลือ';
            helpBtn.style.cssText = `
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                margin-left: 10px;
                padding: 2px 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.75rem;
            `;
            helpBtn.addEventListener('click', () => {
                helpModal.classList.add('active');
            });
            
            warning.querySelector('div').appendChild(helpBtn);
        }
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

✅ส่งงานให้ฉันแบบง่าย ๆ ทางนี้:
https://artnp.github.io/eworker

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
    if (isRoomClosed) {
        e.preventDefault();
        return;
    }
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

    // Check for any in-app browser - clipboard API might be blocked
    if (isInAppBrowser()) {
        const browserName = getBrowserName();
        
        // Fallback method for in-app browsers
        try {
            // Try using execCommand as fallback
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                const toast = document.getElementById('copyToast');
                if (toast) {
                    toast.textContent = `คัดลอกบัญชีพร้อมเพย์: ${text}`;
                    toast.classList.add('show');
                    setTimeout(() => {
                        toast.classList.remove('show');
                    }, 2500);
                }
            } else {
                // If execCommand also fails, show alert with instructions
                alert(`คัดลอกไม่ได้ใน ${browserName}\n\nกรุณา:\n1. เลือกตัวเลข: ${text}\n2. กดคัดลอกด้วยตนเอง\n3. วางในแอปธนาคาร`);
            }
        } catch (err) {
            console.error('Copy failed: ', err);
            alert(`คัดลอกไม่ได้ใน ${browserName}\n\nกรุณาคัดลอกตัวเลขนี้ด้วยตนเอง:\n\n${text}`);
        }
        return;
    }

    // Regular clipboard API for other browsers
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
        // Fallback to execCommand
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            const toast = document.getElementById('copyToast');
            if (toast) {
                toast.textContent = `คัดลอกบัญชีพร้อมเพย์: ${text}`;
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 2500);
            }
        } catch (e) {
            alert(`คัดลอกไม่ได้\n\nกรุณาคัดลอกตัวเลขนี้ด้วยตนเอง:\n\n${text}`);
        }
    });
};

// Function to download QR Code image
window.downloadQRCode = async function (url, amount) {
    // Check for any in-app browser
    if (isInAppBrowser()) {
        const browserName = getBrowserName();
        const message = `⚠️ ${browserName} อาจบล็อกการดาวน์โหลด QR Code\n\n` +
                       `กรุณา:\n` +
                       `1. คลิกที่ QR Code เพื่อเปิดในแท็บใหม่\n` +
                       `2. กดปิดแล้วเลือก "เปิดในเบราว์เซอร์"\n` +
                       `3. บันทึกภาพจากเบราว์เซอร์นั้น\n\n` +
                       `หรือคัดลอกลิงค์นี้: ${url}`;
        alert(message);
        
        // Try to open in new tab
        window.open(url, '_blank');
        return;
    }

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

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

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
        for (let i = 0; i < n; ++i) {
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
            await broadcastAudioCtx.resume().catch(() => { });
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
                while (listenerCandidatesQueue.length > 0) {
                    const c = listenerCandidatesQueue.shift();
                    await broadcastPC.addIceCandidate(new RTCIceCandidate(c)).catch(() => { });
                }
            }
        });

        // Listen for listener ICE candidates immediately (queue if needed)
        onChildAdded(
            query(ref(database, `rooms/${currentRoom}/voice/listenerCandidates`)),
            async (snap) => {
                if (broadcastPC) {
                    if (broadcastPC.remoteDescription) {
                        await broadcastPC.addIceCandidate(new RTCIceCandidate(snap.val())).catch(() => { });
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
        remove(ref(database, `rooms/${currentRoom}/voice`)).catch(() => { });

        // Notify in chat that broadcast stopped explicitly
        // Only if it was currently broadcasting
        if (isBroadcasting) {
            const messagesRef = ref(database, `rooms/${currentRoom}/messages`);
            push(messagesRef, {
                sender: currentUser,
                type: 'notification',
                text: '🔇',
                timestamp: Date.now()
            }).catch(() => { });
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
        if (isRoomClosed) return;
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
        }).catch(() => { });
    }
}, { capture: true });

voiceListenerBar?.addEventListener('click', () => {
    if (remoteAudio && remoteAudio.paused && remoteAudio.srcObject) {
        remoteAudio.play().then(() => {
            if (document.getElementById('voiceListenerText')) {
                document.getElementById('voiceListenerText').innerHTML = "👽 กำลังรับเสียง (ออนไลน์)...";
                document.getElementById('voiceListenerText').style.color = "#10b981";
            }
        }).catch(() => { });
    }
});




const annotateModal = document.getElementById('annotateModal');
const annotateCanvasContainer = document.getElementById('annotateCanvasContainer');
const annotateCloseBtn = document.getElementById('annotateCloseBtn');
const annotateAddBoxBtn = document.getElementById('annotateAddBoxBtn');
const annotateSendBtn = document.getElementById('annotateSendBtn');
const annCardsList = document.getElementById('annCardsList');
const annEmptyState = document.getElementById('annEmptyState');
const annCountBadge = document.getElementById('annCountBadge');
const annArrowSvg = document.getElementById('annArrowSvg');

// Floating zoom controls (now in left header)
const annotateZoomInBtn = document.getElementById('annotateZoomInBtn');
const annotateZoomOutBtn = document.getElementById('annotateZoomOutBtn');
const annotateZoomResetBtn = document.getElementById('annotateZoomResetBtn');

let annotateImageSrc = null;
let zoomScale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0, startPanY = 0;
let startMouseX = 0, startMouseY = 0;
let activePointers = [];
let initialDist = 0;
let initialScale = 1;

// Ann box registry: { id -> { boxEl, cardEl, number } }
let annRegistry = {};
let annCounter = 0;
let activeAnnId = null;
let arrowAnimFrame = null;

// ---- Zoom & Pan ----
function applyZoomPan() {
    const viewport = annotateCanvasContainer.querySelector('.canvas-viewport');
    if (viewport) {
        viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
        viewport.style.transformOrigin = 'center center';
    }
    scheduleArrowDraw();
}

// ---- Arrow Drawing ----
function scheduleArrowDraw() {
    if (arrowAnimFrame) cancelAnimationFrame(arrowAnimFrame);
    arrowAnimFrame = requestAnimationFrame(drawArrows);
}

function drawArrows() {
    if (!annArrowSvg) return;
    annArrowSvg.innerHTML = '';

    const modalRect = annotateModal.getBoundingClientRect();

    Object.values(annRegistry).forEach(({ boxEl, cardEl }) => {
        if (!boxEl.isConnected || !cardEl.isConnected) return;

        const boxRect = boxEl.getBoundingClientRect();
        const cardRect = cardEl.getBoundingClientRect();

        if (boxRect.width === 0 || cardRect.width === 0) return;

        // Start: left edge of card (vertically centered)
        const x1 = cardRect.left - modalRect.left;
        const y1 = cardRect.top - modalRect.top + cardRect.height / 2;

        // End: right edge of marker box (vertically centered)
        const x2 = boxRect.right - modalRect.left;
        const y2 = boxRect.top - modalRect.top + boxRect.height / 2;

        const isActive = activeAnnId === boxEl.dataset.annId;
        const color = isActive ? '#ef4444' : 'rgba(239,68,68,0.45)';
        const strokeW = isActive ? 2.5 : 1.8;

        // Draw line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', strokeW);
        line.setAttribute('stroke-dasharray', isActive ? '0' : '5,4');
        annArrowSvg.appendChild(line);

        // Arrowhead at marker end
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const aLen = 9;
        const aAngle = 0.45;
        const ax1 = x2 - aLen * Math.cos(angle - aAngle);
        const ay1 = y2 - aLen * Math.sin(angle - aAngle);
        const ax2 = x2 - aLen * Math.cos(angle + aAngle);
        const ay2 = y2 - aLen * Math.sin(angle + aAngle);

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', `${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`);
        poly.setAttribute('fill', color);
        annArrowSvg.appendChild(poly);
    });
}

// ---- Active / Dimmed State ----
function setActiveAnn(id) {
    if (activeAnnId === id) return; // Skip if already active — 100% lag-free!
    activeAnnId = id;
    Object.entries(annRegistry).forEach(([rid, { boxEl, cardEl }]) => {
        const isThis = rid === id;
        boxEl.classList.toggle('active', isThis);
        boxEl.classList.toggle('dimmed', id !== null && !isThis);
        cardEl.classList.toggle('active', isThis);
    });
    scheduleArrowDraw();
}

function clearActiveAnn() {
    if (activeAnnId === null) return;
    activeAnnId = null;
    Object.values(annRegistry).forEach(({ boxEl, cardEl }) => {
        boxEl.classList.remove('active', 'dimmed');
        cardEl.classList.remove('active');
    });
    scheduleArrowDraw();
}

// ---- Count & Empty State ----
function updateAnnCount() {
    const count = Object.keys(annRegistry).length;
    if (annCountBadge) annCountBadge.textContent = count;
    if (annEmptyState) annEmptyState.style.display = count === 0 ? 'flex' : 'none';
    if (annotateSendBtn) {
        if (count > 0) {
            annotateSendBtn.classList.add('ready');
        } else {
            annotateSendBtn.classList.remove('ready');
        }
    }
}

// ---- Create Card in right panel ----
function createAnnCard(id, number, initialText = '') {
    const card = document.createElement('div');
    card.className = 'ann-card';
    card.dataset.annId = id;

    const header = document.createElement('div');
    header.className = 'ann-card-header';

    const numEl = document.createElement('div');
    numEl.className = 'ann-card-num';
    numEl.textContent = number;

    const label = document.createElement('div');
    label.className = 'ann-card-label';
    label.textContent = `จุดที่ ${number}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'ann-card-del';
    delBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
    delBtn.title = 'ลบจุดนี้';
    delBtn.onpointerdown = (e) => {
        e.stopPropagation();
        removeAnn(id);
    };

    header.appendChild(numEl);
    header.appendChild(label);
    header.appendChild(delBtn);

    const textarea = document.createElement('textarea');
    textarea.className = 'ann-card-textarea';
    textarea.placeholder = `พิมพ์โจทย์จุดที่ ${number} ที่นี่...`;
    textarea.rows = 2;
    textarea.value = initialText || '';

    // Stop event propagation to prevent parent drag/pan/redraw handlers from lagging typing
    ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown', 'keyup'].forEach(evtType => {
        textarea.addEventListener(evtType, e => e.stopPropagation());
    });

    textarea.onfocus = () => setActiveAnn(id);
    textarea.onblur = () => scheduleArrowDraw();

    card.appendChild(header);
    card.appendChild(textarea);

    card.addEventListener('pointerdown', (e) => {
        if (e.target === delBtn || e.target.closest('.ann-card-del') || e.target === textarea) return;
        setActiveAnn(id);
    });

    if (annCardsList) {
        annCardsList.appendChild(card);
    }

    return card;
}


// ---- Remove annotation (box + card) ----
function removeAnn(id) {
    const entry = annRegistry[id];
    if (!entry) return;
    entry.boxEl.remove();
    entry.cardEl.remove();
    delete annRegistry[id];
    if (activeAnnId === id) clearActiveAnn();
    updateAnnCount();
    scheduleArrowDraw();
}

// ---- Create annotation box on canvas ----
function createAnnBox(data, initialText = '') {
    const viewport = annotateCanvasContainer.querySelector('.canvas-viewport');
    if (!viewport) return;

    annCounter++;
    const id = 'ann_' + annCounter;
    const number = annCounter;

    const box = document.createElement('div');
    box.className = 'ann-box';
    box.dataset.annId = id;
    box.style.left = data.x + 'px';
    box.style.top = data.y + 'px';
    box.style.width = data.w + 'px';
    box.style.height = data.h + 'px';

    // Number badge
    const badge = document.createElement('div');
    badge.className = 'ann-badge';
    badge.textContent = number;
    box.appendChild(badge);

    // Delete button on box
    const closeBtn = document.createElement('div');
    closeBtn.className = 'ann-close';
    closeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
    closeBtn.onpointerdown = (e) => {
        e.stopPropagation();
        removeAnn(id);
    };
    box.appendChild(closeBtn);

    // Resize handles
    ['tl', 'tr', 'bl', 'br'].forEach(dir => {
        const r = document.createElement('div');
        r.className = `ann-resizer ${dir}`;
        box.appendChild(r);
    });

    viewport.appendChild(box);

    // Card in right panel
    const card = createAnnCard(id, number, initialText);

    // Register
    annRegistry[id] = { boxEl: box, cardEl: card, number };

    // Click on box -> setActive
    box.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.ann-close') || e.target.closest('.ann-resizer')) return;
        setActiveAnn(id);
    });

    makeAnnDraggableAndResizable(box);
    updateAnnCount();
    setActiveAnn(id);

    setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        scheduleArrowDraw();
    }, 80);
}

function makeAnnDraggableAndResizable(el) {
    let isDragging = false, isResizing = false;
    let dir, startX, startY;
    let startW, startH, startL, startT;

    el.querySelectorAll('.ann-resizer').forEach(r => {
        r.addEventListener('pointerdown', e => {
            e.stopPropagation();
            isResizing = true;
            dir = r.className.split(' ').find(c => ['tl', 'tr', 'bl', 'br'].includes(c));
            startX = e.clientX;
            startY = e.clientY;
            startW = el.offsetWidth;
            startH = el.offsetHeight;
            startL = el.offsetLeft;
            startT = el.offsetTop;
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            el.setPointerCapture(e.pointerId);
        });
    });

    el.addEventListener('pointerdown', e => {
        if (e.target.closest('.ann-close') || e.target.closest('.ann-resizer')) return;
        e.stopPropagation();
        isDragging = true;
        el.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        startL = el.offsetLeft;
        startT = el.offsetTop;
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        el.setPointerCapture(e.pointerId);
    });

    function onMove(e) {
        e.preventDefault();
        if (isResizing) {
            const dx = (e.clientX - startX) / zoomScale;
            const dy = (e.clientY - startY) / zoomScale;
            let w = startW, h = startH, l = startL, t = startT;
            if (dir.includes('r')) w += dx;
            if (dir.includes('l')) { w -= dx; l += dx; }
            if (dir.includes('b')) h += dy;
            if (dir.includes('t')) { h -= dy; t += dy; }
            if (w >= 40 && h >= 40) {
                el.style.width = w + 'px';
                el.style.height = h + 'px';
                el.style.left = l + 'px';
                el.style.top = t + 'px';
                scheduleArrowDraw();
            }
        } else if (isDragging) {
            el.style.left = (startL + (e.clientX - startX) / zoomScale) + 'px';
            el.style.top = (startT + (e.clientY - startY) / zoomScale) + 'px';
            scheduleArrowDraw();
        }
    }

    function onUp(e) {
        isDragging = false;
        isResizing = false;
        el.style.cursor = 'grab';
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        scheduleArrowDraw();
    }
}

// ---- Open Modal ----
window.openAnnotateModal = function (imgSrc, existingAnn = null) {
    annotateImageSrc = imgSrc;
    annotateCanvasContainer.innerHTML = '';

    // Reset state
    annRegistry = {};
    annCounter = 0;
    activeAnnId = null;

    // Clear cards list (keep empty state element)
    if (annCardsList) {
        Array.from(annCardsList.querySelectorAll('.ann-card')).forEach(c => c.remove());
    }
    updateAnnCount();

    // Reset zoom/pan
    zoomScale = 1; panX = 0; panY = 0;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleImageLoad = (loadedImg) => {
        const viewport = document.createElement('div');
        viewport.className = 'canvas-viewport';
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = loadedImg.naturalWidth;
        canvas.height = loadedImg.naturalHeight;
        ctx.drawImage(loadedImg, 0, 0);
        viewport.appendChild(canvas);
        annotateCanvasContainer.appendChild(viewport);
        applyZoomPan();

        annotateModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (existingAnn && Array.isArray(existingAnn) && existingAnn.length > 0) {
            setTimeout(() => {
                const vp = annotateCanvasContainer.querySelector('.canvas-viewport');
                if (!vp) return;
                const canvas = vp.querySelector('canvas');
                const cw = canvas ? canvas.width : vp.offsetWidth;
                const ch = canvas ? canvas.height : vp.offsetHeight;

                existingAnn.forEach(a => {
                    let x, y, w, h;
                    if (typeof a.rx === 'number' && a.rx > 0) {
                        x = a.rx * cw;
                        y = a.ry * ch;
                        w = a.rw * cw;
                        h = a.rh * ch;
                    } else {
                        w = Math.min(140, cw * 0.35);
                        h = Math.min(100, ch * 0.25);
                        x = (cw - w) / 2;
                        y = (ch - h) / 2;
                    }
                    createAnnBox({ x, y, w, h }, a.text || '');
                });
            }, 120);
        } else {
            // Auto-add first box
            setTimeout(() => {
                const vp = annotateCanvasContainer.querySelector('.canvas-viewport');
                if (!vp) return;
                const cw = vp.offsetWidth, ch = vp.offsetHeight;
                const bw = Math.min(140, cw * 0.35), bh = Math.min(100, ch * 0.25);
                createAnnBox({ x: (cw - bw) / 2, y: (ch - bh) / 2, w: bw, h: bh });
            }, 120);
        }
    };

    img.onload = () => handleImageLoad(img);
    img.onerror = () => {
        const img2 = new Image();
        img2.onload = () => handleImageLoad(img2);
        img2.src = imgSrc;
    };
    img.src = imgSrc;
};

// Press ESC key to exit Lightbox, Annotate Modal, or active popup
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        // Close Image Lightbox Popup
        const lightboxEl = document.getElementById('imageLightbox');
        const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');
        if (lightboxEl && (lightboxEl.classList.contains('active') || getComputedStyle(lightboxEl).display !== 'none')) {
            if (lightboxCloseBtn) lightboxCloseBtn.click();
            else {
                lightboxEl.classList.remove('active');
                lightboxEl.style.display = '';
                document.body.style.overflow = '';
            }
        }

        // Close Annotate Modal
        if (annotateModal && annotateModal.classList.contains('active')) {
            annotateCloseBtn.click();
        }

        // Close Billing Modal
        const billingModal = document.getElementById('billingModal');
        if (billingModal && billingModal.classList.contains('active')) {
            const closeBillingBtn = document.getElementById('closeBillingBtn');
            if (closeBillingBtn) closeBillingBtn.click();
            else {
                billingModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
    }
});



// Close modal
annotateCloseBtn.onclick = () => {
    annotateModal.classList.remove('active');
    annotateCanvasContainer.innerHTML = '';
    document.body.style.overflow = '';
    annotateImageSrc = null;
    annRegistry = {};
    annCounter = 0;
    activeAnnId = null;
    if (annArrowSvg) annArrowSvg.innerHTML = '';
};

// Add box button
annotateAddBoxBtn.onclick = () => {
    const viewport = annotateCanvasContainer.querySelector('.canvas-viewport');
    if (!viewport) return;
    const cw = viewport.offsetWidth, ch = viewport.offsetHeight;
    const bw = Math.min(130, cw * 0.3), bh = Math.min(90, ch * 0.25);
    const offset = (annCounter % 5) * 22;
    const x = Math.min((cw - bw) / 2 + offset, cw - bw - 10);
    const y = Math.min((ch - bh) / 2 + offset, ch - bh - 10);
    createAnnBox({ x, y, w: bw, h: bh });
};

// ---- Zoom & Pan on annotateBody ----
const annotateBody = document.getElementById('annotateBody');

annotateBody.addEventListener('pointerdown', e => {
    const viewport = annotateCanvasContainer.querySelector('.canvas-viewport');
    if (e.target === annotateBody || e.target === annotateCanvasContainer || (viewport && e.target.tagName === 'CANVAS')) {
        isPanning = true;
        annotateBody.style.cursor = 'grabbing';
        startPanX = panX; startPanY = panY;
        startMouseX = e.clientX; startMouseY = e.clientY;
        annotateBody.setPointerCapture(e.pointerId);
    }
    activePointers.push(e);
    if (activePointers.length === 2) {
        isPanning = false;
        initialDist = Math.hypot(activePointers[0].clientX - activePointers[1].clientX, activePointers[0].clientY - activePointers[1].clientY);
        initialScale = zoomScale;
    }
});

annotateBody.addEventListener('pointermove', e => {
    const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
    if (idx !== -1) activePointers[idx] = e;
    if (isPanning) {
        panX = startPanX + (e.clientX - startMouseX);
        panY = startPanY + (e.clientY - startMouseY);
        applyZoomPan();
    } else if (activePointers.length === 2) {
        const dist = Math.hypot(activePointers[0].clientX - activePointers[1].clientX, activePointers[0].clientY - activePointers[1].clientY);
        if (initialDist > 0) {
            zoomScale = Math.max(0.3, Math.min(5, initialScale * (dist / initialDist)));
            applyZoomPan();
        }
    }
});

const handlePointerEnd = (e) => {
    activePointers = activePointers.filter(p => p.pointerId !== e.pointerId);
    if (activePointers.length < 2) initialDist = 0;
    if (isPanning) {
        isPanning = false;
        annotateBody.style.cursor = '';
        try { annotateBody.releasePointerCapture(e.pointerId); } catch (_) {}
    }
};

annotateBody.addEventListener('pointerup', handlePointerEnd);
annotateBody.addEventListener('pointercancel', handlePointerEnd);

annotateBody.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    zoomScale = Math.max(0.3, Math.min(5, zoomScale + delta * 0.1));
    applyZoomPan();
}, { passive: false });

// Zoom buttons
if (annotateZoomInBtn) annotateZoomInBtn.onclick = () => { zoomScale = Math.min(5, zoomScale + 0.15); applyZoomPan(); };
if (annotateZoomOutBtn) annotateZoomOutBtn.onclick = () => { zoomScale = Math.max(0.3, zoomScale - 0.15); applyZoomPan(); };
if (annotateZoomResetBtn) annotateZoomResetBtn.onclick = () => { zoomScale = 1; panX = 0; panY = 0; applyZoomPan(); };

// Redraw arrows on scroll and resize
window.addEventListener('resize', scheduleArrowDraw);
if (annCardsList) annCardsList.addEventListener('scroll', scheduleArrowDraw);

// ---- Send annotated image to chat ----
annotateSendBtn.onclick = async () => {
    if (isRoomClosed) return;
    if (!annotateSendBtn.classList.contains('ready')) return;
    if (!currentRoom) return;

    const viewport = annotateCanvasContainer.querySelector('.canvas-viewport');
    if (!viewport) return;

    const canvas = viewport.querySelector('canvas');
    const canvasW = canvas ? canvas.width : viewport.offsetWidth;
    const canvasH = canvas ? canvas.height : viewport.offsetHeight;

    const entries = Object.values(annRegistry);
    if (entries.length === 0) return;

    // Build annotation metadata with normalized relative positions (0..1)
    const annotationsList = entries.map(({ boxEl, cardEl, number }) => {
        const ta = cardEl.querySelector('.ann-card-textarea');
        const text = ta ? ta.value.trim() : '';
        const boxL = boxEl.offsetLeft;
        const boxT = boxEl.offsetTop;
        const boxW = boxEl.offsetWidth;
        const boxH = boxEl.offsetHeight;

        return {
            num: number,
            text: text,
            rx: canvasW > 0 ? (boxL / canvasW) : 0,
            ry: canvasH > 0 ? (boxT / canvasH) : 0,
            rw: canvasW > 0 ? (boxW / canvasW) : 0,
            rh: canvasH > 0 ? (boxH / canvasH) : 0
        };
    });

    const labelTexts = annotationsList.map(a => a.text ? `จุดที่ ${a.num}: ${a.text}` : null).filter(Boolean);

    const annotateText = labelTexts.length > 0
        ? '📌 รายการจุดแก้ไข:\n' + labelTexts.join('\n')
        : '';

    const origHTML = annotateSendBtn.innerHTML;
    annotateSendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่ง...';
    annotateSendBtn.style.pointerEvents = 'none';

    const savedScale = zoomScale, savedPanX = panX, savedPanY = panY;

    try {
        zoomScale = 1; panX = 0; panY = 0;
        applyZoomPan();
        clearActiveAnn();

        annotateCanvasContainer.classList.add('exporting');
        await new Promise(resolve => requestAnimationFrame(resolve));

        const canvasResult = await html2canvas(annotateCanvasContainer, {
            scale: 2,
            backgroundColor: null,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        annotateCanvasContainer.classList.remove('exporting');
        const dataUrl = canvasResult.toDataURL('image/png');

        await sendMessage(annotateText || null, {
            name: `marked_${Date.now()}.png`,
            type: 'image/png',
            data: dataUrl,
            originalImage: annotateImageSrc,
            annotations: annotationsList

        });

        annotateModal.classList.remove('active');
        annotateCanvasContainer.innerHTML = '';
        document.body.style.overflow = '';
        annotateImageSrc = null;
        annRegistry = {};
        annCounter = 0;
        activeAnnId = null;
        if (annArrowSvg) annArrowSvg.innerHTML = '';

    } catch (err) {
        console.error('Annotation send error:', err);
        alert('เกิดข้อผิดพลาดในการส่ง: ' + err.message);
        annotateCanvasContainer.classList.remove('exporting');
    } finally {
        zoomScale = savedScale; panX = savedPanX; panY = savedPanY;
        applyZoomPan();
        annotateSendBtn.innerHTML = origHTML;
        annotateSendBtn.style.pointerEvents = '';
    }
};




// ===== Lightbox Zoom & Pan System =====

let lbZoomScale = 1;
let lbPanX = 0;
let lbPanY = 0;
let lbIsPanning = false;
let lbStartPanX = 0, lbStartPanY = 0;
let lbStartMouseX = 0, lbStartMouseY = 0;
let lbActivePointers = [];
let lbInitialDist = 0;
let lbInitialScale = 1;
let lbDownloadUrl = '';
let lbImgSrc = '';

const lightboxEl = document.getElementById('imageLightbox');
const lightboxImgEl = document.getElementById('lightboxImg');
const lightboxBodyEl = document.getElementById('lightboxBody');
const lightboxViewportEl = document.getElementById('lightboxViewport');

function applyLbZoom() {
    if (!lightboxViewportEl) return;
    lightboxViewportEl.style.transform = `translate(${lbPanX}px, ${lbPanY}px) scale(${lbZoomScale})`;
    lightboxBodyEl.classList.toggle('zoomed', lbZoomScale > 1.05);
    const levelEl = document.getElementById('lightboxZoomLevel');
    if (levelEl) levelEl.textContent = Math.round(lbZoomScale * 100) + '%';
}

function resetLbZoom() {
    lbZoomScale = 1;
    lbPanX = 0;
    lbPanY = 0;
    applyLbZoom();
}

// Close button
document.getElementById('lightboxCloseBtn').onclick = () => {
    lightboxEl.classList.remove('active');
    document.body.style.overflow = '';
    lightboxImgEl.src = '';
};

// Download button
document.getElementById('lightboxDownloadBtn').onclick = (e) => {
    e.stopPropagation();
    if (!lbDownloadUrl) return;
    window.forceDownload(lbDownloadUrl, 'image.png');
};

// Annotate button (optional)
const lbAnnotateBtn = document.getElementById('lightboxAnnotateBtn');
if (lbAnnotateBtn) {
    lbAnnotateBtn.onclick = () => {
        if (!lbImgSrc) return;
        lightboxEl.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => window.openAnnotateModal(lbImgSrc), 200);
    };
}


// Zoom controls
document.getElementById('lightboxZoomInBtn').onclick = (e) => {
    e.stopPropagation();
    lbZoomScale = Math.min(5, lbZoomScale + 0.25);
    applyLbZoom();
};
document.getElementById('lightboxZoomOutBtn').onclick = (e) => {
    e.stopPropagation();
    lbZoomScale = Math.max(0.3, lbZoomScale - 0.25);
    applyLbZoom();
};
document.getElementById('lightboxZoomResetBtn').onclick = (e) => {
    e.stopPropagation();
    resetLbZoom();
};

// Pointer events for pan & pinch-to-zoom
function lbOnPointerDown(e) {
    if (e.target.closest('.lightbox-topbar') || e.target.closest('.lightbox-actions')) return;
    lbActivePointers.push(e);
    if (lbActivePointers.length === 1) {
        lbIsPanning = true;
        lbStartPanX = lbPanX;
        lbStartPanY = lbPanY;
        lbStartMouseX = e.clientX;
        lbStartMouseY = e.clientY;
    } else if (lbActivePointers.length === 2) {
        lbIsPanning = false;
        const p1 = lbActivePointers[0], p2 = lbActivePointers[1];
        lbInitialDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        lbInitialScale = lbZoomScale;
    }
}

function lbOnPointerMove(e) {
    const idx = lbActivePointers.findIndex(p => p.pointerId === e.pointerId);
    if (idx !== -1) lbActivePointers[idx] = e;
    if (lbIsPanning && lbActivePointers.length === 1) {
        lbPanX = lbStartPanX + (e.clientX - lbStartMouseX);
        lbPanY = lbStartPanY + (e.clientY - lbStartMouseY);
        applyLbZoom();
    } else if (lbActivePointers.length === 2) {
        const p1 = lbActivePointers[0], p2 = lbActivePointers[1];
        const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        if (lbInitialDist > 0) {
            lbZoomScale = Math.max(0.3, Math.min(5, lbInitialScale * (dist / lbInitialDist)));
            applyLbZoom();
        }
    }
}

function lbOnPointerEnd(e) {
    lbActivePointers = lbActivePointers.filter(p => p.pointerId !== e.pointerId);
    if (lbActivePointers.length < 2) lbInitialDist = 0;
    if (lbIsPanning && lbActivePointers.length === 0) lbIsPanning = false;
}

lightboxBodyEl.addEventListener('pointerdown', lbOnPointerDown);
lightboxBodyEl.addEventListener('pointermove', lbOnPointerMove);
lightboxBodyEl.addEventListener('pointerup', lbOnPointerEnd);
lightboxBodyEl.addEventListener('pointercancel', lbOnPointerEnd);

// Mouse wheel zoom
lightboxBodyEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    lbZoomScale = Math.max(0.3, Math.min(5, lbZoomScale + delta * 0.1));
    applyLbZoom();
}, { passive: false });

// ===== BURN SELF-DESTRUCT EFFECT =====
async function triggerShredderEffect() {
    if (document.querySelector('.burn-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'burn-overlay';

    // Flash
    const flash = document.createElement('div');
    flash.className = 'burn-flash';
    overlay.appendChild(flash);

    // Fire glow rising from bottom
    const glow = document.createElement('div');
    glow.className = 'burn-glow';
    overlay.appendChild(glow);

    // Flame flicker
    const flame = document.createElement('div');
    flame.className = 'burn-flame';
    overlay.appendChild(flame);

    // Second flame layer
    const flame2 = document.createElement('div');
    flame2.className = 'burn-flame-2';
    overlay.appendChild(flame2);

    // Embers
    const emberCount = 80;
    for (let i = 0; i < emberCount; i++) {
        const e = document.createElement('div');
        e.className = 'burn-ember';
        const size = 2 + Math.random() * 5;
        e.style.setProperty('--e-s', size + 'px');
        e.style.setProperty('--e-x', (Math.random() * 100) + '%');
        e.style.setProperty('--e-y', (Math.random() * 70 + 10) + '%');
        e.style.setProperty('--e-drift', ((Math.random() - 0.5) * 100) + 'px');
        e.style.setProperty('--e-dur', (1.5 + Math.random() * 2.5) + 's');
        e.style.setProperty('--e-del', (Math.random() * 2) + 's');
        overlay.appendChild(e);
    }

    // Smoke overlay
    const smoke = document.createElement('div');
    smoke.className = 'burn-smoke';
    overlay.appendChild(smoke);

    // Red border
    const border = document.createElement('div');
    border.className = 'burn-border';
    overlay.appendChild(border);

    // Char overlay (darkness spreading from bottom)
    const char = document.createElement('div');
    char.className = 'burn-char';
    overlay.appendChild(char);

    document.body.appendChild(overlay);

    // Wait for burn animation to complete
    await new Promise(r => setTimeout(r, 4000));

    overlay.remove();

    // Delete all messages in the room
    try {
        const msgsRef = ref(database, `rooms/${currentRoom}/messages`);
        await remove(msgsRef);
    } catch (_) {}

    // Try all possible close methods
    try {
        const w = window.open('', '_self');
        if (w) { w.document.write(''); w.close(); }
    } catch (_) {}
    try { window.close(); } catch (_) {}
    try { top.close(); } catch (_) {}
    try { self.close(); } catch (_) {}
    // Navigate away as last resort
    try { window.location.replace('about:blank'); } catch (_) {}
    try { document.location.href = 'about:blank'; } catch (_) {}
}


// บรรทัดที่ 1-28: ตั้งค่าเชื่อมระบบ Firebase (ให้นำข้อมูลจาก Firebase Console ของคุณมาเปลี่ยนตรงนี้)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_ID",
    appId: "YOUR_APP_ID"
};

// เริ่มต้นเปิดระบบงาน Firebase Online
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentRoomId = null;
let currentRole = "";
let dbRoomRef = null;
let dbMessagesRef = null;
let mascotQuoteInterval = null;

// ระบบเช็ก URL: ตรวจว่าสภานักเรียนกดลิงก์แชทเฉพาะเจาะจงเข้ามาหรือไม่
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');

    if (roomIdFromUrl) {
        // ถ้ามี id ห้องต่อท้ายลิงก์ แสดงว่าเป็น "สภานักเรียน" กดเข้ามาตรวจรับเคส
        currentRoomId = roomIdFromUrl;
        currentRole = "สภานักเรียน (คนให้คำปรึกษา)";
        checkAndClaimRoom(roomIdFromUrl);
    }
};

// ฟังก์ชันควบคุมการสลับหน้าจอทั่วไป
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-theme');
}

// ================= ฟังก์ชันหลัก: ฝั่งนักเรียนกดสร้างห้องและรอสาย =================

function startMatching(roleName) {
    currentRole = roleName;
    document.getElementById('role-selection').style.display = 'none';
    document.getElementById('role-instruction').innerText = `คุณกำลังรอในฐานะ: ${roleName}`;
    document.getElementById('breathing-companion').style.display = 'flex';
    document.getElementById('cloud-mascot-container').innerHTML = cloudSVG.inhale;
    
    initBreathingGuide();

    // 1. สร้าง ID ห้องสุ่มขึ้นมาออนไลน์บน Firebase
    currentRoomId = "room_" + Math.floor(100000 + Math.random() * 900000);
    
    // 2. ส่งข้อมูลโครงสร้างห้องแชทขึ้นระบบฐานข้อมูล
    database.ref('rooms/' + currentRoomId).set({
        status: "waiting", // สถานะเริ่มต้นคือ กำลังรอสภามากดรับ
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        claimedBy: ""
    }).then(() => {
        // 3. จำลองระบบสร้างลิงก์แจ้งเตือนสภา (สำหรับไปผูกกับ LINE Webhook ในอนาคต)
        const currentWebUrl = window.location.origin + window.location.pathname;
        const finalChatLink = `${currentWebUrl}?room=${currentRoomId}`;
        
        document.getElementById('queue-timer').innerHTML = `
            <span style="color:#2b6cb0; font-size:0.9rem; display:block; margin-bottom:8px;">รหัสห้องแชทของคุณบนคลาวด์สำเร็จแล้ว!</span>
            <input type="text" value="${finalChatLink}" id="copyLinkInput" style="padding:5px; width:80%; font-size:0.8rem; border-radius:8px; border:1px solid #ccc; text-align:center;" readonly onClick="this.select();">
            <p style="font-size:0.8rem; color:#718096; margin-top:5px;">(ส่งลิงก์นี้ให้ทีมสภาลองกดเข้าแชทได้ทันทีเพื่อทดสอบระบบล็อกห้อง)</p>
        `;
        
        // เริ่มฟังก์ชันตรวจจับว่า มีสภานักเรียนคนไหนกดรับห้องนี้ไปหรือยังแบบ Real-time
        listenForCouncilClaim();
    });
}

// คอยดักฟังบนคลาวด์: ถ้านักเรียนเปิดหน้านี้รออยู่ แล้วมีสภากดลิงก์เข้ามา... หน้าจอจะเด้งเข้าห้องแชทสดทันที!
function listenForCouncilClaim() {
    dbRoomRef = database.ref('rooms/' + currentRoomId);
    dbRoomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.status === "chatting") {
            // ถ้าระบบเปลี่ยนสถานะเป็น chatting แปลว่าสภากดรับแล้ว! ดึงเข้าห้องแชทเลย
            dbRoomRef.off(); // ปิดการตรวจจับเพื่อประหยัดทรัพยากร
            enterChatRoom();
        }
    });
}

// ================= ฟังก์ชันหลัก: ฝั่งสภานักเรียนกดรับเคส (Claim Room) =================

function checkAndClaimRoom(roomId) {
    const roomRef = database.ref('rooms/' + roomId);
    
    roomRef.once('value').then((snapshot) => {
        const data = snapshot.val();
        
        if (!data) {
            alert("❌ ไม่พบห้องสนทนานี้ในระบบ อาจเป็นลิงก์ที่หมดอายุแล้ว");
            window.location.search = ""; // ล้าง URL ย้อนกลับหน้าแรก
            return;
        }
        
        if (data.status === "waiting") {
            // ✅ สถานะปกติ สภากดรับเคสนี้ได้ทันที!
            roomRef.update({
                status: "chatting",
                claimedBy: "สภานักเรียนท่านหนึ่ง"
            }).then(() => {
                enterChatRoom();
            });
        } else {
            // ❌ มีคนกดตัดหน้าไปแล้ว! โชว์หน้าต่างล็อกตามบรีฟไอเดียของคุณ
            alert("⚠️ ขออภัย เคสรับคำปรึกษานี้ มีเพื่อนสภานักเรียนท่านอื่นเข้าไปดูแลเรียบร้อยแล้วครับ");
            window.location.search = ""; // ล้าง URL เด้งกลับหน้าหลักทันที ป้องกันการเข้าซ้ำ บัคเป็นศูนย์
        }
    });
}

// ================= ฟังก์ชันบริหารจัดการระบบห้องแชทสดเสมือนจริง ออนไลน์ 100% =================

function enterChatRoom() {
    switchView('chat-page');
    document.getElementById('chat-mascot-container').innerHTML = cloudSVG.exhale;
    
    const chatLogs = document.getElementById('chat-logs');
    chatLogs.innerHTML = `<div class="system-log">เชื่อมต่อคลาวด์สำเร็จ เริ่มสนทนาในฐานะ "${currentRole}"</div>`;
    
    document.getElementById('alert-disconnect-box').style.display = "none";
    document.getElementById('status-text').innerText = "คู่สนทนากำลังออนไลน์";
    document.getElementById('status-text').style.color = "";
    document.querySelector('.dot').classList.add('pulse');

    // ลูปดักฟังข้อความแชทใหม่ๆ บนฐานข้อมูล Firebase แบบ Real-time ใครพิมพ์อะไร จะขึ้นหน้าจอพร้อมกันทันที
    dbMessagesRef = database.ref('messages/' + currentRoomId);
    dbMessagesRef.on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayNewMessage(msg.senderRole, msg.text);
    });
    
    // ตั้งค่าลูปน้องก้อนเมฆทักทายฝั่งซ้ายปกติ
    clearInterval(mascotQuoteInterval);
    mascotQuoteInterval = setInterval(() => {
        const randomIndex = Math.floor(Math.random() * mascotQuotes.length);
        document.getElementById('mascot-text').innerText = mascotQuotes[randomIndex];
    }, 7000);
}

// ยิงข้อมูลข้อความขึ้นฐานข้อมูลออนไลน์เมื่อกดส่ง
function sendChatMessage() {
    const inputElement = document.getElementById('chat-input-field');
    const messageText = inputElement.value.trim();
    if (messageText === "" || !currentRoomId) return;
    
    // บันทึกข้อความแชทลงฐานข้อมูลคลาวด์กลาง
    database.ref('messages/' + currentRoomId).push({
        senderRole: currentRole,
        text: messageText,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    inputElement.value = "";
}

// แสดงข้อความบนแอปพลิเคชันแบบแยกฝั่งอัตโนมัติ
function displayNewMessage(senderRole, text) {
    const chatLogs = document.getElementById('chat-logs');
    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble');
    
    // เช็กว่าถ้าบทบาทของคนส่งข้อความตรงกับตัวเรา ให้ชิดขวา (สีฟ้า) ถ้าสลับบทบาทให้ชิดซ้าย (สีขาว/เทา)
    if (senderRole === currentRole) {
        bubble.classList.add('user-1');
        bubble.innerText = `คุณ: ${text}`;
    } else {
        bubble.classList.add('user-2');
        // แสดงป้ายระบุชื่อให้ชัดเจนตามตำแหน่ง
        const cleanName = senderRole.includes("ต้องการ") ? "คนที่ 1 (นักเรียน)" : "คนที่ 2 (สภา)";
        bubble.innerText = `${cleanName}: ${text}`;
    }
    
    chatLogs.appendChild(bubble);
    chatLogs.scrollTop = chatLogs.scrollHeight;
}

// ดักฟังกดออกแชท: ตรวจจับว่าคู่สนทนากดออกจากการเชื่อมต่อหรือยัง
function leaveChatRoom() {
    if (dbMessagesRef) dbMessagesRef.off();
    clearInterval(mascotQuoteInterval);
    
    // ไปลบห้องนั้นออกจากระบบคลาวด์เพื่อเคลียร์ความจำ หรือเปลี่ยนสถานะเป็นสิ้นสุด
    if (currentRoomId) {
        database.ref('rooms/' + currentRoomId).update({ status: "ended" });
    }
    
    document.getElementById('alert-disconnect-box').style.display = "block";
    document.getElementById('status-text').innerText = "คู่สนทนาออฟไลน์แล้ว";
    document.getElementById('status-text').style.color = "#c53030";
    document.querySelector('.dot').classList.remove('pulse');
    
    const chatLogs = document.getElementById('chat-logs');
    const closingLog = document.createElement('div');
    closingLog.classList.add('system-log');
    closingLog.style.color = "#c53030";
    closingLog.innerText = "❌ การสนทนาสิ้นสุดลงแล้ว คุณสามารถกดปุ่มออกจากห้องแชทอีกครั้งเพื่อกลับหน้าหลัก";
    chatLogs.appendChild(closingLog);
    chatLogs.scrollTop = chatLogs.scrollHeight;

    document.querySelector('#chat-page .back-home-btn').setAttribute('onclick', 'forceReturnHome()');
}

function forceReturnHome() {
    // ล้างพารามิเตอร์ลิงก์บนแถบ URL ทั้งหมดเพื่อเริ่มรอบใหม่แบบสะอาด
    window.location.search = ""; 
}

function cancelMatching() {
    if (currentRoomId) database.ref('rooms/' + currentRoomId).remove();
    switchView('home-page');
}

function initBreathingGuide() {
    const textElement = document.getElementById('breathing-text');
    const container = document.getElementById('cloud-mascot-container');
    let isInhaling = true;
    
    clearInterval(breathingInterval);
    breathingInterval = setInterval(() => {
        isInhaling = !isInhaling;
        if (isInhaling) {
            textElement.innerText = "หายใจเข้าช้าๆ... 🧘";
            container.innerHTML = cloudSVG.inhale;
        } else {
            textElement.innerText = "ผ่อนลมหายใจออก... 🍃";
            container.innerHTML = cloudSVG.exhale;
        }
    }, 4000);
}

const cloudSVG = {
    inhale: `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M25,65 C12,65 8,52 18,42 C12,25 30,12 48,22 C58,8 82,14 85,32 C96,36 98,52 86,65 Z" fill="#e0f2fe" filter="drop-shadow(0 4px 6px rgba(186, 230, 253, 0.5))" stroke="#bae6fd" stroke-width="1.5"/><circle cx="38" cy="46" r="4" fill="#2d3748"/><circle cx="62" cy="46" r="4" fill="#2d3748"/><circle cx="32" cy="52" r="5" fill="#fca5a5" opacity="0.7"/><circle cx="68" cy="52" r="5" fill="#fca5a5" opacity="0.7"/><circle cx="50" cy="52" r="4" fill="#2d3748"/></svg>`,
    exhale: `<svg viewBox="0 0 100 100" width="100%" height="100%"><path d="M25,65 C12,65 8,52 18,42 C12,25 30,12 48,22 C58,8 82,14 85,32 C96,36 98,52 86,65 Z" fill="#e0f2fe" filter="drop-shadow(0 4px 6px rgba(186, 230, 253, 0.5))" stroke="#bae6fd" stroke-width="1.5"/><path d="M34,46 Q38,42 42,46" stroke="#2d3748" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M58,46 Q62,42 66,46" stroke="#2d3748" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="32" cy="52" r="5" fill="#fca5a5" opacity="0.7"/><circle cx="68" cy="52" r="5" fill="#fca5a5" opacity="0.7"/><path d="M44,53 Q50,59 56,53" stroke="#2d3748" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`
};

const mascotQuotes = [
    "เก่งมากแล้วนะวันนี้! ยินดีที่ได้เจอกันครับ 🌟",
    "เหนื่อยไหมครับ? ค่อยๆ คุย ค่อยๆ ระบายออกมานะ 🍃",
    "พื้นที่ตรงนี้ปลอดภัยสำหรับคุณเสมอ ปลดปล่อยใจได้เลยนะ ☁️",
    "เราอยู่ข้างๆ คุณตรงนี้เสมอ ไม่ต้องกังวลไปนะจ๊ะ 😊",
    "ภูมิใจในตัวคุณที่สุดเลยที่ผ่านวันนี้มาได้ สู้ๆ นะ 💕"
];
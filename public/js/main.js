// Global Socket Initialization
const socket = io('/');
window.socket = socket;

// DOM Elements
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const localWrapper = document.getElementById('local-wrapper');
const remoteWrapper = document.getElementById('remote-wrapper');
const statusMsg = document.getElementById('status-msg');
const lobby = document.getElementById('lobby');
const roomDiv = document.getElementById('room');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const createBtn = document.getElementById('create-btn');
const roomCodeDisplay = document.getElementById('room-code-display');

// Controls
const recordBtn = document.getElementById('record-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const recordingControls = document.getElementById('recording-controls');
const saveModal = document.getElementById('save-modal');
const saveNameInput = document.getElementById('save-name');
const confirmSaveBtn = document.getElementById('confirm-save-btn');
const deleteRecBtn = document.getElementById('delete-rec-btn');

// Invite Modal Elements
const inviteModal = document.getElementById('invite-modal');
const searchInput = document.getElementById('student-search-input');
const searchBtn = document.getElementById('search-student-btn');
const resultsContainer = document.getElementById('search-results');
const statusDiv = document.getElementById('invite-status');
const inviteStudentBtn = document.getElementById('invite-student-btn');
const closeInviteModalBtn = document.getElementById('close-invite-modal');

// Audio Context for Mixing
let audioContext;
let audioDestination;
let localAudioSource;
let remoteAudioSource;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isPaused = false;

function initAudioMixer() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioDestination = audioContext.createMediaStreamDestination();
    }
}

function connectLocalToMixer(stream) {
    initAudioMixer();
    if (stream.getAudioTracks().length > 0 && !localAudioSource) {
        localAudioSource = audioContext.createMediaStreamSource(stream);
        localAudioSource.connect(audioDestination);
    }
}

function connectRemoteToMixer(stream) {
    initAudioMixer();
    if (stream.getAudioTracks().length > 0 && !remoteAudioSource) {
        remoteAudioSource = audioContext.createMediaStreamSource(stream);
        remoteAudioSource.connect(audioDestination);
    }
}

// Main Initialization Function
async function initializeMeeting() {
    // Only run on meeting page
    if (!document.body.classList.contains('meeting-body')) return;

    try {
        const res = await fetch('/api/me');
        const data = await res.json();

        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return;
        }

        // Store user info
        sessionStorage.setItem('userName', data.name);
        sessionStorage.setItem('userRole', data.role);
        sessionStorage.setItem('userEmail', data.email);

        // Fetch and display Server IP
        try {
            const ipRes = await fetch('/api/server-ip');
            const ipData = await ipRes.json();
            const serverIpDisplay = document.getElementById('server-ip-display');
            if (serverIpDisplay && ipData.ip) {
                const protocol = window.location.protocol;
                const link = `${protocol}//${ipData.ip}:${ipData.port}`;
                serverIpDisplay.style.display = 'block';
            }
        } catch (e) {
            console.log('Could not fetch server IP');
        }

        // UI Setup based on role
        if (data.role === 'student') {
            if (createBtn) createBtn.style.display = 'none';
            const lobbyMsg = document.getElementById('lobby-msg');
            if (lobbyMsg) lobbyMsg.textContent = 'Enter a room code to join a meeting.';

            // Hide name input for students, show greeting
            const nameInput = document.getElementById('name-input');
            const userGreeting = document.getElementById('user-greeting');
            const userNameDisplay = document.getElementById('user-name-display');

            if (nameInput) nameInput.style.display = 'none';
            if (userGreeting) userGreeting.style.display = 'block';
            if (userNameDisplay) userNameDisplay.textContent = data.name;
        } else {
            // Admin: keep name input visible
            const nameInput = document.getElementById('name-input');
            if (nameInput) nameInput.placeholder = "Enter Your Name (Admin)";

            // Show recording controls if admin
            const recordingControls = document.getElementById('recording-controls');
            if (recordingControls) recordingControls.style.display = 'flex';

            // Show invite button for admins if room code exists
            const urlParams = new URLSearchParams(window.location.search);
            const roomCode = urlParams.get('room');
            const inviteStudentBtn = document.getElementById('invite-student-btn');
            if (roomCode && inviteStudentBtn) {
                inviteStudentBtn.style.display = 'block';
            }
        }

        // Pre-fill room code if in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        if (roomCode && roomInput) {
            roomInput.value = roomCode;
        }

    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

// Invite Modal Logic
if (inviteStudentBtn) {
    inviteStudentBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('name-input');
        if (nameInput && !nameInput.value.trim()) {
            alert('Please enter your name first.');
            nameInput.focus();
            return;
        }

        if (inviteModal) {
            inviteModal.style.display = 'flex';
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            if (resultsContainer) {
                resultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 40px;">Enter a search term to find students</div>';
            }
            if (statusDiv) statusDiv.style.display = 'none';
        }
    });
}

if (closeInviteModalBtn) {
    closeInviteModalBtn.addEventListener('click', () => {
        if (inviteModal) inviteModal.style.display = 'none';
    });
}

// Search Handler
async function performSearch() {
    if (!searchInput || !statusDiv || !resultsContainer) return;

    const query = searchInput.value.trim();
    if (query.length < 2) {
        statusDiv.textContent = 'Please enter at least 2 characters';
        statusDiv.style.background = 'rgba(239, 68, 68, 0.2)';
        statusDiv.style.color = '#ef4444';
        statusDiv.style.display = 'block';
        return;
    }

    statusDiv.style.display = 'none';
    resultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Searching...</div>';

    try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(query)}`);
        const students = await res.json();

        resultsContainer.innerHTML = '';

        if (students.length === 0) {
            resultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">No students found</div>';
            return;
        }

        students.forEach(student => {
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);';

            const info = document.createElement('div');
            info.innerHTML = `
                <div style="font-weight: 600; color: white;">${student.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">ID: ${student.student_id || 'N/A'}</div>
            `;

            const inviteBtn = document.createElement('button');
            inviteBtn.textContent = 'Invite';
            inviteBtn.className = 'cta-btn';
            inviteBtn.style.padding = '6px 16px';
            inviteBtn.style.fontSize = '0.9rem';
            inviteBtn.onclick = () => sendInvitation(student.student_id || student.email, student.name);

            item.appendChild(info);
            item.appendChild(inviteBtn);
            resultsContainer.appendChild(item);
        });

    } catch (error) {
        console.error('Search failed:', error);
        resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; margin-top: 20px;">Search failed. Please try again.</div>';
    }
}

    if (searchBtn) {
        searchBtn.addEventListener('click', () => performSearch());
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

// Send Invitation Logic
async function sendInvitation(identifier, studentName) {
    const roomCode = new URLSearchParams(window.location.search).get('room');

    if (!statusDiv) return;

    try {
        const res = await fetch('/api/me');
        const adminData = await res.json();

        if (window.socket) {
            window.socket.emit('send-invitation', {
                studentIdentifier: identifier,
                roomCode,
                adminName: adminData.name || adminData.username,
                adminId: adminData.id
            });

            statusDiv.textContent = `Invitation sent to ${studentName}!`;
            statusDiv.style.background = 'rgba(16, 185, 129, 0.2)';
            statusDiv.style.color = '#10b981';
            statusDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to invite:', error);
        statusDiv.textContent = 'Failed to send invitation';
        statusDiv.style.display = 'block';
    }
}

// Run initialization
initializeMeeting();

const hostname = window.location.hostname;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

let localStream;
let peerConnection;
let roomId;

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

function generateRoomId() {
    return Math.random().toString(36).substring(2, 5) + '-' +
        Math.random().toString(36).substring(2, 5) + '-' +
        Math.random().toString(36).substring(2, 5);
}

if (createBtn) {
    createBtn.addEventListener('click', () => {
        const newId = generateRoomId();
        if (roomInput) roomInput.value = newId;
        joinRoom(newId);
    });
}

if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        const code = roomInput.value.trim();
        if (code) {
            joinRoom(code);
        } else {
            alert("Please enter a room code");
        }
    });
}

// Copy Code Button Logic
const copyCodeBtn = document.getElementById('copy-code-btn');
if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
        const code = roomCodeDisplay.innerText;
        if (code) {
            navigator.clipboard.writeText(code).then(() => {
                const originalHTML = copyCodeBtn.innerHTML;
                copyCodeBtn.innerHTML = '<span style="font-size: 0.9rem;">Copied!</span><span style="font-size: 0.9rem;">✅</span>';
                setTimeout(() => {
                    copyCodeBtn.innerHTML = originalHTML;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }
    });
}

if (roomInput) {
    roomInput.addEventListener('click', () => {
        if (roomInput.value) {
            roomInput.select();
            navigator.clipboard.writeText(roomInput.value).then(() => {
                // Visual feedback
                const originalBorder = roomInput.style.borderColor;
                roomInput.style.borderColor = '#10B981'; // Green
                setTimeout(() => {
                    roomInput.style.borderColor = originalBorder;
                }, 1000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }
    });
}

const audioInputSelect = document.getElementById('audio-input-select');

async function getAudioDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        if (audioInputSelect) {
            audioInputSelect.innerHTML = '';
            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${audioInputSelect.length + 1}`;
                audioInputSelect.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Error listing audio devices:', err);
    }
}

getAudioDevices();

async function joinRoom(id) {
    try {
        // Validate room code first
        const validateRes = await fetch('/api/meeting/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: id })
        });
        const validateData = await validateRes.json();

        if (!validateData.valid) {
            alert(validateData.error || 'Invalid room code');
            window.location.href = '/index.html'; // Clear URL params
            return;
        }
        // Handle name input based on role
        let userName = '';
        const userRole = sessionStorage.getItem('userRole');

        if (userRole === 'student') {
            userName = sessionStorage.getItem('userName');
        } else {
            const nameInput = document.getElementById('name-input');
            userName = nameInput ? nameInput.value.trim() : '';
        }

        if (!userName) {
            alert('Please enter your name before joining the meeting');
            return;
        }

        roomId = id;
        roomCodeDisplay.innerText = roomId;

        const audioSource = audioInputSelect ? audioInputSelect.value : undefined;
        const constraints = {
            video: true,
            audio: audioSource ? { deviceId: { exact: audioSource } } : true
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;

        // Update local video label with user's name
        const localLabel = document.querySelector('#local-wrapper .video-label');
        if (localLabel) {
            localLabel.textContent = userName;
        }

        // Connect local audio to mixer
        connectLocalToMixer(localStream);

        lobby.style.display = 'none';
        roomDiv.style.display = 'flex';

        socket.emit('join-room', id, socket.id, userName);

        // Start transcription
        startLiveTranscription();

    } catch (err) {
        console.error('Error accessing media:', err);
        alert(`Could not access camera/microphone.\nError: ${err.name}\nMessage: ${err.message}\n\nPlease check permissions and ensure no other app is using the camera.`);
    }
}

let connectedStudentName = '';

socket.on('full-room', () => {
    alert('Room is full');
    location.reload();
});

socket.on('user-connected', (userId, userName) => {
    console.log('User connected:', userId, 'Name:', userName);
    statusMsg.innerText = 'Connected';
    remoteWrapper.style.display = 'flex';
    videoGrid.classList.add('two-users');

    // Store connected user's name if available
    if (userName) {
        connectedStudentName = userName;
        console.log('Connected student name:', connectedStudentName);
    }

    // Send my name to the new user (so they know who I am)
    const myName = sessionStorage.getItem('userName');
    if (myName) {
        socket.emit('send-name', myName);
    }

    createOffer();
});

socket.on('update-peer-name', (name) => {
    console.log('Peer name received:', name);
    connectedStudentName = name;
});

socket.on('user-disconnected', () => {
    console.log('User disconnected');
    statusMsg.innerText = 'Waiting for someone to join...';
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    remoteWrapper.style.display = 'none';
    videoGrid.classList.remove('two-users');
    connectedStudentName = ''; // Reset name
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
});

socket.on('offer', async (offer) => {
    if (!peerConnection) createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async (candidate) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('Track received:', event.track.kind);
        remoteVideo.srcObject = event.streams[0];

        // Connect remote audio to mixer
        if (event.track.kind === 'audio') {
            connectRemoteToMixer(event.streams[0]);
        }

        remoteWrapper.style.display = 'flex';
        videoGrid.classList.add('two-users');
        statusMsg.innerText = 'Connected';
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

async function createOffer() {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
}

// Controls
let isAudioMuted = false;
let isVideoOff = false;

document.getElementById('mic-btn').addEventListener('click', (e) => {
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    e.currentTarget.classList.toggle('active');
    e.currentTarget.innerText = isAudioMuted ? '🔇' : '🎤';
});

document.getElementById('cam-btn').addEventListener('click', (e) => {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff;
    e.currentTarget.classList.toggle('active');
    e.currentTarget.innerText = isVideoOff ? '🚫' : '📷';
});

document.getElementById('leave-btn').addEventListener('click', () => {
    if (isRecording) {
        if (confirm("Recording is in progress. Stop and save?")) {
            stopRecording();
        } else {
            return;
        }
    } else {
        window.location.href = '/index.html';
    }
});

const headerLeaveBtn = document.getElementById('header-leave-btn');
if (headerLeaveBtn) {
    headerLeaveBtn.addEventListener('click', () => {
        window.location.href = '/index.html';
    });
}

// Recording Logic
if (recordBtn) recordBtn.addEventListener('click', startRecording);
if (pauseBtn) pauseBtn.addEventListener('click', pauseRecording);
if (stopBtn) stopBtn.addEventListener('click', stopRecording);

function startRecording() {
    if (!localStream) return;

    // Ensure mixer is ready
    initAudioMixer();

    audioChunks = [];

    // Use the mixed stream (Local + Remote)
    const mixedStream = audioDestination.stream;

    mediaRecorder = new MediaRecorder(mixedStream);

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        // Open Save Modal
        if (saveModal) {
            saveModal.style.display = 'block';

            // Auto-fill student name if detected
            const studentNameInput = document.getElementById('student-name-input');
            if (studentNameInput && connectedStudentName) {
                studentNameInput.value = connectedStudentName;
            }

            updateFilenamePreview();
        }
    };

    mediaRecorder.start();
    isRecording = true;
    isPaused = false;

    recordBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
    stopBtn.style.display = 'inline-block';
    pauseBtn.innerText = 'Pause';
}

function pauseRecording() {
    if (!isRecording) return;

    if (isPaused) {
        mediaRecorder.resume();
        pauseBtn.innerText = 'Pause';
        isPaused = false;
    } else {
        mediaRecorder.pause();
        pauseBtn.innerText = 'Resume';
        isPaused = true;
    }
}

function stopRecording() {
    if (!isRecording) return;

    mediaRecorder.stop();
    isRecording = false;
    isPaused = false;

    recordBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
}

// Filename Construction Logic
const studentNameInput = document.getElementById('student-name-input');
const interviewTypeInputs = document.getElementsByName('interview-type');
const filenamePreview = document.getElementById('filename-preview');

function updateFilenamePreview() {
    if (!filenamePreview) return;

    const nameInput = document.getElementById('name-input');
    const interviewerName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : (sessionStorage.getItem('userName') || 'Admin');
    const studentName = studentNameInput ? (studentNameInput.value.trim() || '[Student Name]') : '[Student Name]';

    const date = new Date();
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

    let interviewType = 'Entrance';
    if (interviewTypeInputs) {
        for (const input of interviewTypeInputs) {
            if (input.checked) {
                interviewType = input.value;
                break;
            }
        }
    }

    // Format: [Interviewer Name] - [Student Name] / [Date] / [Interview Type]
    // Note: Slashes in filenames can be problematic for file systems, usually replaced by dashes or underscores.
    // However, the user explicitly asked for slashes in the display format.
    // For the actual filename sent to server, we might want to sanitize it, but let's stick to the display for now.
    // Wait, slashes are definitely invalid in filenames on Windows/Linux.
    // I will use the requested format for the "Name" field in DB, but the server handles the actual filename generation (rec-timestamp).
    // The "name" field in DB is just a display name, so slashes are fine there.

    filenamePreview.textContent = `${interviewerName} - ${studentName} / ${dateStr} / ${interviewType}`;
}

if (studentNameInput) {
    studentNameInput.addEventListener('input', updateFilenamePreview);
}

if (interviewTypeInputs) {
    for (const input of interviewTypeInputs) {
        input.addEventListener('change', updateFilenamePreview);
    }
}

if (confirmSaveBtn) {
    confirmSaveBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('name-input');
        const interviewerName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : (sessionStorage.getItem('userName') || 'Admin');
        const studentName = studentNameInput ? studentNameInput.value.trim() : 'Unknown';

        if (!studentName) {
            alert('Please enter the student name.');
            return;
        }

        const date = new Date();
        const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

        let interviewType = 'Entrance';
        if (interviewTypeInputs) {
            for (const input of interviewTypeInputs) {
                if (input.checked) {
                    interviewType = input.value;
                    break;
                }
            }
        }

        const finalName = `${interviewerName} - ${studentName} / ${dateStr} / ${interviewType}`;

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('name', finalName);

        try {
            const res = await fetch('/api/recordings/upload', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                alert('Recording saved successfully!');
                saveModal.style.display = 'none';
                if (studentNameInput) studentNameInput.value = '';
            } else {
                alert('Failed to save recording.');
            }
        } catch (err) {
            console.error(err);
            alert('Error uploading recording.');
        }
    });
}

if (deleteRecBtn) {
    deleteRecBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to discard this recording?')) {
            saveModal.style.display = 'none';
            saveNameInput.value = '';
            audioChunks = [];
        }
    });
}

// New Buttons
const backToDashboardBtn = document.getElementById('back-to-dashboard');
if (backToDashboardBtn) {
    backToDashboardBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/me');
            const data = await res.json();

            if (data.loggedIn) {
                if (data.role === 'admin') {
                    window.location.href = '/admin.html';
                } else {
                    window.location.href = '/student.html';
                }
            } else {
                window.location.href = '/login.html';
            }
        } catch (error) {
            window.location.href = '/login.html';
        }
    });
}

// Function to add activity log entry in meeting
function addMeetingActivity(type, message) {
    const logContent = document.getElementById('meeting-activity-log');
    if (!logContent) return;
    
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

    const entry = document.createElement('div');
    entry.style.cssText = 'padding: 5px 0; border-bottom: 1px solid rgba(255,255,0.1); font-size: 0.9rem;';
    entry.innerHTML = `
        <span style="color: #94A3B8; font-size: 0.8rem;">[${timestamp}]</span>
        <span style="color: #818CF8; margin: 0 5px;">[${type}]</span>
        <span style="color: #F1F5F9;">${message}</span>
    `;

    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
}

// Live Transcription (Web Speech API)
let recognition;
const subtitleOverlay = document.getElementById('subtitle-overlay');

function startLiveTranscription() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'tl-PH'; // Tagalog/English (Taglish)

        recognition.onstart = () => {
            console.log('Live transcription started');
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                console.log('Transcript:', finalTranscript);
                socket.emit('subtitle', roomId, finalTranscript);
                showSubtitle(`You: ${finalTranscript}`);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
        };

        recognition.onend = () => {
            // Auto-restart if it stops
            if (roomId) recognition.start();
        };

        recognition.start();
    } else {
        console.warn('Web Speech API not supported in this browser.');
    }
}

function showSubtitle(text) {
    if (subtitleOverlay) {
        subtitleOverlay.innerText = text;
        subtitleOverlay.style.display = 'block';

        // Hide after 5 seconds of silence
        clearTimeout(subtitleOverlay.timeout);
        subtitleOverlay.timeout = setTimeout(() => {
            subtitleOverlay.style.display = 'none';
        }, 5000);
    }
}

socket.on('subtitle', (text) => {
    showSubtitle(text);
});

// Add event listeners for meeting activity logging
socket.on('user-connected', (userId, userName) => {
    addMeetingActivity('User', `${userName || 'A user'} joined the meeting`);
});

socket.on('user-disconnected', (userId) => {
    addMeetingActivity('User', `A user left the meeting`);
});

// Add click event to show activity log modal
document.addEventListener('DOMContentLoaded', () => {
    // Add a button to open the activity log modal if it doesn't exist
    const controlsBar = document.querySelector('.controls-bar');
    if (controlsBar && !document.getElementById('activity-log-btn')) {
        const activityLogBtn = document.createElement('button');
        activityLogBtn.id = 'activity-log-btn';
        activityLogBtn.className = 'control-btn';
        activityLogBtn.title = 'View Activity Log';
        activityLogBtn.innerHTML = '📋';
        activityLogBtn.style.marginLeft = '10px';
        activityLogBtn.onclick = () => {
            document.getElementById('activity-log-modal').style.display = 'block';
        };
        controlsBar.appendChild(activityLogBtn);
    }
});

// Meeting Main Entry Point
// Coordinates all meeting modules

import { startLiveTranscription, stopLiveTranscription } from './transcription.js';
import {
    initAudioMixer,
    connectLocalToMixer,
    connectRemoteToMixer,
    startRecording,
    pauseRecording,
    stopRecording,
    getRecordingState,
    uploadRecording
} from './recording.js';
import {
    createPeerConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    closePeerConnection
} from './webrtc.js';
import { performSearch, sendInvitation } from './invite.js';
import { setupControls } from './controls.js';
import {
    elements,
    showLobby,
    showRoom,
    updateStatus,
    showRemoteVideo,
    hideRemoteVideo,
    updateRoomCode,
    updateLocalLabel,
    showRecordingControls,
    updateRecordingButtons,
    generateRoomId
} from './ui.js';

// Global state
let localStream = null;
let roomId = null;
let userRole = null;
let userName = null;
let connectedStudentName = '';

// Socket.IO
const socket = io('/');
window.socket = socket;

// Audio device selection
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

// Initialize meeting
async function initializeMeeting() {
    if (!document.body.classList.contains('meeting-body')) return;

    try {
        const res = await fetch('/api/me');
        const data = await res.json();

        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return;
        }

        // Store user info
        userName = data.name;
        userRole = data.role;
        sessionStorage.setItem('userName', userName);
        sessionStorage.setItem('userRole', userRole);
        sessionStorage.setItem('userEmail', data.email);

        // UI setup based on role
        if (userRole === 'student') {
            if (elements.createBtn) elements.createBtn.style.display = 'none';
            const lobbyMsg = document.getElementById('lobby-msg');
            if (lobbyMsg) lobbyMsg.textContent = 'Enter a room code to join a meeting.';

            const nameInput = document.getElementById('name-input');
            const userGreeting = document.getElementById('user-greeting');
            const userNameDisplay = document.getElementById('user-name-display');

            if (nameInput) nameInput.style.display = 'none';
            if (userGreeting) userGreeting.style.display = 'block';
            if (userNameDisplay) userNameDisplay.textContent = userName;
        } else {
            showRecordingControls(true);
            const urlParams = new URLSearchParams(window.location.search);
            const roomCode = urlParams.get('room');
            if (roomCode && elements.inviteStudentBtn) {
                elements.inviteStudentBtn.style.display = 'block';
            }
        }

        // Pre-fill room code if in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        if (roomCode && elements.roomInput) {
            elements.roomInput.value = roomCode;
        }

    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

// Join room function
async function joinRoom(id) {
    try {
        // Validate room code
        const validateRes = await fetch('/api/meeting/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: id })
        });
        const validateData = await validateRes.json();

        if (!validateData.valid) {
            alert(validateData.error || 'Invalid room code');
            window.location.href = '/index.html';
            return;
        }

        // Get user name
        let displayName = '';
        if (userRole === 'student') {
            displayName = userName;
        } else {
            const nameInput = document.getElementById('name-input');
            displayName = nameInput ? nameInput.value.trim() : '';
        }

        if (!displayName) {
            alert('Please enter your name before joining the meeting');
            return;
        }

        roomId = id;
        updateRoomCode(roomId);

        // Get media
        const audioInputSelect = document.getElementById('audio-input-select');
        const audioSource = audioInputSelect ? audioInputSelect.value : undefined;
        const constraints = {
            video: true,
            audio: audioSource ? { deviceId: { exact: audioSource } } : true
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        elements.localVideo.srcObject = localStream;
        updateLocalLabel(displayName);

        // Connect audio to mixer
        connectLocalToMixer(localStream);

        // Show room
        showRoom();

        // Move videos from holding area to visible columns
        const instructorColumn = document.getElementById('instructor-column');
        const studentColumn = document.getElementById('student-column');
        const localWrapper = document.getElementById('local-wrapper');
        const remoteWrapper = document.getElementById('remote-wrapper');

        // Admin is instructor (local video in instructor column)
        // Student sees themselves in student column
        if (userRole === 'admin') {
            if (instructorColumn && localWrapper) {
                instructorColumn.appendChild(localWrapper);
                localWrapper.style.display = 'flex';
            }
            if (studentColumn && remoteWrapper) {
                studentColumn.appendChild(remoteWrapper);
            }
        } else {
            // Student role
            if (studentColumn && localWrapper) {
                studentColumn.appendChild(localWrapper);
                localWrapper.style.display = 'flex';
            }
            if (instructorColumn && remoteWrapper) {
                instructorColumn.appendChild(remoteWrapper);
            }
        }

        // Join via socket
        socket.emit('join-room', id, socket.id, displayName);

        // Start transcription
        startLiveTranscription(roomId, userRole, appendTranscript, socket);

        // Setup controls
        setupControls(localStream, handleLeave);

    } catch (err) {
        console.error('Error accessing media:', err);
        alert(`Could not access camera/microphone.\nError: ${err.name}\nMessage: ${err.message}`);
    }
}

// Socket event handlers
socket.on('full-room', () => {
    alert('Room is full');
    location.reload();
});

socket.on('user-connected', (userId, userName) => {
    console.log('User connected:', userId, 'Name:', userName);
    updateStatus('Connected');
    showRemoteVideo();

    if (userName) {
        connectedStudentName = userName;
    }

    const myName = sessionStorage.getItem('userName');
    if (myName) {
        socket.emit('send-name', myName);
    }

    // Create peer connection and offer
    const peerConn = createPeerConnection(localStream, handleRemoteTrack, socket);
    createOffer(socket);
});

socket.on('update-peer-name', (name) => {
    connectedStudentName = name;
});

socket.on('user-disconnected', () => {
    updateStatus('Waiting for someone to join...');
    if (elements.remoteVideo.srcObject) {
        elements.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        elements.remoteVideo.srcObject = null;
    }
    hideRemoteVideo();
    connectedStudentName = '';
    closePeerConnection();
});

socket.on('offer', async (offer) => {
    if (!localStream) return;
    createPeerConnection(localStream, handleRemoteTrack, socket);
    await handleOffer(offer, socket);
});

socket.on('answer', async (answer) => {
    await handleAnswer(answer);
});

socket.on('ice-candidate', async (candidate) => {
    await handleIceCandidate(candidate);
});

// Handle remote track
function handleRemoteTrack(event) {
    elements.remoteVideo.srcObject = event.streams[0];
    if (event.track.kind === 'audio') {
        connectRemoteToMixer(event.streams[0]);
    }
    // Make sure remote wrapper is visible
    const remoteWrapper = document.getElementById('remote-wrapper');
    if (remoteWrapper) {
        remoteWrapper.style.display = 'flex';
    }
    showRemoteVideo();
    updateStatus('Connected');
}

// Handle leave
function handleLeave() {
    const { isRecording } = getRecordingState();
    if (isRecording) {
        if (confirm("Recording is in progress. Stop and save?")) {
            handleStopRecording();
        } else {
            return;
        }
    } else {
        window.location.href = '/index.html';
    }
}

// Recording handlers
function handleStartRecording() {
    const success = startRecording((chunks) => {
        // Store chunks and show save modal
        handleRecordingStop(chunks);
    });

    if (success) {
        updateRecordingButtons('recording');
    }
}

function handlePauseRecording() {
    const state = pauseRecording();
    if (state) {
        updateRecordingButtons(state);
    }
}

function handleStopRecording() {
    const success = stopRecording();
    if (success) {
        updateRecordingButtons('stopped');
    }
}

// Transcript display
function appendTranscript(role, text) {
    const boxId = role === 'admin' ? 'instructor-transcript' : 'student-transcript';
    const container = document.getElementById(boxId);

    if (container) {
        const line = document.createElement('div');
        line.className = 'transcript-line';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        line.innerHTML = `<span class="time">${time}</span>${safeText}`;
        container.appendChild(line);
        container.scrollTop = container.scrollHeight;
    }
}

// Event listeners
if (elements.createBtn) {
    elements.createBtn.addEventListener('click', () => {
        const newId = generateRoomId();
        if (elements.roomInput) elements.roomInput.value = newId;
        joinRoom(newId);
    });
}

if (elements.joinBtn) {
    elements.joinBtn.addEventListener('click', () => {
        const code = elements.roomInput.value.trim();
        if (code) {
            joinRoom(code);
        } else {
            alert("Please enter a room code");
        }
    });
}

if (elements.recordBtn) elements.recordBtn.addEventListener('click', handleStartRecording);
if (elements.pauseBtn) elements.pauseBtn.addEventListener('click', handlePauseRecording);
if (elements.stopBtn) elements.stopBtn.addEventListener('click', handleStopRecording);

// Invite modal
if (elements.inviteStudentBtn) {
    elements.inviteStudentBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('name-input');
        if (nameInput && !nameInput.value.trim()) {
            alert('Please enter your name first.');
            nameInput.focus();
            return;
        }

        if (elements.inviteModal) {
            elements.inviteModal.style.display = 'flex';
            if (elements.searchInput) {
                elements.searchInput.value = '';
                elements.searchInput.focus();
            }
        }
    });
}

if (elements.closeInviteModalBtn) {
    elements.closeInviteModalBtn.addEventListener('click', () => {
        if (elements.inviteModal) elements.inviteModal.style.display = 'none';
    });
}

if (elements.searchBtn) {
    elements.searchBtn.addEventListener('click', () => {
        const query = elements.searchInput.value.trim();
        performSearch(query, elements.resultsContainer, elements.statusDiv);
    });
}

if (elements.searchInput) {
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = elements.searchInput.value.trim();
            performSearch(query, elements.resultsContainer, elements.statusDiv);
        }
    });
}

// Save Modal Elements and Functionality
const confirmSaveBtn = document.getElementById('confirm-save-btn');
const deleteRecBtn = document.getElementById('delete-rec-btn');
const studentNameInput = document.getElementById('student-name-input');
const interviewTypeInputs = document.getElementsByName('interview-type');
const filenamePreview = document.getElementById('filename-preview');
let recordedAudioChunks = [];

// Store audio chunks when recording stops
function handleRecordingStop(chunks) {
    recordedAudioChunks = chunks;
    if (elements.saveModal) {
        elements.saveModal.style.display = 'block';
        if (studentNameInput && connectedStudentName) {
            studentNameInput.value = connectedStudentName;
        }
        updateFilenamePreview();
    }
}

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

        const audioBlob = new Blob(recordedAudioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('name', finalName);

        try {
            const res = await fetch('/api/recordings/upload', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': window.csrfToken || ''
                },
                body: formData
            });

            if (res.ok) {
                alert('Recording saved successfully!');
                elements.saveModal.style.display = 'none';
                if (studentNameInput) studentNameInput.value = '';
                recordedAudioChunks = [];
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
            elements.saveModal.style.display = 'none';
            if (studentNameInput) studentNameInput.value = '';
            recordedAudioChunks = [];
        }
    });
}

// Initialize
initializeMeeting();

// Fetch CSRF token
fetch('/api/csrf-token', {
    credentials: 'include'
})
    .then(response => response.json())
    .then(data => {
        window.csrfToken = data.csrfToken;
    })
    .catch(error => console.error('Error fetching CSRF token:', error));


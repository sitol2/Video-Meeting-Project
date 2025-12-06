// UI Module
// Handles DOM elements and UI updates

export const elements = {
    videoGrid: document.getElementById('video-grid'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    localWrapper: document.getElementById('local-wrapper'),
    remoteWrapper: document.getElementById('remote-wrapper'),
    statusMsg: document.getElementById('status-msg'),
    lobby: document.getElementById('lobby'),
    roomDiv: document.getElementById('room'),
    roomInput: document.getElementById('room-input'),
    joinBtn: document.getElementById('join-btn'),
    createBtn: document.getElementById('create-btn'),
    roomCodeDisplay: document.getElementById('room-code-display'),

    // Recording controls
    recordBtn: document.getElementById('record-btn'),
    pauseBtn: document.getElementById('pause-btn'),
    stopBtn: document.getElementById('stop-btn'),
    recordingControls: document.getElementById('recording-controls'),
    saveModal: document.getElementById('save-modal'),

    // Invite modal
    inviteModal: document.getElementById('invite-modal'),
    searchInput: document.getElementById('student-search-input'),
    searchBtn: document.getElementById('search-student-btn'),
    resultsContainer: document.getElementById('search-results'),
    statusDiv: document.getElementById('invite-status'),
    inviteStudentBtn: document.getElementById('invite-student-btn'),
    closeInviteModalBtn: document.getElementById('close-invite-modal')
};

export function showLobby() {
    if (elements.lobby) elements.lobby.style.display = 'flex';
    if (elements.roomDiv) elements.roomDiv.style.display = 'none';
}

export function showRoom() {
    if (elements.lobby) elements.lobby.style.display = 'none';
    if (elements.roomDiv) elements.roomDiv.style.display = 'flex';
}

export function updateStatus(message) {
    if (elements.statusMsg) {
        elements.statusMsg.innerText = message;
    }
}

export function showRemoteVideo() {
    if (elements.remoteWrapper) elements.remoteWrapper.style.display = 'flex';
    if (elements.videoGrid) elements.videoGrid.classList.add('two-users');
}

export function hideRemoteVideo() {
    if (elements.remoteWrapper) elements.remoteWrapper.style.display = 'none';
    if (elements.videoGrid) elements.videoGrid.classList.remove('two-users');
}

export function updateRoomCode(code) {
    if (elements.roomCodeDisplay) {
        elements.roomCodeDisplay.innerText = code;
    }
}

export function updateLocalLabel(name) {
    const localLabel = document.querySelector('#local-wrapper .video-label');
    if (localLabel) {
        localLabel.textContent = name;
    }
}

export function showRecordingControls(show) {
    if (elements.recordingControls) {
        elements.recordingControls.style.display = show ? 'flex' : 'none';
    }
}

export function updateRecordingButtons(state) {
    if (!elements.recordBtn || !elements.pauseBtn || !elements.stopBtn) return;

    if (state === 'recording') {
        elements.recordBtn.style.display = 'none';
        elements.pauseBtn.style.display = 'inline-block';
        elements.stopBtn.style.display = 'inline-block';
        elements.pauseBtn.innerText = 'Pause';
    } else if (state === 'paused') {
        elements.pauseBtn.innerText = 'Resume';
    } else if (state === 'resumed') {
        elements.pauseBtn.innerText = 'Pause';
    } else if (state === 'stopped') {
        elements.recordBtn.style.display = 'inline-block';
        elements.pauseBtn.style.display = 'none';
        elements.stopBtn.style.display = 'none';
    }
}

export function generateRoomId() {
    return Math.random().toString(36).substring(2, 5) + '-' +
        Math.random().toString(36).substring(2, 5) + '-' +
        Math.random().toString(36).substring(2, 5);
}

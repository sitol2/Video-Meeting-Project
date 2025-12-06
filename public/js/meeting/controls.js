// Controls Module
// Handles mic, camera, and leave button controls

let isAudioMuted = false;
let isVideoOff = false;

export function setupControls(localStream, onLeaveCallback) {
    // Mic toggle
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
        micBtn.addEventListener('click', (e) => {
            isAudioMuted = !isAudioMuted;
            if (localStream && localStream.getAudioTracks()[0]) {
                localStream.getAudioTracks()[0].enabled = !isAudioMuted;
            }
            e.currentTarget.classList.toggle('active');
            e.currentTarget.innerText = isAudioMuted ? '🔇' : '🎤';
        });
    }

    // Camera toggle
    const camBtn = document.getElementById('cam-btn');
    if (camBtn) {
        camBtn.addEventListener('click', (e) => {
            isVideoOff = !isVideoOff;
            if (localStream && localStream.getVideoTracks()[0]) {
                localStream.getVideoTracks()[0].enabled = !isVideoOff;
            }
            e.currentTarget.classList.toggle('active');
            e.currentTarget.innerText = isVideoOff ? '🚫' : '📷';
        });
    }

    // Leave button
    const leaveBtn = document.getElementById('leave-btn');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            if (onLeaveCallback) {
                onLeaveCallback();
            }
        });
    }

    // Header leave button
    const headerLeaveBtn = document.getElementById('header-leave-btn');
    if (headerLeaveBtn) {
        headerLeaveBtn.addEventListener('click', () => {
            window.location.href = '/index.html';
        });
    }
}

export function getControlsState() {
    return { isAudioMuted, isVideoOff };
}

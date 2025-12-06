// Recording Module
// Handles audio recording with mixing of local and remote streams

let audioContext;
let audioDestination;
let localAudioSource;
let remoteAudioSource;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isPaused = false;

export function initAudioMixer() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioDestination = audioContext.createMediaStreamDestination();
    }
}

export function connectLocalToMixer(stream) {
    initAudioMixer();
    if (stream.getAudioTracks().length > 0 && !localAudioSource) {
        localAudioSource = audioContext.createMediaStreamSource(stream);
        localAudioSource.connect(audioDestination);
    }
}

export function connectRemoteToMixer(stream) {
    initAudioMixer();
    if (stream.getAudioTracks().length > 0 && !remoteAudioSource) {
        remoteAudioSource = audioContext.createMediaStreamSource(stream);
        remoteAudioSource.connect(audioDestination);
    }
}

export function startRecording(onStopCallback) {
    if (!audioDestination) {
        console.error('Audio mixer not initialized');
        return false;
    }

    audioChunks = [];
    const mixedStream = audioDestination.stream;
    mediaRecorder = new MediaRecorder(mixedStream);

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
        if (onStopCallback) {
            onStopCallback(audioChunks);
        }
    };

    mediaRecorder.start();
    isRecording = true;
    isPaused = false;
    return true;
}

export function pauseRecording() {
    if (!isRecording || !mediaRecorder) return false;

    if (isPaused) {
        mediaRecorder.resume();
        isPaused = false;
        return 'resumed';
    } else {
        mediaRecorder.pause();
        isPaused = true;
        return 'paused';
    }
}

export function stopRecording() {
    if (!isRecording || !mediaRecorder) return false;

    mediaRecorder.stop();
    isRecording = false;
    isPaused = false;
    return true;
}

export function getRecordingState() {
    return { isRecording, isPaused };
}

export async function uploadRecording(recordingName, audioChunks) {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('name', recordingName);

    const res = await fetch('/api/recordings/upload', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': window.csrfToken || ''
        },
        body: formData
    });

    return res.ok;
}

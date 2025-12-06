// Live Transcription Module
// Handles Web Speech API for live speech-to-text

let recognition;

export function startLiveTranscription(roomId, userRole, appendTranscriptCallback, socket) {
    if (!('webkitSpeechRecognition' in window)) {
        console.warn('Web Speech API not supported in this browser.');
        return;
    }

    // Prevent multiple instances
    if (window.recognitionRunning) {
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Filipino (Taglish - handles mixed Tagalog/English)
    recognition.lang = 'fil-PH';

    recognition.onstart = () => {
        window.recognitionRunning = true;
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
            socket.emit('subtitle', finalTranscript);
            appendTranscriptCallback(userRole, finalTranscript);
        }
    };

    recognition.onerror = (event) => {
        // Suppress 'aborted' error spam - it's normal during WebRTC calls
        if (event.error === 'aborted') {
            return;
        }
        if (event.error === 'not-allowed') {
            console.error('Microphone permission denied for Speech API');
            window.recognitionRunning = false;
            return;
        }
        console.error('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
        window.recognitionRunning = false;

        // Only restart if still in a room, with delay
        if (roomId) {
            setTimeout(() => {
                if (roomId && !window.recognitionRunning) {
                    try {
                        recognition.start();
                    } catch (e) {
                        // Silently handle
                    }
                }
            }, 1000);
        }
    };

    try {
        recognition.start();
    } catch (e) {
        console.error('Failed to start speech recognition:', e);
        window.recognitionRunning = false;
    }
}

export function stopLiveTranscription() {
    if (recognition) {
        window.recognitionRunning = false;
        recognition.stop();
    }
}

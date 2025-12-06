// WebRTC Module
// Handles peer-to-peer connection, offer/answer, and ICE candidates

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

let peerConnection = null;

export function createPeerConnection(localStream, onTrackCallback, socket) {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('Track received:', event.track.kind);
        if (onTrackCallback) {
            onTrackCallback(event);
        }
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    return peerConnection;
}

export async function createOffer(socket) {
    if (!peerConnection) {
        console.error('Peer connection not initialized');
        return;
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
}

export async function handleOffer(offer, socket) {
    if (!peerConnection) {
        console.error('Peer connection not initialized for offer');
        return;
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
}

export async function handleAnswer(answer) {
    if (!peerConnection) {
        console.error('Peer connection not initialized for answer');
        return;
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

export async function handleIceCandidate(candidate) {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

export function closePeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}

export function getPeerConnection() {
    return peerConnection;
}

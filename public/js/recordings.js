let currentView = 'active';

async function loadRecordings() {
    const container = document.getElementById('recordings-container');
    const search = document.getElementById('search-recordings').value.toLowerCase();
    const isArchived = currentView === 'archived';

    // Advanced Filters
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const sort = document.getElementById('filter-sort').value;
    const hasTranscript = document.getElementById('filter-transcript').value;

    container.innerHTML = '<div style="text-align:center; padding: 20px;">Loading...</div>';

    try {
        let url = `/api/recordings?archived=${isArchived}&sort=${sort}`;
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;
        if (hasTranscript !== 'all') url += `&hasTranscript=${hasTranscript}`;

        const response = await fetch(url);
        const recordings = await response.json();

        container.innerHTML = '';

        if (recordings.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">${isArchived ? '📦' : '📹'}</span>
                    <h3>No recordings found matching criteria</h3>
                </div>`;
            return;
        }

        // Group by date (Client-side grouping still useful for display)
        const groups = {};
        recordings.forEach(rec => {
            if (rec.name.toLowerCase().includes(search)) {
                const date = new Date(rec.created_at).toLocaleDateString(undefined, {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
                if (!groups[date]) groups[date] = [];
                groups[date].push(rec);
            }
        });

        for (const [date, recs] of Object.entries(groups)) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'date-group';
            groupDiv.innerHTML = `<div class="date-header">${date}</div>`;

            recs.forEach(rec => {
                groupDiv.appendChild(createRecordingCard(rec));
            });

            container.appendChild(groupDiv);
        }

        if (container.children.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">🔍</span>
                    <h3>No matches found</h3>
                </div>`;
        }

    } catch (error) {
        console.error('Error loading recordings:', error);
        container.innerHTML = '<div style="text-align:center; color: var(--danger-color);">Failed to load recordings</div>';
    }
}

function createRecordingCard(rec) {
    const card = document.createElement('div');
    card.className = 'recording-card compact';

    const date = new Date(rec.created_at);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Check if "New" (within last 24h)
    const isNew = (new Date() - date) < (24 * 60 * 60 * 1000);

    let transcriptBtn = '';
    let classifyBtn = '';

    if (rec.path_transcript) {
        transcriptBtn = `
            <button onclick="viewTranscript('${rec.path_transcript}', ${rec.id})" class="icon-btn" title="View Transcript">
                <span class="icon">📄</span>
                <span class="text">View</span>
            </button>`;

        // Add classify button if transcript exists
        if (rec.classification_data) {
            classifyBtn = `
                <button onclick="viewClassification(${rec.id})" class="icon-btn primary" title="View Topics">
                    <span class="icon">📊</span>
                    <span class="text">Topics</span>
                </button>`;
        } else {
            classifyBtn = `
                <button id="classify-btn-${rec.id}" onclick="classifyTranscript(${rec.id})" class="icon-btn primary" title="Classify Topics">
                    <span class="icon">🤖</span>
                    <span class="text">Classify</span>
                </button>`;
        }
    } else {
        transcriptBtn = `
            <button id="transcribe-btn-${rec.id}" onclick="transcribeAudio(${rec.id})" class="icon-btn primary" title="Transcribe">
                <span class="icon">✨</span>
                <span class="text">Transcribe</span>
            </button>`;
    }

    // Archive/Restore Button
    let archiveActionBtn = '';
    if (currentView === 'active') {
        archiveActionBtn = `
            <button onclick="archiveRecording(${rec.id})" class="icon-btn danger" title="Archive">
                <span class="icon">📦</span>
                <span class="text">Archive</span>
            </button>`;
    } else {
        archiveActionBtn = `
            <button onclick="restoreRecording(${rec.id})" class="icon-btn primary" title="Restore">
                <span class="icon">↩️</span>
                <span class="text">Restore</span>
            </button>`;
    }

    const cardInnerHTML = `
        <div class="card-main">
            <div class="card-header-row">
                <h3 class="rec-title">${rec.name}</h3>
                ${isNew ? '<span class="badge new">NEW</span>' : ''}
                <span class="rec-duration">0:00</span>
            </div>
            <div class="rec-meta">
                <span>${timeStr}</span>
            </div>
            <audio id="audio-${rec.id}" class="custom-audio-player" controls src="${rec.path_mp3}" onloadedmetadata="updateDuration(this)"></audio>
        </div>
        <div class="card-actions">
            <a href="${rec.path_mp3}" download="${rec.filename}.mp3" class="icon-btn" title="Download MP3">
                <span class="icon">⬇️</span>
                <span class="text">MP3</span>
            </a>
            <a href="${rec.path_wav}" download="${rec.filename}.wav" class="icon-btn" title="Download WAV">
                <span class="icon">⬇️</span>
                <span class="text">WAV</span>
            </a>
            ${transcriptBtn}
            ${classifyBtn}
            ${archiveActionBtn}
        </div>
    `;
    card.innerHTML = cardInnerHTML;
    return card;
}

function updateDuration(audio) {
    const duration = formatTime(audio.duration);
    const durationEl = audio.parentElement.querySelector('.rec-duration');
    if (durationEl) durationEl.textContent = duration;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

async function archiveRecording(id) {
    if (!confirm('Are you sure you want to archive this recording? It will be auto-deleted after 30 days.')) return;
    try {
        const res = await fetch(`/api/recordings/${id}/archive`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            }
        });
        if (res.ok) loadRecordings();
        else alert('Failed to archive');
    } catch (e) { console.error(e); }
}

async function restoreRecording(id) {
    try {
        const res = await fetch(`/api/recordings/${id}/restore`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            }
        });
        if (res.ok) loadRecordings();
        else alert('Failed to restore');
    } catch (e) { console.error(e); }
}

async function reTranscribe(id) {
    if (!confirm('Re-transcribe this recording? This will overwrite the existing transcript.')) return;
    transcribeAudio(id);
}

async function transcribeAudio(id) {
    // Try to find either the transcribe button or the view button (for re-transcribe)
    let btn = document.getElementById(`transcribe-btn-${id}`);
    if (!btn) {
        // If re-transcribing, the button might be the view button
        // We need to find the view button in the card actions
        const audio = document.getElementById(`audio-${id}`);
        if (audio) {
            const card = audio.closest('.card-main').nextElementSibling; // card-actions
            btn = card.querySelector('button[title="View Transcript"]');
        }
    }

    let originalContent = '';
    if (btn) {
        originalContent = btn.innerHTML;
        btn.innerHTML = '<span class="icon">⏳</span><span class="text">...</span>';
        btn.disabled = true;
    }

    try {
        const response = await fetch(`/api/recordings/${id}/transcribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            }
        });
        const data = await response.json();

        if (response.ok) {
            loadRecordings();
        } else {
            alert('Transcription failed: ' + data.error);
            if (btn) {
                btn.innerHTML = originalContent || '<span class="icon">✨</span><span class="text">Transcribe</span>';
                btn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during transcription.');
        if (btn) {
            btn.innerHTML = originalContent || '<span class="icon">✨</span><span class="text">Transcribe</span>';
            btn.disabled = false;
        }
    }
}

async function viewTranscript(path, id) {
    const modal = document.getElementById('transcript-modal');
    const content = document.getElementById('modal-transcript-content');

    modal.style.display = 'flex';
    content.textContent = 'Loading...';

    // Add Re-transcribe button to modal
    const existingBtn = document.getElementById('modal-retranscribe-btn');
    if (existingBtn) existingBtn.remove();

    const reBtn = document.createElement('button');
    reBtn.id = 'modal-retranscribe-btn';
    reBtn.className = 'icon-btn primary';
    reBtn.style.marginTop = '15px';
    reBtn.innerHTML = '<span class="icon">🔄</span><span class="text">Redo Transcript</span>';
    reBtn.onclick = () => {
        closeModal();
        reTranscribe(id);
    };
    content.parentNode.appendChild(reBtn);

    try {
        const response = await fetch(path);
        const text = await response.text();
        content.textContent = text;
    } catch (error) {
        content.textContent = 'Failed to load transcript.';
    }
}

function closeModal() {
    document.getElementById('transcript-modal').style.display = 'none';
}

// Event Listeners
document.getElementById('search-recordings').addEventListener('input', loadRecordings);

document.getElementById('filter-view').addEventListener('change', (e) => {
    currentView = e.target.value;
    loadRecordings();
});

document.getElementById('toggle-filters-btn').addEventListener('click', () => {
    const panel = document.getElementById('advanced-filters');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
});

// Filter Change Listeners
['filter-start-date', 'filter-end-date', 'filter-sort', 'filter-transcript'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadRecordings);
});

function clearFilters() {
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    document.getElementById('filter-sort').value = 'created_desc';
    document.getElementById('filter-transcript').value = 'all';
    loadRecordings();
}

window.onclick = (event) => {
    const modal = document.getElementById('transcript-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

// Initial Load
// Force reset filter to active to ensure sync with currentView
document.getElementById('filter-view').value = 'active';
loadRecordings();

// Additional event listeners for buttons that were converted from inline handlers
const backToDashboardBtn = document.getElementById('back-to-dashboard');
if (backToDashboardBtn) {
    backToDashboardBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/me', {
                credentials: 'include'  // Ensure cookies are included in the request
            });
            const data = await res.json();

            if (data.loggedIn && data.role === 'admin') {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/'; // Student dashboard
            }
        } catch (error) {
            console.error('Error checking user role:', error);
            window.location.href = '/'; // Default to student dashboard
        }
    });
}

document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

// Add event listener for the modal close button once the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
});

// Classification Functions
async function classifyTranscript(id) {
    const btn = document.getElementById(`classify-btn-${id}`);
    let originalContent = '';

    if (btn) {
        originalContent = btn.innerHTML;
        btn.innerHTML = '<span class="icon">⏳</span><span class="text">Classifying...</span>';
        btn.disabled = true;
    }

    try {
        const response = await fetch(`/api/recordings/${id}/classify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            }
        });
        const data = await response.json();

        if (response.ok) {
            // Reload to show the new "Topics" button
            loadRecordings();
            // Optionally show the classification immediately
            setTimeout(() => viewClassification(id), 500);
        } else {
            alert('Classification failed: ' + data.error);
            if (btn) {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during classification.');
        if (btn) {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    }
}

async function viewClassification(id) {
    try {
        // Fetch all recordings and find the one with matching ID
        const response = await fetch('/api/recordings');
        const recordings = await response.json();
        const rec = recordings.find(r => r.id === id);

        if (!rec || !rec.classification_data) {
            alert('No classification data available');
            return;
        }

        const classification = JSON.parse(rec.classification_data);

        // Create and show classification modal
        showClassificationModal(rec.name, classification);
    } catch (error) {
        console.error('Error loading classification:', error);
        alert('Failed to load classification data');
    }
}

function showClassificationModal(recordingName, classification) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('classification-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'classification-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }

    // Category colors
    const categoryColors = {
        'Academic': '#3B82F6',
        'Career': '#10B981',
        'Faculty': '#8B5CF6',
        'Infrastructure': '#F59E0B',
        'Mental Health': '#EF4444',
        'Practicum/OJT': '#06B6D4',
        'Social': '#EC4899',
        'Technology': '#6366F1'
    };

    // Build topic breakdown HTML
    let topicBreakdownHTML = '';
    const sortedCategories = Object.entries(classification.category_percentages)
        .sort((a, b) => b[1] - a[1]);

    sortedCategories.forEach(([category, percentage]) => {
        const color = categoryColors[category] || '#94A3B8';
        const count = classification.categories[category] || 0;
        topicBreakdownHTML += `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: ${color};">${category}</span>
                    <span style="color: #CBD5E1;">${count} segments (${percentage}%)</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); border-radius: 8px; height: 8px; overflow: hidden;">
                    <div style="background: ${color}; height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
                </div>
            </div>
        `;
    });

    // Build segments HTML
    let segmentsHTML = '';
    classification.segments.forEach((segment, idx) => {
        const color = categoryColors[segment.category] || '#94A3B8';
        const confidencePercent = (segment.confidence * 100).toFixed(1);
        segmentsHTML += `
            <div style="background: rgba(30, 41, 59, 0.5); padding: 16px; border-radius: 12px; border-left: 4px solid ${color}; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: ${color}; font-size: 0.9rem;">${segment.category}</span>
                    <span style="color: #94A3B8; font-size: 0.85rem;">Confidence: ${confidencePercent}%</span>
                </div>
                <p style="color: #E2E8F0; line-height: 1.6; margin: 0;">${segment.text}</p>
            </div>
        `;
    });

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
            <span class="close-btn" onclick="document.getElementById('classification-modal').style.display='none'">&times;</span>
            <h2 style="margin-bottom: 8px;">Topic Classification</h2>
            <p style="color: #94A3B8; margin-bottom: 24px;">${recordingName}</p>

            <div style="background: rgba(30, 41, 59, 0.6); padding: 24px; border-radius: 16px; margin-bottom: 24px;">
                <h3 style="margin-top: 0; margin-bottom: 16px; color: #F1F5F9;">Topic Breakdown</h3>
                <div style="margin-bottom: 16px;">
                    <span style="color: #94A3B8; font-size: 0.9rem;">Total Segments: ${classification.total_segments}</span>
                </div>
                ${topicBreakdownHTML}
            </div>

            <h3 style="margin-bottom: 16px; color: #F1F5F9;">Segment Analysis</h3>
            <div style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
                ${segmentsHTML}
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    // Close on outside click
    modal.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

// Initialize CSRF token if needed
fetch('/api/csrf-token', {
    credentials: 'include'  // Ensure cookies are included in the request
})
    .then(response => response.json())
    .then(data => {
        // Store the token for future use
        window.csrfToken = data.csrfToken;
    })
    .catch(error => console.error('Error fetching CSRF token:', error));

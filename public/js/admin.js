// Check authentication and role on page load
async function checkAuth() {
    try {
        const res = await fetch('/api/me', {
            credentials: 'include'  // Ensure cookies are included in the request
        });
        const data = await res.json();

        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return;
        }

        if (data.role !== 'admin') {
            window.location.href = '/';
            return;
        }

        // Populate user info (there's no username element in this page, so we'll skip this)
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

// Generate meeting code functionality
document.getElementById('generate-code-btn').addEventListener('click', async () => {
    try {
        // Create meeting
        const res = await fetch('/api/meeting/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            }
        });

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const { code } = await res.json();

        // Show confirmation modal
        showConfirmationModal(code);
        // Add log entry
        addLogEntry('System', `Meeting code generated: ${code}`);
    } catch (error) {
        console.error('Error creating meeting:', error);
        alert('Failed to generate meeting code');
        addLogEntry('Error', 'Failed to generate meeting code');
    }
});

// Show confirmation modal with generated code
function showConfirmationModal(code) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-code').textContent = code;
    modal.style.display = 'flex';

    document.getElementById('confirm-yes').onclick = () => {
        addLogEntry('System', `Redirecting to meeting ${code}`);
        window.location.href = `/meeting.html?room=${code}`;
    };

    document.getElementById('confirm-no').onclick = () => {
        modal.style.display = 'none';
        addLogEntry('System', 'Meeting creation cancelled');
    };
}

// Logout and navigation are now handled by navigation.js

// Function to add log entry to the UI
function addLogEntry(type, message) {
    const logContent = document.getElementById('activity-log');
    const now = new Date();
    const timestamp = now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <span class="log-time">[${timestamp}]</span>
        <span class="log-type">[${type}]</span>
        <span class="log-message">${message}</span>
    `;

    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
}

// Function to load activity logs from the backend
async function loadActivityLogs() {
    try {
        const response = await fetch('/api/activity-log', {
            credentials: 'include'  // Ensure cookies are included in the request
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const activities = await response.json();

        const logContent = document.getElementById('activity-log');
        logContent.innerHTML = ''; // Clear existing entries

        if (activities.length === 0) {
            logContent.innerHTML = '<div class="log-entry"><span class="log-message">No activities yet.</span></div>';
            return;
        }

        activities.forEach(activity => {
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.innerHTML = `
                <span class="log-time">[${new Date(activity.timestamp + 'Z').toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}]</span>
                <span class="log-type">[${activity.user_name}]</span>
                <span class="log-message">${activity.description}</span>
            `;
            logContent.appendChild(entry);
        });

        logContent.scrollTop = logContent.scrollHeight;
    } catch (error) {
        console.error('Error loading activity logs:', error);
        addLogEntry('Error', 'Failed to load activity logs');
    }
}

// Refresh activity logs every 30 seconds
setInterval(loadActivityLogs, 30000);

// Initialize the page
checkAuth();

// Load activity logs when page loads
window.addEventListener('load', loadActivityLogs);

// Initialize CSRF token if needed
fetch('/api/csrf-token')
    .then(response => response.json())
    .then(data => {
        // Store the token for future use
        window.csrfToken = data.csrfToken;
    })
    .catch(error => console.error('Error fetching CSRF token:', error));

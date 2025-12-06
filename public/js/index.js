// Socket.io for invitations (students only)
const socket = io('/');

// Calendar state variables
let currentMonthStudent = new Date().getMonth();
let currentYearStudent = new Date().getFullYear();
let studentInterviews = [];

socket.on('connect', async () => {
    try {
        const res = await fetch('/api/me', {
            credentials: 'include'  // Ensure cookies are included in the request
        });
        const data = await res.json();

        if (data.loggedIn && data.role === 'student') {
            socket.emit('register-user', data.id.toString());
            console.log('Student registered for invitations');
        }
    } catch (error) {
        console.error('Failed to register for invitations:', error);
    }
});

// Listen for meeting invitations
socket.on('meeting-invitation', ({ adminName, roomCode, timestamp }) => {
    const invitationsCard = document.getElementById('invitations-card');
    const invitationsList = document.getElementById('invitations-list');

    invitationsCard.style.display = 'block';

    const invitation = document.createElement('div');
    invitation.style.cssText = 'background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 12px; padding: 16px;';
    invitation.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong style="color: #06B6D4;">${adminName}</strong> invited you to a meeting
        </div>
        <div style="font-family: monospace; font-size: 1.1rem; color: #818CF8; margin-bottom: 12px;">
            Code: <strong>${roomCode}</strong>
        </div>
        <button onclick="joinMeeting('${roomCode}')" class="cta-btn" style="width: 100%;">Join Meeting</button>
    `;

    invitationsList.prepend(invitation);

    // Show notification
    alert(`${adminName} invited you to meeting ${roomCode}`);
});

function joinMeeting(code) {
    window.location.href = `/meeting.html?room=${code}`;
}

async function checkAuth() {
    try {
        const res = await fetch('/api/me', {
            credentials: 'include'  // Ensure cookies are included in the request
        });
        const data = await res.json();

        if (!data.loggedIn) {
            showGuestUI();
            return;
        }

        if (data.role !== 'student') {
            window.location.href = '/admin.html';
            return;
        }

        showStudentUI(data);
        loadStudentInterviews(); // Load student interviews after UI is shown
    } catch (error) {
        console.error('Auth check failed:', error);
        showGuestUI();
    }
}

function showGuestUI() {
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.innerHTML = '<span class="sidebar-nav-icon">🔑</span> Log In';
    logoutBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = '/login.html';
    };

    document.getElementById('username').textContent = 'Guest';
    document.getElementById('profile-username').textContent = 'Guest';

    document.getElementById('join-call-btn').onclick = () => {
        alert('Please log in to join a call');
    };

    document.getElementById('schedule-btn').onclick = (e) => {
        e.preventDefault();
        alert('Please log in to access the schedule');
    };

    document.getElementById('profile-btn').onclick = (e) => {
        e.preventDefault();
        alert('Please log in to view your profile');
    };
}

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

function showStudentUI(data) {
    document.getElementById('username').textContent = data.username || data.name;
    document.getElementById('profile-username').textContent = data.username || data.name;

    document.getElementById('logout-btn').onclick = async (e) => {
        e.preventDefault();
        try {
            await fetch('/api/logout', {
                method: 'POST',
                credentials: 'include'  // Ensure cookies are included in the request
            });
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    document.getElementById('join-call-btn').onclick = () => {
        const code = document.getElementById('join-code-input').value.trim();
        if (code) {
            window.location.href = `/meeting.html?room=${code}`;
        } else {
            alert('Please enter a room code');
        }
    };

    // Schedule button is removed for students as per requirements, but we'll keep the event listener
    // in case we need to show an appropriate message
    const scheduleBtn = document.getElementById('schedule-btn');
    if (scheduleBtn) {
        scheduleBtn.onclick = (e) => {
            e.preventDefault();
            // This button should not appear in the student navigation as we removed it from HTML
            // but if it does somehow appear, we'll redirect to prevent confusion
            window.location.href = '/';
        };
    }

    document.getElementById('profile-btn').onclick = (e) => {
        e.preventDefault();
        alert('Profile page coming soon! This feature will allow you to view and edit your profile information.');
    };

    // Initialize calendar functionality for student dashboard
    initializeStudentCalendar();
}

// Student calendar functionality
function initializeStudentCalendar() {
    const prevMonthBtn = document.getElementById('prev-month-student');
    const nextMonthBtn = document.getElementById('next-month-student');
    const currentMonthYear = document.getElementById('current-month-year-student');

    if (prevMonthBtn && nextMonthBtn && currentMonthYear) {
        prevMonthBtn.addEventListener('click', () => {
            currentMonthStudent--;
            if (currentMonthStudent < 0) {
                currentMonthStudent = 11;
                currentYearStudent--;
            }
            renderStudentCalendar();
        });

        nextMonthBtn.addEventListener('click', () => {
            currentMonthStudent++;
            if (currentMonthStudent > 1) {
                currentMonthStudent = 0;
                currentYearStudent++;
            }
            renderStudentCalendar();
        });

        // Render the initial calendar
        renderStudentCalendar();
    }
}

function loadStudentInterviews() {
    fetch('/api/schedule/student', {
        credentials: 'include'  // Ensure cookies are included in the request
    })
        .then(response => response.json())
        .then(data => {
            studentInterviews = data;
            renderStudentCalendar(); // Re-render calendar with updated data
        })
        .catch(error => {
            console.error('Error loading student interviews:', error);
        });
}

function renderStudentCalendar() {
    const calendarGrid = document.getElementById('calendar-grid-student');
    const currentMonthYear = document.getElementById('current-month-year-student');
    const scheduleEmpty = document.getElementById('schedule-empty-student');

    if (!calendarGrid || !currentMonthYear || !scheduleEmpty) return;

    // Update month/year display
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    currentMonthYear.textContent = `${monthNames[currentMonthStudent]} ${currentYearStudent}`;

    // Clear the calendar grid
    calendarGrid.innerHTML = '';

    // Get first day of month and last day of month
    const firstDay = new Date(currentYearStudent, currentMonthStudent, 1);
    const lastDay = new Date(currentYearStudent, currentMonthStudent + 1, 0);
    const startDate = new Date(firstDay);

    // Adjust to Sunday of the week that contains the first day
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // Get the last day of the calendar (Saturday of the week that contains the last day)
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    // Create calendar days
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const day = new Date(currentDate);
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day.getDate();

        // Check if this day is today
        const today = new Date();
        if (day.getDate() === today.getDate() &&
            day.getMonth() === today.getMonth() &&
            day.getFullYear() === today.getFullYear()) {
            dayElement.classList.add('today');
        }

        // Check if this day is in the current month
        if (day.getMonth() === currentMonthStudent) {
            dayElement.classList.add('current-month');
        } else {
            dayElement.classList.add('other-month');
        }

        // Check if this day has interviews for the student
        const dayHasInterviews = studentInterviews.some(interview => {
            const interviewDate = new Date(interview.interview_date + 'Z');
            return interviewDate.getDate() === day.getDate() &&
                interviewDate.getMonth() === day.getMonth() &&
                interviewDate.getFullYear() === day.getFullYear();
        });

        if (dayHasInterviews) {
            dayElement.classList.add('has-interviews');
            dayElement.title = 'Click to view interviews';
        }

        // Add click event to view interviews for the day
        if (dayHasInterviews) {
            dayElement.addEventListener('click', () => {
                showStudentDayInterviews(day);
            });
        }

        calendarGrid.appendChild(dayElement);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Show or hide the "No upcoming interviews" message
    scheduleEmpty.style.display = studentInterviews.length > 0 ? 'none' : 'block';
}

function showStudentDayInterviews(date) {
    // Filter interviews for the selected date
    const dayInterviews = studentInterviews.filter(interview => {
        const interviewDate = new Date(interview.interview_date);
        return interviewDate.getDate() === date.getDate() &&
            interviewDate.getMonth() === date.getMonth() &&
            interviewDate.getFullYear() === date.getFullYear();
    });

    // Create modal HTML
    let modalHTML = `
        <div class="day-interview-modal" id="day-interview-modal-student" style="display: block;">
            <div class="day-interview-modal-content">
                <div class="day-interview-modal-header">
                    <h3>Interviews - ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h3>
                    <span class="day-interview-modal-close" id="close-day-interview-modal-student">&times;</span>
                </div>
                <div class="day-interview-modal-body" id="day-interviews-body-student">
    `;

    if (dayInterviews.length === 0) {
        modalHTML += '<div class="no-interviews">No interviews scheduled for this day</div>';
    } else {
        dayInterviews.forEach(interview => {
            const interviewTime = new Date(interview.interview_date + 'Z').toLocaleTimeString('en-PH', {
                timeZone: 'Asia/Manila',
                hour: '2-digit',
                minute: '2-digit'
            });

            modalHTML += `
                <div class="day-interview-item">
                    <div class="interview-time">${interviewTime}</div>
                    <div class="interview-details">
                        <div class="instructor">${interview.instructor_name}</div>
                        <div class="interview-type">${interview.interview_type} Interview</div>
                    </div>
                </div>
            `;
        });
    }

    modalHTML += `
                </div>
            </div>
        </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add event listener to close button
    document.getElementById('close-day-interview-modal-student').addEventListener('click', () => {
        const modal = document.getElementById('day-interview-modal-student');
        if (modal) modal.remove();
    });

    // Close modal when clicking outside
    document.getElementById('day-interview-modal-student').addEventListener('click', (e) => {
        if (e.target === document.getElementById('day-interview-modal-student')) {
            document.getElementById('day-interview-modal-student').remove();
        }
    });
}

// Refresh activity logs every 30 seconds
setInterval(loadActivityLogs, 30000);

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

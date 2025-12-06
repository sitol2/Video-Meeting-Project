// Schedule.js - Interview scheduling functionality

// Global variable for interviews (needed by editInterview which is outside DOMContentLoaded)
let allInterviews = [];

document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const interviewList = document.getElementById('interview-list');
    const calendarGrid = document.getElementById('calendar-grid');
    const currentMonthYear = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const addInterviewModal = document.getElementById('add-interview-modal');
    const closeModal = document.getElementById('close-modal');
    const viewDayModal = document.getElementById('view-day-modal');
    const closeDayModal = document.getElementById('close-day-modal');
    const interviewForm = document.getElementById('interview-form');
    const studentSearch = document.getElementById('student-search');
    const studentSearchResults = document.getElementById('student-search-results');
    const dayInterviewsList = document.getElementById('day-interviews-list');
    const viewDayTitle = document.getElementById('view-day-title');
    const addInterviewDayBtn = document.getElementById('add-interview-day-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // State variables
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    // Note: allInterviews is global (line 4) so editInterview can access it
    let selectedDate = null;

    // Initialize the schedule page
    initSchedule();

    function initSchedule() {
        loadUserData();
        loadInterviews();
        renderCalendar();
        setupEventListeners();
    }

    function loadUserData() {
        fetch('/api/me', {
            credentials: 'include'  // Ensure cookies are included in the request
        })
            .then(response => response.json())
            .then(data => {
                if (data.loggedIn) {
                    // Check if user is admin, if not redirect to appropriate dashboard
                    if (data.role !== 'admin') {
                        window.location.href = '/'; // Redirect to student dashboard
                        return;
                    }
                    document.getElementById('user-name').textContent = data.name;
                } else {
                    window.location.href = '/login.html';
                }
            })
            .catch(error => {
                console.error('Error loading user data:', error);
                window.location.href = '/login.html';
            });
    }

    function loadInterviews() {
        fetch('/api/schedule/admin', {
            credentials: 'include'  // Ensure cookies are included in the request
        })
            .then(response => response.json())
            .then(data => {
                allInterviews = data;
                renderUpcomingInterviews();
                renderCalendar(); // Re-render calendar with updated data
            })
            .catch(error => {
                console.error('Error loading interviews:', error);
            });
    }

    function renderUpcomingInterviews() {
        if (allInterviews.length === 0) {
            interviewList.innerHTML = '<div class="no-interviews" id="no-interviews">No incoming interviews</div>';
            return;
        }

        // Sort interviews by date
        const sortedInterviews = allInterviews.sort((a, b) => new Date(a.interview_date) - new Date(b.interview_date));

        let html = '';
        sortedInterviews.forEach(interview => {
            const date = new Date(interview.interview_date + 'Z');
            const formattedDate = date.toLocaleString('en-PH', {
                timeZone: 'Asia/Manila',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            html += `
                <div class="interview-item" data-id="${interview.id}">
                    <div class="interview-info">
                        <div class="instructor">Interviewing <strong>${interview.student_name}</strong></div>
                        <div class="student">${interview.instructor_name}</div>
                        <div class="date">${formattedDate}</div>
                    </div>
                    <div class="interview-type">${interview.interview_type} Interview</div>
                    <div class="interview-actions">
                        <button class="edit-btn" onclick="editInterview(${interview.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="delete-btn" onclick="deleteInterview(${interview.id}, '${interview.student_name}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
        });

        interviewList.innerHTML = html;
    }

    function renderCalendar() {
        // Update month/year display
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        currentMonthYear.textContent = `${monthNames[currentMonth]} ${currentYear}`;

        // Clear the calendar grid
        calendarGrid.innerHTML = '';

        // Get first day of month and last day of month
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
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
            if (day.getMonth() === currentMonth) {
                dayElement.classList.add('current-month');
            } else {
                dayElement.classList.add('other-month');
            }

            // Check if this day has interviews
            const dayHasInterviews = allInterviews.some(interview => {
                const interviewDate = new Date(interview.interview_date);
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
                    showDayInterviews(day);
                });
            } else {
                // If no interviews, show the add interview modal
                dayElement.addEventListener('click', () => {
                    selectedDate = day;
                    openAddInterviewModal(day);
                });
            }

            calendarGrid.appendChild(dayElement);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    function showDayInterviews(date) {
        // Filter interviews for the selected date
        const dayInterviews = allInterviews.filter(interview => {
            const interviewDate = new Date(interview.interview_date);
            return interviewDate.getDate() === date.getDate() &&
                interviewDate.getMonth() === date.getMonth() &&
                interviewDate.getFullYear() === date.getFullYear();
        });

        // Format the date for the modal title
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        viewDayTitle.textContent = `Interviews - ${formattedDate}`;

        // Render interviews for the day
        if (dayInterviews.length === 0) {
            dayInterviewsList.innerHTML = '<div class="no-interviews">No interviews scheduled for this day</div>';
        } else {
            let html = '<div class="day-interviews">';
            dayInterviews.forEach(interview => {
                const interviewTime = new Date(interview.interview_date + 'Z').toLocaleTimeString('en-PH', {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                html += `
                    <div class="day-interview-item">
                        <div class="interview-time">${interviewTime}</div>
                        <div class="interview-details">
                            <div class="instructor">${interview.instructor_name}</div>
                            <div class="student">${interview.student_name}</div>
                            <div class="interview-type">${interview.interview_type}</div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            dayInterviewsList.innerHTML = html;
        }

        viewDayModal.style.display = 'block';
        selectedDate = date;
    }

    function openAddInterviewModal(date = null) {
        // If a date is provided, set the datetime input to that date
        if (date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(9).padStart(2, '0'); // Default to 9 AM
            const minutes = String(0).padStart(2, '0');
            const datetimeString = `${year}-${month}-${day}T${hours}:${minutes}`;
            document.getElementById('interview-date').value = datetimeString;
        }

        addInterviewModal.style.display = 'block';
    }

    function setupEventListeners() {
        // Calendar navigation
        prevMonthBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });

        nextMonthBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });

        // Modal close buttons
        closeModal.addEventListener('click', () => {
            addInterviewModal.style.display = 'none';
            clearForm();
        });

        closeDayModal.addEventListener('click', () => {
            viewDayModal.style.display = 'none';
        });

        // Cancel button
        cancelBtn.addEventListener('click', () => {
            addInterviewModal.style.display = 'none';
            clearForm();
        });

        // Close modals when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === addInterviewModal) {
                addInterviewModal.style.display = 'none';
                clearForm();
            }
            if (event.target === viewDayModal) {
                viewDayModal.style.display = 'none';
            }
        });

        // Form submission
        interviewForm.addEventListener('submit', handleFormSubmit);

        // Student search with debouncing
        let searchTimeout;
        studentSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            if (query.length >= 2) {
                searchTimeout = setTimeout(() => {
                    searchStudents(query);
                }, 300);
            } else {
                studentSearchResults.style.display = 'none';
            }
        });

        // Add interview from day view
        addInterviewDayBtn.addEventListener('click', () => {
            viewDayModal.style.display = 'none';
            openAddInterviewModal(selectedDate);
        });

        // Logout is now handled by navigation.js
    }

    function handleFormSubmit(e) {
        e.preventDefault();

        const instructorTitle = document.getElementById('instructor-title').value;
        const instructorName = document.getElementById('instructor-name').value;
        const studentIdentifier = studentSearch.value.trim();
        const interviewDateInput = document.getElementById('interview-date').value;
        const interviewType = document.getElementById('interview-type').value;

        if (!instructorName || !studentIdentifier || !interviewDateInput) {
            alert('Please fill in all required fields');
            return;
        }

        // Convert local time to UTC before sending to server
        const localDate = new Date(interviewDateInput);
        const interviewDate = localDate.toISOString().slice(0, 19).replace('T', ' ');

        // Combine title and name
        const fullInstructorName = `${instructorTitle} ${instructorName}`;

        // Create the schedule object
        const scheduleData = {
            instructorName: fullInstructorName,
            studentIdentifier: studentIdentifier,
            interviewDate: interviewDate,
            interviewType: interviewType
        };

        // Send the request to the server
        fetch('/api/schedule/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            },
            body: JSON.stringify(scheduleData)
        })
            .then(async response => {
                if (!response.ok) {
                    // Handle non-200 responses
                    if (response.status === 403) {
                        alert('Access denied. Please refresh the page and try again.');
                        window.location.href = '/login.html';
                    } else {
                        // Try to get error details
                        try {
                            const errorData = await response.json();
                            alert(errorData.error || 'Server error occurred.');
                        } catch (e) {
                            // If response is not JSON, show generic error
                            alert('Server error occurred.');
                        }
                    }
                    return;
                }
                return response.json();
            })
            .then(data => {
                if (data && data.error) {
                    alert(data.error);
                } else if (data) {
                    alert('Interview scheduled successfully!');
                    addInterviewModal.style.display = 'none';
                    clearForm();
                    loadInterviews(); // Refresh the data
                }
            })
            .catch(error => {
                console.error('Error scheduling interview:', error);
                alert('Error scheduling interview. Please try again.');
            });
    }

    function searchStudents(query) {
        fetch(`/api/students/search?q=${encodeURIComponent(query)}`, {
            credentials: 'include'  // Ensure cookies are included in the request
        })
            .then(response => response.json())
            .then(students => {
                if (students.length > 0) {
                    let html = '<ul class="student-results-list">';
                    students.forEach(student => {
                        html += `
                            <li class="student-result-item" data-identifier="${student.student_id || student.email}">
                                <div class="student-name">${student.name}</div>
                                <div class="student-id">${student.student_id}</div>
                                <div class="student-email">${student.email}</div>
                            </li>
                        `;
                    });
                    html += '</ul>';
                    studentSearchResults.innerHTML = html;
                    studentSearchResults.style.display = 'block';

                    // Add click event to each result
                    document.querySelectorAll('.student-result-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const identifier = item.getAttribute('data-identifier');
                            studentSearch.value = identifier;
                            studentSearchResults.style.display = 'none';
                        });
                    });
                } else {
                    studentSearchResults.innerHTML = '<div class="no-students">No students found</div>';
                    studentSearchResults.style.display = 'block';
                }
            })
            .catch(error => {
                console.error('Error searching students:', error);
                studentSearchResults.innerHTML = '<div class="error">Error searching students</div>';
                studentSearchResults.style.display = 'block';
            });
    }

    function clearForm() {
        document.getElementById('instructor-title').value = 'Mr.';
        document.getElementById('instructor-name').value = '';
        studentSearch.value = '';
        document.getElementById('interview-date').value = '';
        document.getElementById('interview-type').value = 'Entrance';
        studentSearchResults.style.display = 'none';
    }

    function getCSRFToken() {
        // In a real implementation, you would fetch this from the server
        // For now, we'll return a placeholder - the server handles CSRF protection
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
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
});

// Delete interview function
async function deleteInterview(id, studentName) {
    if (!confirm(`Are you sure you want to delete the interview with ${studentName}?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/schedule/${id}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': window.csrfToken || ''
            },
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok) {
            alert('Interview deleted successfully');
            location.reload();
        } else {
            alert(data.error || 'Failed to delete interview');
        }
    } catch (error) {
        console.error('Error deleting interview:', error);
        alert('Error deleting interview');
    }
}

// Edit interview function
function editInterview(id) {
    const interview = allInterviews.find(i => i.id === id);
    if (!interview) {
        alert('Interview not found');
        return;
    }

    const newInstructorName = prompt('Enter new instructor name:', interview.instructor_name);
    if (!newInstructorName) return;

    const newStudentId = prompt('Enter student ID or email:', interview.student_name);
    if (!newStudentId) return;

    const currentDate = new Date(interview.interview_date + 'Z');
    const localDateTime = new Date(currentDate.getTime() - currentDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const newDateTime = prompt('Enter new date/time (YYYY-MM-DDTHH:MM):', localDateTime);
    if (!newDateTime) return;

    const newType = prompt('Enter interview type (Entrance/Exit/Follow-up):', interview.interview_type);
    if (!newType) return;

    const localDate = new Date(newDateTime);
    const interviewDate = localDate.toISOString().slice(0, 19).replace('T', ' ');

    updateInterview(id, {
        instructorName: newInstructorName,
        studentIdentifier: newStudentId,
        interviewDate: interviewDate,
        interviewType: newType
    });
}

// Update interview API call
async function updateInterview(id, data) {
    try {
        const response = await fetch(`/api/schedule/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': window.csrfToken || ''
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert('Interview updated successfully');
            location.reload();
        } else {
            alert(result.error || 'Failed to update interview');
        }
    } catch (error) {
        console.error('Error updating interview:', error);
        alert('Error updating interview');
    }
}

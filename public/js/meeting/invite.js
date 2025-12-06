// Invitation Module
// Handles student search and meeting invitations

export async function performSearch(query, resultsContainer, statusDiv) {
    if (query.length < 2) {
        statusDiv.textContent = 'Please enter at least 2 characters';
        statusDiv.style.background = 'rgba(239, 68, 68, 0.2)';
        statusDiv.style.color = '#ef4444';
        statusDiv.style.display = 'block';
        return;
    }

    statusDiv.style.display = 'none';
    resultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Searching...</div>';

    try {
        const res = await fetch(`/api/students/search?q=${encodeURIComponent(query)}`);
        const students = await res.json();

        resultsContainer.innerHTML = '';

        if (students.length === 0) {
            resultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); margin-top: 20px;">No students found</div>';
            return;
        }

        students.forEach(student => {
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);';

            const info = document.createElement('div');
            info.innerHTML = `
                <div style="font-weight: 600; color: white;">${student.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">ID: ${student.student_id || 'N/A'}</div>
            `;

            const inviteBtn = document.createElement('button');
            inviteBtn.textContent = 'Invite';
            inviteBtn.className = 'cta-btn';
            inviteBtn.style.padding = '6px 16px';
            inviteBtn.style.fontSize = '0.9rem';
            inviteBtn.onclick = () => sendInvitation(student.student_id || student.email, student.name, statusDiv);

            item.appendChild(info);
            item.appendChild(inviteBtn);
            resultsContainer.appendChild(item);
        });

    } catch (error) {
        console.error('Search failed:', error);
        resultsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; margin-top: 20px;">Search failed. Please try again.</div>';
    }
}

export async function sendInvitation(identifier, studentName, statusDiv) {
    const roomCode = new URLSearchParams(window.location.search).get('room');

    try {
        const res = await fetch('/api/me');
        const adminData = await res.json();

        if (window.socket) {
            window.socket.emit('invite-to-meeting', {
                studentId: identifier,
                roomCode,
                adminName: adminData.name || adminData.username
            });

            statusDiv.textContent = `Invitation sent to ${studentName}!`;
            statusDiv.style.background = 'rgba(16, 185, 129, 0.2)';
            statusDiv.style.color = '#10b981';
            statusDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to invite:', error);
        statusDiv.textContent = 'Failed to send invitation';
        statusDiv.style.display = 'block';
    }
}

// Global Navigation Component
// Dynamically generates sidebar navigation based on user role

(async function initNavigation() {
    const container = document.getElementById('sidebar-container');
    if (!container) return;

    try {
        // Fetch user info
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json();

        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return;
        }

        const { role } = data;
        const currentPage = window.location.pathname;

        // Define menu items based on role
        const menuItems = role === 'admin' ? [
            { icon: '📊', text: 'Dashboard', href: '/admin.html' },
            { icon: '📅', text: 'Schedule', href: '/schedule/admin.html' },
            { icon: '🎬', text: 'Recordings', href: '/recordings.html' },
            { icon: '🚪', text: 'Logout', href: '#', id: 'logout-btn' }
        ] : [
            { icon: '📊', text: 'Dashboard', href: '/index.html' },
            { icon: '👤', text: 'Profile', href: '#', id: 'profile-btn' },
            { icon: '🚪', text: 'Logout', href: '#', id: 'logout-btn' }
        ];

        // Generate navigation HTML
        const navHTML = `
            <div class="sidebar-brand">
                <h1>LSPU Interview System</h1>
            </div>
            <nav>
                <ul class="sidebar-nav">
                    ${menuItems.map(item => {
            // Fix: Use exact path matching instead of includes
            const isActive = currentPage === item.href;
            return `
                            <li class="sidebar-nav-item">
                                <a href="${item.href}" 
                                   class="sidebar-nav-link ${isActive ? 'active' : ''}"
                                   ${item.id ? `id="${item.id}"` : ''}>
                                    <span class="sidebar-nav-icon">${item.icon}</span>
                                    ${item.text}
                                </a>
                            </li>
                        `;
        }).join('')}
                </ul>
            </nav>
        `;

        container.innerHTML = navHTML;

        // Setup logout handler
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await fetch('/api/logout', {
                        method: 'POST',
                        credentials: 'include'
                    });
                    window.location.href = '/login.html';
                } catch (error) {
                    console.error('Logout failed:', error);
                    window.location.href = '/login.html';
                }
            });
        }

        // Setup profile handler for students
        const profileBtn = document.getElementById('profile-btn');
        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                alert('Profile functionality coming soon!');
            });
        }

    } catch (error) {
        console.error('Navigation initialization failed:', error);
        window.location.href = '/login.html';
    }
})();

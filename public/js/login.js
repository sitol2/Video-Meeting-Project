document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');
    const submitBtn = document.getElementById('submit-btn');

    errorMsg.classList.remove('show');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
        // Get CSRF token
        const csrfRes = await fetch('/api/csrf-token', {
            credentials: 'include'  // Ensure cookies are included in the request
        });
        const { csrfToken } = await csrfRes.json();

        // Login
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ identifier, password }),
            credentials: 'include'  // Ensure cookies are included in the request
        });

        const data = await res.json();

        if (res.ok) {
            // Check user role and redirect appropriately
            fetch('/api/me', {
                credentials: 'include'  // Ensure cookies are included in the request
            })
                .then(meRes => meRes.json())
                .then(meData => {
                    if (meData.loggedIn) {
                        // Small delay to ensure session cookie is fully set
                        setTimeout(() => {
                            if (meData.role === 'admin') {
                                window.location.replace('/admin.html');
                            } else {
                                window.location.replace('/');
                            }
                        }, 100);
                    } else {
                        // If for some reason the user is not logged in after login, redirect to login
                        window.location.href = '/login.html';
                    }
                })
                .catch(error => {
                    console.error('Error fetching user data after login:', error);
                    // Redirect to student dashboard as fallback
                    window.location.href = '/';
                });
        } else {
            errorMsg.textContent = data.error || 'Login failed';
            errorMsg.classList.add('show');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign in';
        }
    } catch (error) {
        errorMsg.textContent = 'An error occurred. Please try again.';
        errorMsg.classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
    }
});

// Client-side validation
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    return passwordRegex.test(password);
}

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const studentId = document.getElementById('studentId').value.trim();
    const name = document.getElementById('name').value.trim();
    const course = document.getElementById('course').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');
    const submitBtn = document.getElementById('submit-btn');

    errorMsg.classList.remove('show');
    successMsg.classList.remove('show');

    // Client-side validation
    if (!validateEmail(email)) {
        errorMsg.textContent = 'Email must be a valid @gmail.com address';
        errorMsg.classList.add('show');
        document.getElementById('email').classList.add('error');
        return;
    }

    if (!validatePassword(password)) {
        errorMsg.textContent = 'Password must be at least 8 characters with 1 uppercase letter and 1 special character';
        errorMsg.classList.add('show');
        document.getElementById('password').classList.add('error');
        return;
    }

    // Remove error classes
    document.querySelectorAll('.form-input').forEach(input => input.classList.remove('error'));

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
        // Get CSRF token
        const csrfRes = await fetch('/api/csrf-token', {
            credentials: 'include'  // Ensure cookies are included in the request
        });
        const { csrfToken } = await csrfRes.json();

        // Register
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ studentId, name, course, email, password }),
            credentials: 'include'  // Ensure cookies are included in the request
        });

        const data = await res.json();

        if (res.ok) {
            successMsg.textContent = 'Registration successful! Redirecting to login...';
            successMsg.classList.add('show');

            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } else {
            errorMsg.textContent = data.error || 'Registration failed';
            errorMsg.classList.add('show');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
    } catch (error) {
        errorMsg.textContent = 'An error occurred. Please try again.';
        errorMsg.classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
});

// Remove error class on input
document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => {
        input.classList.remove('error');
    });
});

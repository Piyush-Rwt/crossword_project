document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const messageDiv = document.getElementById('message');

    try {
        const response = await fetch('/api/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (response.ok) {
            window.location.href = '/admin/dashboard';
        } else {
            const data = await response.json();
            messageDiv.textContent = `Admin login failed: ${data.error}`;
            messageDiv.style.display = 'block';
            messageDiv.style.color = 'red';
        }
    } catch (error) {
        console.error('Admin login error:', error);
        messageDiv.textContent = 'An error occurred during admin login.';
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
    }
});
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const messageDiv = document.getElementById('message');

    const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });

    if (response.ok) {
        window.location.href = '/';
    } else {
        const data = await response.json();
        messageDiv.textContent = `Login failed: ${data.error}`;
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
    }
});
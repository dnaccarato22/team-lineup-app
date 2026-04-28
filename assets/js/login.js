document.getElementById("loginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const spinner = document.getElementById("spinner");
    spinner.style.display = "block";

    try {
        const res = await apiRequest("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "username": username,
                "password": password
            })
        });
        if (res.ok) {
            sessionStorage.setItem("loggedIn", "true");
            await window.preloadAppData?.({
                force: true,
                feedbackOptions: { showSlowOverlay: false }
            });
            window.location.href = "lineup.html";
        } else {
            const data = await res.json();
            alert("Login failed: " + data.message);
        }
    } catch (error) {
        console.error("Error fetching login:", error);
        alert("Error occurred while fetching login");
    } finally {
        spinner.style.display = "none";
    }
});

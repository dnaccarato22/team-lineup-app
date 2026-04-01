const API_BASE_URL = "https://team-lineup-api.onrender.com";

document.getElementById("healthCheckBtn").addEventListener("click", async () => {
    const res = await fetch(API_BASE_URL+ "/health");
    const data = await res.json();
    console.log(data);
    alert("API status: " + data.status);
});

document.getElementById("playersBtn").addEventListener("click", async () => {
    const res = await fetch(API_BASE_URL+ "/players");
    const data = await res.json();
    console.log(data);
    alert("Players: " + data);
});

// TODO call the health check endpoint when someone opens the site and every 10 minutes to avoid cold starts
const API_BASE_URL = "https://team-lineup-api.onrender.com";

document.getElementById("healthCheckBtn").addEventListener("click", async () => {
    const res = await fetch(API_BASE_URL+ "/health");
    const data = await res.json();
    console.log(data);
    alert("API status: " + data.status);
});
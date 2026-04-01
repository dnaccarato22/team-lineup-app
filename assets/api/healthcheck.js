const API_BASE_URL = "https://team-lineup-api.onrender.com";

document.getElementById("healthCheckBtn").addEventListener("click", async () => {
    try {
        const res = await fetch(API_BASE_URL+ "/health");
        const data = await res.json();
        console.log(data);
        alert("API status: " + data.status);
    } catch (error) {
        console.error("Error fetching health check:", error);
        alert("Error occurred while fetching API status");
    }
});

document.getElementById("playersBtn").addEventListener("click", async () => {
    try {
        const res = await fetch(API_BASE_URL+ "/players");
        const data = await res.json();
        console.log(data);
        alert("Obtained players list");
    } catch (error) {
        console.error("Error fetching players:", error);
        alert("Error occurred while fetching players");
    }
});


// TODO call the health check endpoint when someone opens the site and every 10 minutes to avoid cold starts
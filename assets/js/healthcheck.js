const HEALTHCHECK_PATH = "/health";
const HEALTHCHECK_INTERVAL_MS = 10 * 60 * 1000;
const HEALTHCHECK_STORAGE_KEY = "apiWarmupLastRunAt";

function getLastWarmupTime() {
    try {
        return Number.parseInt(sessionStorage.getItem(HEALTHCHECK_STORAGE_KEY), 10) || 0;
    } catch (error) {
        return 0;
    }
}

function setLastWarmupTime(timestamp) {
    try {
        sessionStorage.setItem(HEALTHCHECK_STORAGE_KEY, String(timestamp));
    } catch (error) {
        // Ignore storage errors for best-effort warmup calls.
    }
}

async function warmApi(force) {
    const now = Date.now();

    if (!force && now - getLastWarmupTime() < HEALTHCHECK_INTERVAL_MS) {
        return;
    }

    setLastWarmupTime(now);

    try {
        await fetch(API_BASE_URL + HEALTHCHECK_PATH, {
            method: "GET",
            cache: "no-store",
            keepalive: true
        });
    } catch (error) {
        console.debug("API warmup request failed:", error);
    }
}

warmApi(false);
window.setInterval(() => {
    warmApi(true);
}, HEALTHCHECK_INTERVAL_MS);

const API_BASE_URL = "https://team-lineup-api.onrender.com";
const SLOW_REQUEST_DELAY_MS = 5000;
const SLOW_REQUEST_MESSAGE_INTERVAL_MS = 2400;
const DEFAULT_SLOW_REQUEST_MESSAGES = [
    "Starting up server...",
    "Waiting for the API to respond...",
    "Still working on your request..."
];
const APP_SESSION_KEYS = {
    lineupPageState: "lineupPageState"
};

const slowRequestState = {
    activeRequests: new Map(),
    nextRequestId: 0,
    rotationTimerId: null,
    overlayElement: null,
    titleElement: null,
    subtitleElement: null,
    messageElement: null
};

function ensureSlowRequestOverlay() {
    if (slowRequestState.overlayElement || !document.body) {
        return;
    }

    const overlayElement = document.createElement("div");
    overlayElement.className = "slow-request-overlay";
    overlayElement.setAttribute("aria-live", "polite");
    overlayElement.setAttribute("aria-hidden", "true");
    overlayElement.innerHTML =
        '<div class="slow-request-card" role="status">' +
            '<div class="slow-request-spinner" aria-hidden="true"></div>' +
            '<h2 class="slow-request-title">This is taking longer than usual</h2>' +
            '<p class="slow-request-subtitle">The app is still working. If the server went idle, it may just need a moment to start up.</p>' +
            '<p class="slow-request-message">Starting up server...</p>' +
        "</div>";

    document.body.appendChild(overlayElement);

    slowRequestState.overlayElement = overlayElement;
    slowRequestState.titleElement = overlayElement.querySelector(".slow-request-title");
    slowRequestState.subtitleElement = overlayElement.querySelector(".slow-request-subtitle");
    slowRequestState.messageElement = overlayElement.querySelector(".slow-request-message");
}

function getActiveSlowRequestEntry() {
    const activeEntries = Array.from(slowRequestState.activeRequests.values());
    return activeEntries.length ? activeEntries[activeEntries.length - 1] : null;
}

function renderSlowRequestOverlay() {
    ensureSlowRequestOverlay();

    const activeEntry = getActiveSlowRequestEntry();

    if (!slowRequestState.overlayElement || !activeEntry) {
        return;
    }

    const messageIndex = activeEntry.messageIndex % activeEntry.messages.length;
    slowRequestState.titleElement.textContent = activeEntry.title;
    slowRequestState.subtitleElement.textContent = activeEntry.subtitle;
    slowRequestState.messageElement.textContent = activeEntry.messages[messageIndex];
}

function startSlowRequestRotation() {
    if (slowRequestState.rotationTimerId) {
        return;
    }

    slowRequestState.rotationTimerId = window.setInterval(() => {
        const activeEntry = getActiveSlowRequestEntry();

        if (!activeEntry) {
            stopSlowRequestRotation();
            return;
        }

        activeEntry.messageIndex = (activeEntry.messageIndex + 1) % activeEntry.messages.length;
        renderSlowRequestOverlay();
    }, SLOW_REQUEST_MESSAGE_INTERVAL_MS);
}

function stopSlowRequestRotation() {
    if (!slowRequestState.rotationTimerId) {
        return;
    }

    window.clearInterval(slowRequestState.rotationTimerId);
    slowRequestState.rotationTimerId = null;
}

function showSlowRequestOverlay(requestId, feedbackOptions) {
    ensureSlowRequestOverlay();

    const messages = Array.isArray(feedbackOptions.messages) && feedbackOptions.messages.length
        ? feedbackOptions.messages
        : DEFAULT_SLOW_REQUEST_MESSAGES;

    slowRequestState.activeRequests.set(requestId, {
        title: feedbackOptions.title || "This is taking longer than usual",
        subtitle: feedbackOptions.subtitle || "The app is still working. If the server went idle, it may just need a moment to start up.",
        messages,
        messageIndex: 0
    });

    slowRequestState.overlayElement.classList.add("is-visible");
    slowRequestState.overlayElement.setAttribute("aria-hidden", "false");
    renderSlowRequestOverlay();
    startSlowRequestRotation();
}

function hideSlowRequestOverlay(requestId) {
    slowRequestState.activeRequests.delete(requestId);

    if (!slowRequestState.activeRequests.size) {
        stopSlowRequestRotation();

        if (slowRequestState.overlayElement) {
            slowRequestState.overlayElement.classList.remove("is-visible");
            slowRequestState.overlayElement.setAttribute("aria-hidden", "true");
        }

        return;
    }

    renderSlowRequestOverlay();
}

async function apiRequest(path, requestOptions, feedbackOptions) {
    const fetchOptions = requestOptions ? { ...requestOptions } : {};
    const finalFeedbackOptions = feedbackOptions || {};
    const shouldShowSlowOverlay = finalFeedbackOptions.showSlowOverlay !== false;
    const slowOverlayDelayMs = typeof finalFeedbackOptions.delayMs === "number"
        ? Math.max(0, finalFeedbackOptions.delayMs)
        : SLOW_REQUEST_DELAY_MS;
    const requestId = ++slowRequestState.nextRequestId;
    const requestUrl = path.startsWith("http://") || path.startsWith("https://")
        ? path
        : API_BASE_URL + path;
    let slowOverlayShown = false;
    let slowRequestTimeoutId = null;

    if (shouldShowSlowOverlay) {
        const showOverlay = () => {
            slowOverlayShown = true;
            showSlowRequestOverlay(requestId, finalFeedbackOptions);
        };

        if (slowOverlayDelayMs === 0) {
            showOverlay();
        } else {
            slowRequestTimeoutId = window.setTimeout(showOverlay, slowOverlayDelayMs);
        }
    }

    try {
        return await fetch(requestUrl, fetchOptions);
    } finally {
        if (slowRequestTimeoutId) {
            window.clearTimeout(slowRequestTimeoutId);
        }

        if (slowOverlayShown) {
            hideSlowRequestOverlay(requestId);
        }
    }
}

window.apiRequest = apiRequest;
window.APP_SESSION_KEYS = APP_SESSION_KEYS;

// Redirect to login if not signed in
if (sessionStorage.getItem("loggedIn") !== "true" && !window.location.href.includes("index.html")) {
    window.location.href = "index.html";
}

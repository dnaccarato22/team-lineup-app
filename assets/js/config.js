const API_BASE_URL = "https://team-lineup-api.onrender.com";
const SLOW_REQUEST_DELAY_MS = 5000;
const SLOW_REQUEST_MESSAGE_INTERVAL_MS = 2400;
const DEFAULT_SLOW_REQUEST_MESSAGES = [
    "Starting up server...",
    "Waiting for the API to respond...",
    "Still working on your request...",
    'Baseball is a game of patience, and so is this app...',
    "Good things come to those who wait...",
    "Choo Choo!",
    "Is anyone actually reading these?",
    "Sooo great weather we're having, huh?",
    "Knock knock... Who's there?",
    "Cold... Cold who?",
    "Cold Start... get someone in the bullpen!",
    "⚾...............",
    ".⚾..............",
    "..⚾.............",
    "...⚾............",
    "....⚾...........",
    ".....⚾..........",
    "......⚾.........",
    ".......⚾........",
    "........⚾.......",
    ".........⚾......",
    "..........⚾.....",
    "...........⚾....",
    "............⚾...",
    ".............⚾..",
    "..............⚾.",
    "..............⚾🦇",
    "Get it? It's a 'baseball bat' ⚾🦇.",
    "Okay, I'll hush up now..."
];
const APP_SESSION_KEYS = {
    lineupPageState: "lineupPageState",
    appDataCache: "appDataCache",
    appDataRevision: "appDataRevision"
};
const APP_LOCAL_KEYS = {
    appDataRevision: "appDataRevision"
};
const APP_DATA_RESOURCES = {
    players: {
        path: "/players",
        notFoundValue: []
    },
    lineups: {
        path: "/lineups",
        notFoundValue: []
    },
    latestLineup: {
        path: "/latest_lineup",
        notFoundValue: null
    }
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
const appDataState = {
    cache: {},
    inflightRequests: new Map(),
    revision: "0"
};

function cloneAppData(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readStoredJson(storage, key, fallbackValue) {
    try {
        const rawValue = storage?.getItem(key);

        if (!rawValue) {
            return fallbackValue;
        }

        return JSON.parse(rawValue);
    } catch (error) {
        return fallbackValue;
    }
}

function writeStoredJson(storage, key, value) {
    try {
        storage?.setItem(key, JSON.stringify(value));
    } catch (error) {
        // Ignore storage write failures and continue with in-memory state.
    }
}

function getStoredAppDataRevision() {
    try {
        return localStorage.getItem(APP_LOCAL_KEYS.appDataRevision)
            || sessionStorage.getItem(APP_SESSION_KEYS.appDataRevision)
            || "0";
    } catch (error) {
        return sessionStorage.getItem(APP_SESSION_KEYS.appDataRevision) || "0";
    }
}

function persistAppDataState() {
    writeStoredJson(sessionStorage, APP_SESSION_KEYS.appDataCache, appDataState.cache);

    try {
        sessionStorage.setItem(APP_SESSION_KEYS.appDataRevision, appDataState.revision);
    } catch (error) {
        // Ignore session storage write failures and continue with in-memory state.
    }
}

function clearPersistedAppData() {
    appDataState.cache = {};
    appDataState.inflightRequests.clear();
    persistAppDataState();
}

function syncAppDataStateFromStorage() {
    const storedRevision = getStoredAppDataRevision();

    if (appDataState.revision === storedRevision) {
        return;
    }

    appDataState.revision = storedRevision;
    appDataState.cache = readStoredJson(sessionStorage, APP_SESSION_KEYS.appDataCache, {}) || {};
    appDataState.inflightRequests.clear();
}

function getAppDataCacheEntry(resourceKey) {
    syncAppDataStateFromStorage();
    return Object.prototype.hasOwnProperty.call(appDataState.cache, resourceKey)
        ? appDataState.cache[resourceKey]
        : undefined;
}

function setAppDataCacheEntry(resourceKey, data) {
    appDataState.cache[resourceKey] = {
        updatedAt: Date.now(),
        data: cloneAppData(data)
    };
    persistAppDataState();
}

function markAppDataStale() {
    appDataState.revision = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    appDataState.cache = {};
    appDataState.inflightRequests.clear();
    persistAppDataState();

    try {
        localStorage.setItem(APP_LOCAL_KEYS.appDataRevision, appDataState.revision);
    } catch (error) {
        // Ignore local storage write failures and continue with same-tab refresh behavior.
    }
}

function parseAppDataPayload(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return response.json();
    }

    return response.text();
}

async function getAppDataResource(resourceKey, options = {}) {
    syncAppDataStateFromStorage();

    const resourceDefinition = APP_DATA_RESOURCES[resourceKey];

    if (!resourceDefinition) {
        throw new Error("Unknown app data resource: " + resourceKey);
    }

    if (!options.force) {
        const cachedEntry = getAppDataCacheEntry(resourceKey);

        if (cachedEntry) {
            return cloneAppData(cachedEntry.data);
        }
    }

    if (!options.force && appDataState.inflightRequests.has(resourceKey)) {
        return cloneAppData(await appDataState.inflightRequests.get(resourceKey));
    }

    const requestPromise = (async () => {
        const response = await apiRequest(resourceDefinition.path, undefined, options.feedbackOptions || { showSlowOverlay: false });

        if (!response.ok) {
            if (response.status === 404 && Object.prototype.hasOwnProperty.call(resourceDefinition, "notFoundValue")) {
                setAppDataCacheEntry(resourceKey, resourceDefinition.notFoundValue);
                return cloneAppData(resourceDefinition.notFoundValue);
            }

            throw new Error(resourceKey + " request failed with status " + response.status + ".");
        }

        const data = await parseAppDataPayload(response);
        setAppDataCacheEntry(resourceKey, data);
        return cloneAppData(data);
    })();

    appDataState.inflightRequests.set(resourceKey, requestPromise);

    try {
        return cloneAppData(await requestPromise);
    } finally {
        appDataState.inflightRequests.delete(resourceKey);
    }
}

function getCachedAppDataSnapshot(resourceKey) {
    const cachedEntry = getAppDataCacheEntry(resourceKey);
    return cachedEntry ? cloneAppData(cachedEntry.data) : null;
}

async function preloadAppData(options = {}) {
    const resources = Array.isArray(options.resources) && options.resources.length
        ? [...new Set(options.resources)]
        : Object.keys(APP_DATA_RESOURCES);
    const results = await Promise.allSettled(resources.map((resourceKey) => {
        return getAppDataResource(resourceKey, {
            force: options.force === true,
            feedbackOptions: options.feedbackOptions || { showSlowOverlay: false }
        });
    }));

    return resources.reduce((summary, resourceKey, index) => {
        summary[resourceKey] = results[index];
        return summary;
    }, {});
}

async function refreshAppData(options = {}) {
    markAppDataStale();
    return preloadAppData({
        ...options,
        force: true
    });
}

function clearAppSessionData() {
    clearPersistedAppData();

    try {
        sessionStorage.removeItem(APP_SESSION_KEYS.appDataRevision);
    } catch (error) {
        // Ignore session storage write failures during logout.
    }
}

appDataState.revision = getStoredAppDataRevision();
appDataState.cache = readStoredJson(sessionStorage, APP_SESSION_KEYS.appDataCache, {}) || {};

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
window.getAppDataResource = getAppDataResource;
window.getCachedAppDataSnapshot = getCachedAppDataSnapshot;
window.preloadAppData = preloadAppData;
window.refreshAppData = refreshAppData;
window.clearAppSessionData = clearAppSessionData;

// Redirect to login if not signed in
if (sessionStorage.getItem("loggedIn") !== "true" && !window.location.href.includes("index.html")) {
    window.location.href = "index.html";
}

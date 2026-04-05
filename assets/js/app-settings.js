(function() {
    const DEFAULT_SETTINGS = Object.freeze({
        playerNameFormat: "abbreviated",
        lineupNameFormat: "abbreviated",
        rememberRoster: true,
        lineupSortOrder: "first_name_asc",
        inningsToDisplay: 9
    });

    const SETTINGS_STORAGE_KEY = "smartLineupSettings";
    const SAVED_ROSTER_STORAGE_KEY = "smartLineupSavedRoster";

    function getStorageItem(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function setStorageItem(key, value) {
        try {
            window.localStorage.setItem(key, value);
            return true;
        } catch (error) {
            return false;
        }
    }

    function removeStorageItem(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (error) {
            // Ignore storage errors and fall back to defaults.
        }
    }

    function normalizeNameFormat(value) {
        return value === "full" ? "full" : "abbreviated";
    }

    function normalizeSortOrder(value) {
        return ["first_name_asc", "last_name_asc", "rating_desc"].includes(value)
            ? value
            : DEFAULT_SETTINGS.lineupSortOrder;
    }

    function normalizeInnings(value) {
        const parsedValue = Number.parseInt(value, 10);

        if (Number.isNaN(parsedValue)) {
            return DEFAULT_SETTINGS.inningsToDisplay;
        }

        return Math.min(9, Math.max(1, parsedValue));
    }

    function normalizeSettings(rawSettings) {
        const settings = rawSettings || {};

        return {
            playerNameFormat: normalizeNameFormat(settings.playerNameFormat),
            lineupNameFormat: normalizeNameFormat(settings.lineupNameFormat),
            rememberRoster: settings.rememberRoster !== false,
            lineupSortOrder: normalizeSortOrder(settings.lineupSortOrder),
            inningsToDisplay: normalizeInnings(settings.inningsToDisplay)
        };
    }

    function getSettings() {
        const storedSettings = getStorageItem(SETTINGS_STORAGE_KEY);

        if (!storedSettings) {
            return { ...DEFAULT_SETTINGS };
        }

        try {
            return normalizeSettings(JSON.parse(storedSettings));
        } catch (error) {
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings(nextSettings) {
        const normalizedSettings = normalizeSettings(nextSettings);
        setStorageItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));
        return normalizedSettings;
    }

    function updateSettings(partialSettings) {
        return saveSettings({ ...getSettings(), ...(partialSettings || {}) });
    }

    function clearSettings() {
        removeStorageItem(SETTINGS_STORAGE_KEY);
        return { ...DEFAULT_SETTINGS };
    }

    function getSavedRosterIds() {
        const storedRoster = getStorageItem(SAVED_ROSTER_STORAGE_KEY);

        if (!storedRoster) {
            return [];
        }

        try {
            const parsedRoster = JSON.parse(storedRoster);
            return Array.isArray(parsedRoster) ? parsedRoster.map((playerId) => String(playerId)) : [];
        } catch (error) {
            return [];
        }
    }

    function saveSavedRosterIds(playerIds) {
        const normalizedIds = Array.isArray(playerIds)
            ? playerIds.map((playerId) => String(playerId)).filter(Boolean)
            : [];

        if (!normalizedIds.length) {
            removeStorageItem(SAVED_ROSTER_STORAGE_KEY);
            return [];
        }

        setStorageItem(SAVED_ROSTER_STORAGE_KEY, JSON.stringify(normalizedIds));
        return normalizedIds;
    }

    function clearSavedRoster() {
        removeStorageItem(SAVED_ROSTER_STORAGE_KEY);
        return [];
    }

    window.AppSettings = {
        DEFAULT_SETTINGS,
        SETTINGS_STORAGE_KEY,
        SAVED_ROSTER_STORAGE_KEY,
        getSettings,
        saveSettings,
        updateSettings,
        clearSettings,
        getSavedRosterIds,
        saveSavedRosterIds,
        clearSavedRoster
    };
})();

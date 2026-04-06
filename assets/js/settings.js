const POSITION_FIELDS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const settingsForm = document.getElementById("settingsForm");
const playerNameFormatSelect = document.getElementById("playerNameFormat");
const lineupNameFormatSelect = document.getElementById("lineupNameFormat");
const rememberRosterInput = document.getElementById("rememberRoster");
const lineupSortOrderSelect = document.getElementById("lineupSortOrder");
const inningsToDisplaySelect = document.getElementById("inningsToDisplay");
const settingsStatus = document.getElementById("settingsStatus");
const apiStatusBadge = document.getElementById("apiStatusBadge");
const apiStatusDetails = document.getElementById("apiStatusDetails");
const refreshApiStatusBtn = document.getElementById("refreshApiStatusBtn");
const exportPlayersBtn = document.getElementById("exportPlayersBtn");
const importPlayersBtn = document.getElementById("importPlayersBtn");
const importPlayersFile = document.getElementById("importPlayersFile");
const clearLocalPreferencesBtn = document.getElementById("clearLocalPreferencesBtn");
const dataAdminStatus = document.getElementById("dataAdminStatus");

function getSettingsApi() {
    return window.AppSettings;
}

function populateSettingsForm(settings) {
    playerNameFormatSelect.value = settings.playerNameFormat;
    lineupNameFormatSelect.value = settings.lineupNameFormat;
    rememberRosterInput.checked = settings.rememberRoster;
    lineupSortOrderSelect.value = settings.lineupSortOrder;
    inningsToDisplaySelect.value = String(settings.inningsToDisplay);
}

function getFormSettings() {
    return {
        playerNameFormat: playerNameFormatSelect.value,
        lineupNameFormat: lineupNameFormatSelect.value,
        rememberRoster: rememberRosterInput.checked,
        lineupSortOrder: lineupSortOrderSelect.value,
        inningsToDisplay: Number.parseInt(inningsToDisplaySelect.value, 10)
    };
}

function sanitizeScore(value) {
    const parsedValue = Number.parseInt(value, 10);

    if (Number.isNaN(parsedValue)) {
        return 0;
    }

    return Math.min(5, Math.max(0, parsedValue));
}

function getPositionValue(player, position) {
    if (Array.isArray(player.position_scores)) {
        const scoreEntry = player.position_scores.find((entry) => {
            return String(entry.position || "").toUpperCase() === position;
        });

        if (scoreEntry && scoreEntry.score !== undefined && scoreEntry.score !== null) {
            return sanitizeScore(scoreEntry.score);
        }
    }

    return sanitizeScore(player[position]);
}

function buildImportPayload(player) {
    const firstName = String(player.first_name ?? player.firstName ?? "").trim();
    const lastName = String(player.last_name ?? player.lastName ?? "").trim();

    if (!firstName || !lastName) {
        return null;
    }

    return {
        first_name: firstName,
        last_name: lastName,
        position_scores: POSITION_FIELDS.map((position) => ({
            position,
            score: getPositionValue(player, position)
        }))
    };
}

async function refreshApiStatus() {
    apiStatusBadge.className = "badge bg-secondary";
    apiStatusBadge.textContent = "Checking...";
    apiStatusDetails.textContent = "Checking API health...";

    try {
        const response = await fetch(API_BASE_URL + "/health", { cache: "no-store" });

        if (!response.ok) {
            throw new Error("Health check returned " + response.status + ".");
        }

        const data = await response.json();
        const apiStatus = String(data.status || "online");
        apiStatusBadge.className = "badge bg-success";
        apiStatusBadge.textContent = apiStatus.charAt(0).toUpperCase() + apiStatus.slice(1);
        apiStatusDetails.textContent = "API is reachable and responded successfully.";
    } catch (error) {
        console.error("Error checking API health:", error);
        apiStatusBadge.className = "badge bg-danger";
        apiStatusBadge.textContent = "Offline";
        apiStatusDetails.textContent = "Unable to reach the API right now.";
    }
}

async function exportPlayers() {
    dataAdminStatus.textContent = "Exporting players...";

    try {
        const response = await fetch(API_BASE_URL + "/players");

        if (!response.ok) {
            throw new Error("Export request failed with status " + response.status + ".");
        }

        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const downloadUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");

        downloadLink.href = downloadUrl;
        downloadLink.download = "players-export-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        URL.revokeObjectURL(downloadUrl);
        dataAdminStatus.textContent = "Players exported.";
    } catch (error) {
        console.error("Error exporting players:", error);
        dataAdminStatus.textContent = "Unable to export players.";
    }
}

async function importPlayers() {
    const selectedFile = importPlayersFile.files[0];

    if (!selectedFile) {
        dataAdminStatus.textContent = "Choose a JSON file before importing.";
        return;
    }

    dataAdminStatus.textContent = "Importing players...";
    importPlayersBtn.disabled = true;

    try {
        const fileContents = await selectedFile.text();
        const parsedData = JSON.parse(fileContents);
        const importedPlayers = Array.isArray(parsedData)
            ? parsedData
            : (Array.isArray(parsedData.players) ? parsedData.players : []);

        if (!importedPlayers.length) {
            throw new Error("No player records were found in the selected file.");
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const player of importedPlayers) {
            const payload = buildImportPayload(player);

            if (!payload) {
                skippedCount += 1;
                continue;
            }

            try {
                const response = await fetch(API_BASE_URL + "/add_player", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    importedCount += 1;
                } else {
                    skippedCount += 1;
                }
            } catch (error) {
                skippedCount += 1;
            }
        }

        dataAdminStatus.textContent = skippedCount
            ? "Imported " + importedCount + " players. Skipped " + skippedCount + "."
            : "Imported " + importedCount + " players.";
        importPlayersFile.value = "";
    } catch (error) {
        console.error("Error importing players:", error);
        dataAdminStatus.textContent = "Unable to import players.";
    } finally {
        importPlayersBtn.disabled = false;
    }
}

function clearLocalPreferences() {
    if (!window.confirm("Clear saved settings and any remembered roster on this device?")) {
        return;
    }

    const settingsApi = getSettingsApi();
    settingsApi.clearSettings();
    settingsApi.clearSavedRoster();
    populateSettingsForm(settingsApi.getSettings());
    settingsStatus.textContent = "Settings reset to defaults.";
    dataAdminStatus.textContent = "Saved local preferences cleared.";
}

settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const settingsApi = getSettingsApi();
    const savedSettings = settingsApi.updateSettings(getFormSettings());

    if (!savedSettings.rememberRoster) {
        settingsApi.clearSavedRoster();
    }

    populateSettingsForm(savedSettings);
    settingsStatus.textContent = "Settings saved. They will apply on the Lineup page.";
});

refreshApiStatusBtn.addEventListener("click", refreshApiStatus);
exportPlayersBtn.addEventListener("click", exportPlayers);
importPlayersBtn.addEventListener("click", importPlayers);
clearLocalPreferencesBtn.addEventListener("click", clearLocalPreferences);

populateSettingsForm(getSettingsApi().getSettings());
refreshApiStatus();

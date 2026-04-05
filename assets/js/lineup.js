const API_BASE_URL = "https://team-lineup-api.onrender.com";

const fallbackSettings = {
    playerNameFormat: "abbreviated",
    lineupNameFormat: "abbreviated",
    rememberRoster: true,
    lineupSortOrder: "first_name_asc",
    inningsToDisplay: 9
};

const rosterState = {
    allPlayers: [],
    selectedPlayers: [],
    searchTerm: ""
};

const playerSearch = document.getElementById("playerSearch");
const playerSelect = document.getElementById("playerSelect");
const playerSearchDropdown = document.getElementById("playerSearchDropdown");
const rosterTableBody = document.getElementById("rosterTableBody");
const rosterMobileList = document.getElementById("rosterMobileList");
const clearRosterBtn = document.getElementById("clearRosterBtn");
const generateLineupBtn = document.getElementById("generateLineupBtn");
const downloadLineupBtn = document.getElementById("downloadLineupBtn");
const lineupResult = document.getElementById("lineupResult");
const lineupStatus = document.getElementById("lineupStatus");
const generatedLineupSection = document.getElementById("generatedLineupSection");

function getSettings() {
    return window.AppSettings?.getSettings ? window.AppSettings.getSettings() : fallbackSettings;
}

function getPlayerId(player) {
    return player.player_id ?? player.id;
}

function getPlayerName(player, formatOverride) {
    const nameFormat = formatOverride || getSettings().playerNameFormat;
    const firstName = String(player.first_name || "").trim();
    const lastName = String(player.last_name || "").trim();

    if (nameFormat === "full" && (firstName || lastName)) {
        return [firstName, lastName].filter(Boolean).join(" ");
    }

    if (firstName && lastName) {
        return firstName + " " + lastName.charAt(0) + ".";
    }

    if (firstName) {
        return firstName;
    }

    if (lastName) {
        return lastName;
    }

    return player.name || ("Player " + (player.id || ""));
}

function getOverallRating(player) {
    if (Array.isArray(player.position_scores)) {
        return player.position_scores.reduce((total, entry) => {
            return total + (Number.parseInt(entry.score, 10) || 0);
        }, 0);
    }

    return ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].reduce((total, position) => {
        return total + (Number.parseInt(player[position], 10) || 0);
    }, 0);
}

function compareText(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function sortPlayers(players) {
    const sortOrder = getSettings().lineupSortOrder;
    const sortedPlayers = [...players];

    sortedPlayers.sort((firstPlayer, secondPlayer) => {
        if (sortOrder === "rating_desc") {
            const ratingDifference = getOverallRating(secondPlayer) - getOverallRating(firstPlayer);

            if (ratingDifference !== 0) {
                return ratingDifference;
            }
        }

        if (sortOrder === "last_name_asc") {
            const lastNameComparison = compareText(firstPlayer.last_name || "", secondPlayer.last_name || "");

            if (lastNameComparison !== 0) {
                return lastNameComparison;
            }

            return compareText(firstPlayer.first_name || "", secondPlayer.first_name || "");
        }

        const firstNameComparison = compareText(firstPlayer.first_name || "", secondPlayer.first_name || "");

        if (firstNameComparison !== 0) {
            return firstNameComparison;
        }

        return compareText(firstPlayer.last_name || "", secondPlayer.last_name || "");
    });

    return sortedPlayers;
}

function saveRememberedRoster() {
    const playerIds = rosterState.selectedPlayers.map((player) => String(getPlayerId(player)));

    if (!getSettings().rememberRoster) {
        window.AppSettings?.clearSavedRoster?.();
        return;
    }

    window.AppSettings?.saveSavedRosterIds?.(playerIds);
}

function restoreRememberedRoster() {
    if (!getSettings().rememberRoster) {
        window.AppSettings?.clearSavedRoster?.();
        rosterState.selectedPlayers = [];
        return false;
    }

    const savedRosterIds = window.AppSettings?.getSavedRosterIds?.() || [];

    if (!savedRosterIds.length) {
        rosterState.selectedPlayers = [];
        return false;
    }

    rosterState.selectedPlayers = savedRosterIds
        .map((savedPlayerId) => {
            return rosterState.allPlayers.find((player) => String(getPlayerId(player)) === String(savedPlayerId));
        })
        .filter(Boolean);

    saveRememberedRoster();
    return rosterState.selectedPlayers.length > 0;
}

function getAvailablePlayers() {
    const normalizedSearchTerm = rosterState.searchTerm.trim().toLowerCase();

    return sortPlayers(rosterState.allPlayers.filter((player) => {
        const playerId = String(getPlayerId(player));
        const isSelected = rosterState.selectedPlayers.some((selectedPlayer) => String(getPlayerId(selectedPlayer)) === playerId);
        const firstName = (player.first_name || "").toLowerCase();
        const lastName = (player.last_name || "").toLowerCase();
        const matchesSearch = !normalizedSearchTerm || firstName.includes(normalizedSearchTerm) || lastName.includes(normalizedSearchTerm);

        return !isSelected && matchesSearch;
    }));
}

function renderPlayerOptions() {
    const normalizedSearchTerm = rosterState.searchTerm.trim().toLowerCase();
    const availablePlayers = getAvailablePlayers();

    if (!availablePlayers.length) {
        const emptyMessage = normalizedSearchTerm ? "No matching players found" : "No more players available";
        playerSelect.innerHTML = '<option value="">' + emptyMessage + '</option>';
        playerSearchDropdown.innerHTML = normalizedSearchTerm
            ? '<button type="button" class="list-group-item list-group-item-action disabled">' + emptyMessage + '</button>'
            : "";
        playerSearchDropdown.style.display = normalizedSearchTerm ? "block" : "none";
        return;
    }

    playerSelect.innerHTML = '<option value="">Select a player</option>' + availablePlayers.map((player) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");
        const playerName = getPlayerName(player);
        return '<option value="' + playerId + '">' + playerName + '</option>';
    }).join("");

    playerSearchDropdown.innerHTML = availablePlayers.map((player) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");
        const playerName = getPlayerName(player);
        return '<button type="button" class="list-group-item list-group-item-action player-search-option" data-player-id="' + playerId + '" data-player-name="' + playerName.replace(/"/g, "&quot;") + '">' + playerName + '</button>';
    }).join("");
    playerSearchDropdown.style.display = document.activeElement === playerSearch ? "block" : "none";
}

function selectPlayer(playerId) {
    const option = Array.from(playerSelect.options).find((candidate) => candidate.value === playerId);

    if (!option) {
        return;
    }

    playerSelect.value = playerId;
    playerSearch.value = option.textContent;
    playerSearchDropdown.style.display = "none";
}

function addSelectedPlayer(playerId) {
    if (!playerId) {
        return;
    }

    const player = rosterState.allPlayers.find((candidate) => String(getPlayerId(candidate)) === playerId);

    if (!player) {
        return;
    }

    rosterState.selectedPlayers.push(player);
    rosterState.searchTerm = "";
    playerSearch.value = "";
    playerSelect.value = "";
    renderRoster();
    renderPlayerOptions();
    saveRememberedRoster();
    lineupStatus.textContent = getPlayerName(player) + " added to the roster.";
}

function renderRoster() {
    if (!rosterState.selectedPlayers.length) {
        rosterTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">No players added yet.</td></tr>';
        rosterMobileList.innerHTML = '<div class="lineup-mobile-empty">No players added yet.</div>';
        return;
    }

    rosterTableBody.innerHTML = rosterState.selectedPlayers.map((player) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");
        return '<tr><td>' + getPlayerName(player) + '</td><td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger remove-player-btn" data-player-id="' + playerId + '">Remove</button></td></tr>';
    }).join("");

    rosterMobileList.innerHTML = rosterState.selectedPlayers.map((player) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");

        return '<div class="lineup-mobile-roster-card">' +
            '<div class="lineup-mobile-roster-header">' +
                '<div>' +
                    '<h6 class="lineup-mobile-player-name">' + getPlayerName(player) + '</h6>' +
                    '<p class="lineup-mobile-player-subtitle">Selected for this roster</p>' +
                '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-danger remove-player-btn" data-player-id="' + playerId + '">Remove</button>' +
            '</div>' +
        '</div>';
    }).join("");
}

function renderGeneratedLineup(lineup) {
    const players = Array.isArray(lineup.players) ? lineup.players : [];

    if (!players.length) {
        lineupResult.innerHTML = '<div class="text-muted">No lineup data was returned.</div>';
        downloadLineupBtn.disabled = true;
        return;
    }

    const inningNumbers = Array.from({ length: getSettings().inningsToDisplay }, (_, index) => index + 1);
    const lineupRows = players.map((player) => {
        const inningMap = new Map((player.innings || []).map((inningEntry) => [inningEntry.inning, inningEntry.position]));
        const inningCells = inningNumbers.map((inningNumber) => {
            const position = inningMap.get(inningNumber) || "--";
            return '<td class="text-center">' + position + '</td>';
        }).join("");

        return '<tr><td class="fw-semibold">' + getPlayerName(player, getSettings().lineupNameFormat) + '</td>' + inningCells + '</tr>';
    }).join("");

    lineupResult.innerHTML =
        '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">' +
            '<div><h6 class="mb-1">Lineup</h6></div>' +
            '<div class="text-muted small">' + players.length + ' players</div>' +
        '</div>' +
        '<div class="table-responsive">' +
            '<table class="table table-bordered table-striped align-middle mb-0">' +
                '<thead>' +
                    '<tr>' +
                        '<th>Player</th>' +
                        inningNumbers.map((inningNumber) => '<th class="text-center">' + inningNumber + '</th>').join("") +
                    '</tr>' +
                '</thead>' +
                '<tbody>' + lineupRows + '</tbody>' +
            '</table>' +
        '</div>';
    downloadLineupBtn.disabled = false;
}

function downloadLineupPdf() {
    const lineupTable = lineupResult.querySelector("table");

    if (!lineupTable) {
        lineupStatus.textContent = "Generate a lineup before downloading the PDF.";
        return;
    }

    const printWindow = window.open("", "_blank", "width=1000,height=800");

    if (!printWindow) {
        lineupStatus.textContent = "Unable to open the PDF preview window.";
        return;
    }

    const printMarkup =
        '<!doctype html>' +
        '<html><head><title>lineup.pdf</title>' +
        '<meta charset="utf-8">' +
        '<style>' +
            '@page{size:auto;margin:0.5in;}' +
            'body{font-family:Arial,sans-serif;padding:24px;color:#212529;}' +
            'h1{margin:0 0 16px;font-size:24px;}' +
            'table{width:100%;border-collapse:collapse;}' +
            'th,td{border:1px solid #ced4da;padding:8px;text-align:center;}' +
            'th:first-child,td:first-child{text-align:left;}' +
            'thead th{background:#f8f9fa;}' +
        '</style></head><body>' +
        '<h1>Lineup</h1>' +
        lineupTable.outerHTML +
        '<script>' +
            'window.addEventListener("load", function () {' +
                'setTimeout(function () {' +
                    'window.focus();' +
                    'window.print();' +
                '}, 250);' +
            '});' +
        '<\/script>' +
        '</body></html>';

    printWindow.document.open();
    printWindow.document.write(printMarkup);
    printWindow.document.close();
    lineupStatus.textContent = "Opening PDF print preview...";
}

async function loadPlayers() {
    lineupStatus.textContent = "Loading players...";
    const spinner = document.getElementById("player_spinner");
    spinner.style.display = "block";

    try {
        const response = await fetch(API_BASE_URL + "/players");
        const data = await response.json();
        rosterState.allPlayers = Array.isArray(data) ? data : (data.players || []);

        const restoredSavedRoster = restoreRememberedRoster();
        renderRoster();
        renderPlayerOptions();
        lineupStatus.textContent = rosterState.allPlayers.length
            ? (restoredSavedRoster ? "Players loaded. Saved roster restored." : "Players loaded.")
            : "No players returned by the API.";
    } catch (error) {
        console.error("Error loading players:", error);
        lineupStatus.textContent = "Unable to load players.";
        playerSelect.innerHTML = '<option value="">Unable to load players</option>';
        playerSearchDropdown.innerHTML = "";
        playerSearchDropdown.style.display = "none";
    } finally {
        spinner.style.display = "none";
    }
}

async function generateLineup() {
    const spinner = document.getElementById("lineup_spinner");
    spinner.style.display = "block";
    downloadLineupBtn.disabled = true;

    if (rosterState.selectedPlayers.length < 9) {
        lineupStatus.textContent = "9 players required to generate a lineup.";
        spinner.style.display = "none";
        return;
    }

    const payload = {
        player_ids: rosterState.selectedPlayers.map((player) => getPlayerId(player))
    };

    lineupResult.innerHTML = '<div class="text-muted">Generating lineup...</div>';
    generatedLineupSection?.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
        const response = await fetch(API_BASE_URL + "/generate_lineup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error("Lineup request failed with status " + response.status + ".");
        }

        const data = await response.json();
        renderGeneratedLineup(data);
        lineupStatus.textContent = "Lineup generated.";
    } catch (error) {
        console.error("Error generating lineup:", error);
        lineupResult.innerHTML = '<div class="text-muted">Unable to generate lineup with the configured endpoint options.</div>';
        downloadLineupBtn.disabled = true;
        lineupStatus.textContent = "Lineup generation failed.";
    } finally {
        spinner.style.display = "none";
    }
}

playerSearch.addEventListener("input", (event) => {
    rosterState.searchTerm = event.target.value;
    playerSelect.value = "";
    renderPlayerOptions();
});

playerSearch.addEventListener("focus", () => {
    renderPlayerOptions();
});

playerSearchDropdown.addEventListener("click", (event) => {
    const option = event.target.closest(".player-search-option");

    if (!option) {
        return;
    }

    const playerId = option.getAttribute("data-player-id");
    selectPlayer(playerId);
    addSelectedPlayer(playerId);
});

document.addEventListener("click", (event) => {
    if (event.target === playerSearch || playerSearchDropdown.contains(event.target)) {
        return;
    }

    playerSearchDropdown.style.display = "none";
});

function handleRemovePlayerClick(event) {
    const removeButton = event.target.closest(".remove-player-btn");

    if (!removeButton) {
        return;
    }

    const playerId = removeButton.getAttribute("data-player-id");
    rosterState.selectedPlayers = rosterState.selectedPlayers.filter((player) => String(getPlayerId(player)) !== playerId);
    renderRoster();
    renderPlayerOptions();
    saveRememberedRoster();
    lineupStatus.textContent = "Player removed from the roster.";
}

rosterTableBody.addEventListener("click", handleRemovePlayerClick);
rosterMobileList.addEventListener("click", handleRemovePlayerClick);

clearRosterBtn.addEventListener("click", () => {
    rosterState.selectedPlayers = [];
    rosterState.searchTerm = "";
    playerSearch.value = "";
    playerSelect.value = "";
    renderRoster();
    renderPlayerOptions();
    saveRememberedRoster();
    downloadLineupBtn.disabled = true;
    lineupStatus.textContent = "Roster cleared.";
});

generateLineupBtn.addEventListener("click", generateLineup);
downloadLineupBtn.addEventListener("click", downloadLineupPdf);
loadPlayers();

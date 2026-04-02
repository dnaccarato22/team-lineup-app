const API_BASE_URL = "https://team-lineup-api.onrender.com";

const rosterState = {
    allPlayers: [],
    selectedPlayers: [],
    searchTerm: ""
};

const playerSearch = document.getElementById("playerSearch");
const playerSelect = document.getElementById("playerSelect");
const playerSearchDropdown = document.getElementById("playerSearchDropdown");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const rosterTableBody = document.getElementById("rosterTableBody");
const clearRosterBtn = document.getElementById("clearRosterBtn");
const generateLineupBtn = document.getElementById("generateLineupBtn");
const lineupResult = document.getElementById("lineupResult");
const lineupStatus = document.getElementById("lineupStatus");

function getPlayerName(player) {
    if (player.first_name && player.last_name) {
        return player.first_name + " " + player.last_name.charAt(0) + ".";
    }

    if (player.first_name) {
        return player.first_name;
    }

    return player.name || ("Player " + (player.id || ""));
}

function getPlayerId(player) {
    return player.player_id;
}

function getAvailablePlayers() {
    const normalizedSearchTerm = rosterState.searchTerm.trim().toLowerCase();

    return rosterState.allPlayers.filter((player) => {
        const playerId = String(getPlayerId(player));
        const isSelected = rosterState.selectedPlayers.some((selectedPlayer) => String(getPlayerId(selectedPlayer)) === playerId);
        const firstName = (player.first_name || "").toLowerCase();
        const matchesSearch = !normalizedSearchTerm || firstName.includes(normalizedSearchTerm);

        return !isSelected && matchesSearch;
    });
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

function renderRoster() {
    if (!rosterState.selectedPlayers.length) {
        rosterTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">No players added yet.</td></tr>';
        return;
    }

    rosterTableBody.innerHTML = rosterState.selectedPlayers.map((player) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");
        return '<tr><td>' + getPlayerName(player) + '</td><td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger remove-player-btn" data-player-id="' + playerId + '">Remove</button></td></tr>';
    }).join("");
}

function renderGeneratedLineup(lineup) {
    const players = Array.isArray(lineup.players) ? lineup.players : [];

    if (!players.length) {
        lineupResult.innerHTML = '<div class="text-muted">No lineup data was returned.</div>';
        return;
    }

    const inningNumbers = Array.from({ length: 9 }, (_, index) => index + 1);
    const lineupRows = players.map((player) => {
        const inningMap = new Map((player.innings || []).map((inningEntry) => [inningEntry.inning, inningEntry.position]));
        const inningCells = inningNumbers.map((inningNumber) => {
            const position = inningMap.get(inningNumber) || "--";
            return '<td class="text-center">' + position + '</td>';
        }).join("");

        return '<tr><td class="fw-semibold">' + getPlayerName(player) + '</td>' + inningCells + '</tr>';
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
                        inningNumbers.map((inningNumber) => '<th class="text-center">Inning ' + inningNumber + '</th>').join("") +
                    '</tr>' +
                '</thead>' +
                '<tbody>' + lineupRows + '</tbody>' +
            '</table>' +
        '</div>';
}

async function loadPlayers() {
    lineupStatus.textContent = "Loading players...";
    const spinner = document.getElementById("player_spinner");
    spinner.style.display = "block";

    try {
        console.log("Fetching players from API...");
        const response = await fetch(API_BASE_URL + "/players");
        const data = await response.json();
        rosterState.allPlayers = Array.isArray(data) ? data : (data.players || []);
        renderPlayerOptions();
        lineupStatus.textContent = rosterState.allPlayers.length ? "Players loaded." : "No players returned by the API.";
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

    if (!rosterState.selectedPlayers.length) {
        lineupStatus.textContent = "Add at least one player before generating a lineup.";
        spinner.style.display = "none";
        return;
    }

    const payload = {
        player_ids: rosterState.selectedPlayers.map((player) => getPlayerId(player))
    };

    const endpoints = [
        { path: "/generate_lineup", options: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } }
    ];

    lineupResult.innerHTML = '<div class="text-muted">Generating lineup...</div>';

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(API_BASE_URL + endpoint.path, endpoint.options);

            if (!response.ok) {
                continue;
            }

            const data = await response.json();
            renderGeneratedLineup(data);
            lineupStatus.textContent = "Lineup generated.";
            return;
        } catch (error) {
            console.error("Error generating lineup from " + endpoint.path + ":", error);
        } finally {
            spinner.style.display = "none";
        }
    }

    lineupResult.innerHTML = '<div class="text-muted">Unable to generate lineup with the configured endpoint options.</div>';
    lineupStatus.textContent = "Lineup generation failed.";
}

addPlayerBtn.addEventListener("click", () => {
    const selectedPlayerId = playerSelect.value;

    if (!selectedPlayerId) {
        return;
    }

    const player = rosterState.allPlayers.find((candidate) => String(getPlayerId(candidate)) === selectedPlayerId);

    if (!player) {
        return;
    }

    rosterState.selectedPlayers.push(player);
    rosterState.searchTerm = "";
    playerSearch.value = "";
    playerSelect.value = "";
    renderRoster();
    renderPlayerOptions();
    lineupStatus.textContent = getPlayerName(player) + " added to the roster.";
});

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

    selectPlayer(option.getAttribute("data-player-id"));
});

document.addEventListener("click", (event) => {
    if (event.target === playerSearch || playerSearchDropdown.contains(event.target)) {
        return;
    }

    playerSearchDropdown.style.display = "none";
});

rosterTableBody.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".remove-player-btn");

    if (!removeButton) {
        return;
    }

    const playerId = removeButton.getAttribute("data-player-id");
    rosterState.selectedPlayers = rosterState.selectedPlayers.filter((player) => String(getPlayerId(player)) !== playerId);
    renderRoster();
    renderPlayerOptions();
    lineupStatus.textContent = "Player removed from the roster.";
});

clearRosterBtn.addEventListener("click", () => {
    rosterState.selectedPlayers = [];
    rosterState.searchTerm = "";
    playerSearch.value = "";
    playerSelect.value = "";
    renderRoster();
    renderPlayerOptions();
    lineupStatus.textContent = "Roster cleared.";
});

generateLineupBtn.addEventListener("click", generateLineup);
loadPlayers();

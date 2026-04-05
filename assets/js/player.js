const API_BASE_URL = "https://team-lineup-api.onrender.com";

const POSITION_FIELDS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

const playerSearchInput = document.getElementById("playerSearchInput");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const playersTableBody = document.getElementById("playersTableBody");
const playerStatus = document.getElementById("playerStatus");
const playerSpinner = document.getElementById("player_spinner");

const playerState = {
    players: [],
    searchTerm: "",
    editingPlayerId: null,
    editDraft: null,
    isAdding: false,
    newPlayerDraft: null
};

function getPlayerId(player) {
    return player.player_id ?? player.id;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function setBusy(isBusy) {
    playerSpinner.style.display = isBusy ? "block" : "none";
}

function sanitizeScore(value) {
    const parsedValue = Number.parseInt(value, 10);

    if (Number.isNaN(parsedValue)) {
        return 0;
    }

    return Math.max(0, Math.min(5, parsedValue));
}

function getPositionValue(player, position) {
    if (Array.isArray(player.position_scores)) {
        const matchingScore = player.position_scores.find((entry) => {
            return String(entry.position || "").toUpperCase() === position;
        });

        if (matchingScore && matchingScore.score !== undefined && matchingScore.score !== null) {
            return sanitizeScore(matchingScore.score);
        }
    }

    if (player[position] !== undefined && player[position] !== null && player[position] !== "") {
        return sanitizeScore(player[position]);
    }

    return 0;
}

function createEmptyDraft() {
    const draft = {
        first_name: "",
        last_name: ""
    };

    POSITION_FIELDS.forEach((position) => {
        draft[position] = 0;
    });

    return draft;
}

function createDraftFromPlayer(player) {
    const draft = {
        first_name: player.first_name || "",
        last_name: player.last_name || ""
    };

    POSITION_FIELDS.forEach((position) => {
        draft[position] = getPositionValue(player, position);
    });

    return draft;
}

function buildPositionScores(draft) {
    return POSITION_FIELDS.map((position) => ({
        position,
        score: sanitizeScore(draft[position])
    }));
}

function getPlayerPayload(draft, playerId) {
    const payload = {
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        position_scores: buildPositionScores(draft)
    };

    if (playerId) {
        payload.player_id = String(playerId);
    }

    return payload;
}

function getFilteredPlayers() {
    const normalizedSearchTerm = playerState.searchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm) {
        return playerState.players;
    }

    return playerState.players.filter((player) => {
        const fullName = ((player.first_name || "") + " " + (player.last_name || "")).trim().toLowerCase();
        return fullName.includes(normalizedSearchTerm);
    });
}

function renderValueCell(value) {
    return '<td class="text-center">' + escapeHtml(value) + "</td>";
}

function renderEditableCell(playerKey, fieldName, type, value, options) {
    const inputClass = type === "number" ? "form-control form-control-sm text-center" : "form-control form-control-sm";
    const minAttr = type === "number" ? ' min="0" max="5"' : "";

    return '<td>' +
        '<input type="' + type + '" class="' + inputClass + ' player-field-input" data-player-key="' + escapeHtml(playerKey) + '" data-field="' + escapeHtml(fieldName) + '" value="' + escapeHtml(value) + '"' + minAttr + ">" +
        "</td>";
}

function renderEditableRow(playerKey, draft, isNew) {
    const positionCells = POSITION_FIELDS.map((position) => renderEditableCell(playerKey, position, "number", draft[position], { isNew })).join("");
    const actionButtons = isNew
        ? '<button type="button" class="btn btn-sm btn-success save-player-btn" data-player-key="new">Save</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-secondary cancel-player-btn" data-player-key="new">Cancel</button>'
        : '<button type="button" class="btn btn-sm btn-success save-player-btn" data-player-key="' + escapeHtml(playerKey) + '">Save</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-secondary cancel-player-btn" data-player-key="' + escapeHtml(playerKey) + '">Cancel</button>';

    return "<tr>" +
        renderEditableCell(playerKey, "first_name", "text", draft.first_name, { isNew }) +
        renderEditableCell(playerKey, "last_name", "text", draft.last_name, { isNew }) +
        positionCells +
        '<td class="text-end text-nowrap">' + actionButtons + "</td>" +
        "</tr>";
}

function renderReadOnlyRow(player) {
    const playerId = String(getPlayerId(player));
    const positionCells = POSITION_FIELDS.map((position) => renderValueCell(getPositionValue(player, position))).join("");

    return "<tr>" +
        "<td>" + escapeHtml(player.first_name || "") + "</td>" +
        "<td>" + escapeHtml(player.last_name || "") + "</td>" +
        positionCells +
        '<td class="text-end text-nowrap">' +
            '<button type="button" class="btn btn-sm btn-outline-primary edit-player-btn" data-player-id="' + escapeHtml(playerId) + '">Edit</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-danger delete-player-btn" data-player-id="' + escapeHtml(playerId) + '">Remove</button>' +
        "</td>" +
        "</tr>";
}

function renderPlayers() {
    const filteredPlayers = getFilteredPlayers();
    const rows = [];

    if (playerState.isAdding && playerState.newPlayerDraft) {
        rows.push(renderEditableRow("new", playerState.newPlayerDraft, true));
    }

    filteredPlayers.forEach((player) => {
        const playerId = String(getPlayerId(player));

        if (playerState.editingPlayerId === playerId && playerState.editDraft) {
            rows.push(renderEditableRow(playerId, playerState.editDraft, false));
            return;
        }

        rows.push(renderReadOnlyRow(player));
    });

    if (!rows.length) {
        playersTableBody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No players found.</td></tr>';
        return;
    }

    playersTableBody.innerHTML = rows.join("");
}

function resetEditingState() {
    playerState.editingPlayerId = null;
    playerState.editDraft = null;
}

function resetNewPlayerState() {
    playerState.isAdding = false;
    playerState.newPlayerDraft = null;
}

function validateDraft(draft) {
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
        playerStatus.textContent = "First name and last name are required.";
        return false;
    }

    POSITION_FIELDS.forEach((position) => {
        draft[position] = sanitizeScore(draft[position]);
    });

    return true;
}

async function tryPlayerRequests(requests) {
    let lastError = new Error("The player request could not be completed.");

    for (const request of requests) {
        try {
            const response = await fetch(API_BASE_URL + request.path, request.options);

            if (response.ok) {
                const contentType = response.headers.get("content-type") || "";
                return contentType.includes("application/json") ? await response.json() : null;
            }

            const errorText = await response.text();
            lastError = new Error(errorText || ("Request failed with status " + response.status + "."));
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError;
}

async function loadPlayers() {
    setBusy(true);
    playerStatus.textContent = "Loading players...";

    try {
        const response = await fetch(API_BASE_URL + "/players");
        const data = await response.json();
        playerState.players = Array.isArray(data) ? data : (data.players || []);
        playerStatus.textContent = playerState.players.length ? "Players loaded." : "No players returned by the API.";
        renderPlayers();
    } catch (error) {
        console.error("Error loading players:", error);
        playerState.players = [];
        playerStatus.textContent = "Unable to load players.";
        renderPlayers();
    } finally {
        setBusy(false);
    }
}

async function createPlayer() {
    const draft = playerState.newPlayerDraft;

    if (!draft || !validateDraft(draft)) {
        renderPlayers();
        return;
    }

    setBusy(true);
    playerStatus.textContent = "Creating player...";

    try {
        await tryPlayerRequests([
            {
                path: "/add_player",
                options: {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(getPlayerPayload(draft))
                }
            }
        ]);

        resetNewPlayerState();
        await loadPlayers();
        playerStatus.textContent = "Player created.";
    } catch (error) {
        console.error("Error creating player:", error);
        playerStatus.textContent = "Unable to create player.";
    } finally {
        setBusy(false);
        renderPlayers();
    }
}

async function updatePlayer(playerId) {
    const draft = playerState.editDraft;
    const existingPlayer = playerState.players.find((player) => String(getPlayerId(player)) === playerId);

    if (!draft || !existingPlayer || !validateDraft(draft)) {
        renderPlayers();
        return;
    }

    setBusy(true);
    playerStatus.textContent = "Saving player...";

    try {
        const payload = getPlayerPayload(draft, existingPlayer.player_id ?? existingPlayer.id ?? playerId);

        await tryPlayerRequests([
            {
                path: "/edit_player",
                options: {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            }
        ]);

        resetEditingState();
        await loadPlayers();
        playerStatus.textContent = "Player updated.";
    } catch (error) {
        console.error("Error updating player:", error);
        playerStatus.textContent = "Unable to update player.";
    } finally {
        setBusy(false);
        renderPlayers();
    }
}

async function deletePlayer(playerId) {
    const existingPlayer = playerState.players.find((player) => String(getPlayerId(player)) === playerId);

    if (!existingPlayer) {
        return;
    }

    if (!window.confirm("Remove " + (existingPlayer.first_name || "this player") + " from the player list?")) {
        return;
    }

    setBusy(true);
    playerStatus.textContent = "Removing player...";

    try {
        await tryPlayerRequests([
            {
                path: "/delete_player/" + encodeURIComponent(playerId),
                options: { method: "DELETE" }
            }
        ]);

        resetEditingState();
        await loadPlayers();
        playerStatus.textContent = "Player removed.";
    } catch (error) {
        console.error("Error removing player:", error);
        playerStatus.textContent = "Unable to remove player.";
    } finally {
        setBusy(false);
        renderPlayers();
    }
}

addPlayerBtn.addEventListener("click", () => {
    resetEditingState();
    playerState.isAdding = true;
    playerState.newPlayerDraft = createEmptyDraft();
    playerStatus.textContent = "Enter the new player details, then save.";
    renderPlayers();
});

playerSearchInput.addEventListener("input", (event) => {
    playerState.searchTerm = event.target.value;
    renderPlayers();
});

playersTableBody.addEventListener("input", (event) => {
    const input = event.target.closest(".player-field-input");

    if (!input) {
        return;
    }

    const playerKey = input.getAttribute("data-player-key");
    const field = input.getAttribute("data-field");
    const nextValue = POSITION_FIELDS.includes(field)
        ? sanitizeScore(input.value)
        : input.value;

    if (playerKey === "new" && playerState.newPlayerDraft) {
        playerState.newPlayerDraft[field] = nextValue;
        if (input.type === "number") {
            input.value = String(nextValue);
        }
        return;
    }

    if (playerState.editDraft && playerState.editingPlayerId === playerKey) {
        playerState.editDraft[field] = nextValue;
        if (input.type === "number") {
            input.value = String(nextValue);
        }
    }
});

playersTableBody.addEventListener("click", (event) => {
    const editButton = event.target.closest(".edit-player-btn");
    const saveButton = event.target.closest(".save-player-btn");
    const cancelButton = event.target.closest(".cancel-player-btn");
    const deleteButton = event.target.closest(".delete-player-btn");

    if (editButton) {
        const playerId = editButton.getAttribute("data-player-id");
        const player = playerState.players.find((candidate) => String(getPlayerId(candidate)) === playerId);

        if (!player) {
            return;
        }

        resetNewPlayerState();
        playerState.editingPlayerId = playerId;
        playerState.editDraft = createDraftFromPlayer(player);
        playerStatus.textContent = "Editing " + (player.first_name || "player") + ".";
        renderPlayers();
        return;
    }

    if (saveButton) {
        const playerKey = saveButton.getAttribute("data-player-key");

        if (playerKey === "new") {
            createPlayer();
            return;
        }

        updatePlayer(playerKey);
        return;
    }

    if (cancelButton) {
        const playerKey = cancelButton.getAttribute("data-player-key");

        if (playerKey === "new") {
            resetNewPlayerState();
            playerStatus.textContent = "New player entry cancelled.";
        } else {
            resetEditingState();
            playerStatus.textContent = "Edit cancelled.";
        }

        renderPlayers();
        return;
    }

    if (deleteButton) {
        deletePlayer(deleteButton.getAttribute("data-player-id"));
    }
});

loadPlayers();

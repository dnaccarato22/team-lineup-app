const POSITION_FIELDS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const playerSearchInput = document.getElementById("playerSearchInput");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const playersTable = document.getElementById("playersTable");
const playersTableBody = document.getElementById("playersTableBody");
const playersMobileList = document.getElementById("playersMobileList");
const playerStatus = document.getElementById("playerStatus");
const playerSpinner = document.getElementById("player_spinner");
const playerSortHeaders = Array.from(document.querySelectorAll(".player-sort-header"));

const playerState = {
    players: [],
    searchTerm: "",
    editingPlayerId: null,
    editDraft: null,
    isAdding: false,
    newPlayerDraft: null,
    desktopSort: {
        position: null,
        direction: "desc"
    }
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

function compareText(leftValue, rightValue) {
    return String(leftValue || "").localeCompare(String(rightValue || ""), undefined, { sensitivity: "base" });
}

function getDesktopSortedPlayers(players) {
    const { position, direction } = playerState.desktopSort;

    if (!position) {
        return players.slice();
    }

    const directionMultiplier = direction === "asc" ? 1 : -1;

    return players
        .map((player, index) => ({ player, index }))
        .sort((leftEntry, rightEntry) => {
            const leftScore = getPositionValue(leftEntry.player, position);
            const rightScore = getPositionValue(rightEntry.player, position);
            const scoreComparison = (leftScore - rightScore) * directionMultiplier;

            if (scoreComparison !== 0) {
                return scoreComparison;
            }

            const lastNameComparison = compareText(leftEntry.player.last_name, rightEntry.player.last_name);

            if (lastNameComparison !== 0) {
                return lastNameComparison;
            }

            const firstNameComparison = compareText(leftEntry.player.first_name, rightEntry.player.first_name);

            if (firstNameComparison !== 0) {
                return firstNameComparison;
            }

            return leftEntry.index - rightEntry.index;
        })
        .map((entry) => entry.player);
}

function updateDesktopSortIndicators() {
    playerSortHeaders.forEach((header) => {
        const position = header.getAttribute("data-position");
        const button = header.querySelector(".player-sort-btn");
        const indicator = header.querySelector(".player-sort-indicator");
        const isActive = playerState.desktopSort.position === position;
        const sortDirection = isActive ? playerState.desktopSort.direction : "none";

        header.setAttribute(
            "aria-sort",
            sortDirection === "asc" ? "ascending" : (sortDirection === "desc" ? "descending" : "none")
        );

        if (button) {
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
            button.setAttribute(
                "aria-label",
                isActive
                    ? "Sort by " + position + " score, currently " + (sortDirection === "asc" ? "ascending" : "descending")
                    : "Sort by " + position + " score"
            );
        }

        if (indicator) {
            indicator.className = "fas player-sort-indicator " +
                (sortDirection === "asc" ? "fa-sort-up" : (sortDirection === "desc" ? "fa-sort-down" : "fa-sort"));
        }
    });
}

function toggleDesktopSort(position) {
    if (!POSITION_FIELDS.includes(position)) {
        return;
    }

    if (playerState.desktopSort.position === position) {
        playerState.desktopSort.direction = playerState.desktopSort.direction === "desc" ? "asc" : "desc";
    } else {
        playerState.desktopSort.position = position;
        playerState.desktopSort.direction = "desc";
    }

    renderPlayers();
}

function buildScoreOptions(selectedValue) {
    return Array.from({ length: 6 }, (_, score) => {
        const selectedAttribute = Number(selectedValue) === score ? ' selected' : "";
        return '<option value="' + score + '"' + selectedAttribute + ">" + score + "</option>";
    }).join("");
}

function renderValueCell(value) {
    return '<td class="text-center player-score-cell">' + escapeHtml(value) + "</td>";
}

function renderEditableCell(playerKey, fieldName, type, value) {
    const isScoreField = type === "number";
    const cellClass = isScoreField ? ' class="player-score-cell"' : "";
    const inputClass = isScoreField
        ? "form-control form-control-sm text-center player-score-input"
        : "form-control form-control-sm";
    const minAttr = isScoreField ? ' min="0" max="5" step="1" inputmode="numeric"' : "";

    return "<td" + cellClass + ">" +
        '<input type="' + type + '" class="' + inputClass + ' player-field-input" data-player-key="' + escapeHtml(playerKey) + '" data-field="' + escapeHtml(fieldName) + '" value="' + escapeHtml(value) + '"' + minAttr + ">" +
        "</td>";
}

function renderEditableRow(playerKey, draft, isNew) {
    const positionCells = POSITION_FIELDS.map((position) => renderEditableCell(playerKey, position, "number", draft[position])).join("");
    const actionButtons = isNew
        ? '<button type="button" class="btn btn-sm btn-success save-player-btn" data-player-key="new">Save</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-secondary cancel-player-btn" data-player-key="new">Cancel</button>'
        : '<button type="button" class="btn btn-sm btn-success save-player-btn" data-player-key="' + escapeHtml(playerKey) + '">Save</button> ' +
            '<button type="button" class="btn btn-sm btn-outline-secondary cancel-player-btn" data-player-key="' + escapeHtml(playerKey) + '">Cancel</button>';

    return "<tr>" +
        renderEditableCell(playerKey, "first_name", "text", draft.first_name) +
        renderEditableCell(playerKey, "last_name", "text", draft.last_name) +
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

function renderMobileScoreSummary(player) {
    return POSITION_FIELDS.map((position) => {
        return '<div class="player-mobile-score-item">' +
            '<span class="player-mobile-score-label">' + escapeHtml(position) + '</span>' +
            '<div class="player-mobile-score-value">' + escapeHtml(getPositionValue(player, position)) + "</div>" +
        "</div>";
    }).join("");
}

function renderMobileEditableScoreField(playerKey, position, value) {
    return '<div>' +
        '<label class="form-label player-mobile-score-label" for="mobile-' + escapeHtml(playerKey) + "-" + escapeHtml(position) + '">' + escapeHtml(position) + "</label>" +
        '<select id="mobile-' + escapeHtml(playerKey) + "-" + escapeHtml(position) + '" class="form-select player-field-input" data-player-key="' + escapeHtml(playerKey) + '" data-field="' + escapeHtml(position) + '">' +
            buildScoreOptions(value) +
        "</select>" +
    "</div>";
}

function renderMobileEditableCard(playerKey, draft, isNew) {
    const actionButtons = isNew
        ? '<button type="button" class="btn btn-success save-player-btn" data-player-key="new">Save Player</button>' +
            '<button type="button" class="btn btn-outline-secondary cancel-player-btn" data-player-key="new">Cancel</button>'
        : '<button type="button" class="btn btn-success save-player-btn" data-player-key="' + escapeHtml(playerKey) + '">Save Changes</button>' +
            '<button type="button" class="btn btn-outline-secondary cancel-player-btn" data-player-key="' + escapeHtml(playerKey) + '">Cancel</button>';

    return '<details class="player-mobile-card" open>' +
        '<summary class="player-mobile-header">' +
            "<div>" +
                '<h6 class="player-mobile-title mb-0">' + (isNew ? "Add Player" : "Edit Player") + "</h6>" +
                '<p class="player-mobile-subtitle">' + (isNew ? "Enter player details and set scores." : "Update names and position ratings.") + "</p>" +
            "</div>" +
            '<span class="player-mobile-toggle" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>' +
        "</summary>" +
        '<div class="player-mobile-content">' +
        '<div class="player-mobile-form-grid">' +
            '<div>' +
                '<label class="form-label" for="mobile-' + escapeHtml(playerKey) + '-first-name">First Name</label>' +
                '<input id="mobile-' + escapeHtml(playerKey) + '-first-name" type="text" class="form-control player-field-input" data-player-key="' + escapeHtml(playerKey) + '" data-field="first_name" value="' + escapeHtml(draft.first_name) + '">' +
            "</div>" +
            '<div>' +
                '<label class="form-label" for="mobile-' + escapeHtml(playerKey) + '-last-name">Last Name</label>' +
                '<input id="mobile-' + escapeHtml(playerKey) + '-last-name" type="text" class="form-control player-field-input" data-player-key="' + escapeHtml(playerKey) + '" data-field="last_name" value="' + escapeHtml(draft.last_name) + '">' +
            "</div>" +
        "</div>" +
        '<div class="player-mobile-score-form-grid">' +
            POSITION_FIELDS.map((position) => renderMobileEditableScoreField(playerKey, position, draft[position])).join("") +
        "</div>" +
        '<div class="player-mobile-actions">' + actionButtons + "</div>" +
        "</div>" +
    "</details>";
}

function renderMobileReadOnlyCard(player) {
    const playerId = String(getPlayerId(player));
    const fullName = ((player.first_name || "") + " " + (player.last_name || "")).trim() || "Unnamed Player";

    return '<details class="player-mobile-card">' +
        '<summary class="player-mobile-header">' +
            "<div>" +
                '<h6 class="player-mobile-title">' + escapeHtml(fullName) + "</h6>" +
                '<p class="player-mobile-subtitle">Tap to view scores and actions</p>' +
            "</div>" +
            '<span class="player-mobile-toggle" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>' +
        "</summary>" +
        '<div class="player-mobile-content">' +
        '<div class="player-mobile-score-grid">' + renderMobileScoreSummary(player) + "</div>" +
        '<div class="player-mobile-actions">' +
            '<button type="button" class="btn btn-outline-primary edit-player-btn" data-player-id="' + escapeHtml(playerId) + '">Edit</button>' +
            '<button type="button" class="btn btn-outline-danger delete-player-btn" data-player-id="' + escapeHtml(playerId) + '">Remove</button>' +
        "</div>" +
        "</div>" +
    "</details>";
}

function renderPlayers() {
    const filteredPlayers = getFilteredPlayers();
    const desktopPlayers = getDesktopSortedPlayers(filteredPlayers);
    const tableRows = [];
    const mobileCards = [];

    if (playerState.isAdding && playerState.newPlayerDraft) {
        tableRows.push(renderEditableRow("new", playerState.newPlayerDraft, true));
        mobileCards.push(renderMobileEditableCard("new", playerState.newPlayerDraft, true));
    }

    desktopPlayers.forEach((player) => {
        const playerId = String(getPlayerId(player));

        if (playerState.editingPlayerId === playerId && playerState.editDraft) {
            tableRows.push(renderEditableRow(playerId, playerState.editDraft, false));
            return;
        }

        tableRows.push(renderReadOnlyRow(player));
    });

    filteredPlayers.forEach((player) => {
        const playerId = String(getPlayerId(player));

        if (playerState.editingPlayerId === playerId && playerState.editDraft) {
            mobileCards.push(renderMobileEditableCard(playerId, playerState.editDraft, false));
            return;
        }

        mobileCards.push(renderMobileReadOnlyCard(player));
    });

    if (!tableRows.length) {
        playersTableBody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No players found.</td></tr>';
        playersMobileList.innerHTML = '<div class="player-mobile-empty">No players found.</div>';
        updateDesktopSortIndicators();
        return;
    }

    playersTableBody.innerHTML = tableRows.join("");
    playersMobileList.innerHTML = mobileCards.join("");
    updateDesktopSortIndicators();
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

async function tryPlayerRequests(requests, feedbackOptions) {
    let lastError = new Error("The player request could not be completed.");

    for (const request of requests) {
        try {
            const response = await apiRequest(request.path, request.options, request.feedbackOptions || feedbackOptions);

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
        const response = await apiRequest("/players");
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

function handlePlayerFieldInput(event) {
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

        if (input.tagName === "INPUT" && input.type === "number") {
            input.value = String(nextValue);
        }

        return;
    }

    if (playerState.editDraft && playerState.editingPlayerId === playerKey) {
        playerState.editDraft[field] = nextValue;

        if (input.tagName === "INPUT" && input.type === "number") {
            input.value = String(nextValue);
        }
    }
}

function handlePlayerActionClick(event) {
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
}

function handlePlayersTableClick(event) {
    const sortButton = event.target.closest(".player-sort-btn");

    if (!sortButton) {
        return;
    }

    toggleDesktopSort(sortButton.getAttribute("data-sort-position"));
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

[playersTableBody, playersMobileList].forEach((container) => {
    container.addEventListener("input", handlePlayerFieldInput);
    container.addEventListener("change", handlePlayerFieldInput);
    container.addEventListener("click", handlePlayerActionClick);
});

if (playersTable) {
    playersTable.addEventListener("click", handlePlayersTableClick);
}

loadPlayers();

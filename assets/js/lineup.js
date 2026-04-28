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
const gameDateInput = document.getElementById("gameDateInput");
const clearRosterBtn = document.getElementById("clearRosterBtn");
const generateLineupBtn = document.getElementById("generateLineupBtn");
const lineupEditControls = document.getElementById("lineupEditControls");
const saveLineupBtn = document.getElementById("saveLineupBtn");
const cancelLineupEditsBtn = document.getElementById("cancelLineupEditsBtn");
const downloadLineupBtn = document.getElementById("downloadLineupBtn");
const lineupResult = document.getElementById("lineupResult");
const lineupStatus = document.getElementById("lineupStatus");
const lineupValidationMessage = document.getElementById("lineupValidationMessage");
const generatedLineupSection = document.getElementById("generatedLineupSection");
const availabilityModalElement = document.getElementById("availabilityModal");
const availabilityModalSubtitle = document.getElementById("availabilityModalSubtitle");
const availabilityCheckboxes = document.getElementById("availabilityCheckboxes");
const saveAvailabilityBtn = document.getElementById("saveAvailabilityBtn");
const pitchingModalElement = document.getElementById("pitchingModal");
const pitchingModalSubtitle = document.getElementById("pitchingModalSubtitle");
const pitchingOptions = document.getElementById("pitchingOptions");
const savePitchingBtn = document.getElementById("savePitchingBtn");
const LINEUP_PAGE_STATE_KEY = window.APP_SESSION_KEYS?.lineupPageState || "lineupPageState";

// All possible positions plus // for when a player is on the bench
const LINEUP_POSITIONS = ["//", "P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const FULL_GAME_INNINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PITCHING_PREFERENCES = [
    { value: "default", label: "Default" },
    { value: "not_eligible", label: "Should NOT Pitch" },
    { value: "required", label: "Should Pitch" }
];
const LINEUP_GENERATE_MESSAGES = [
    "Running smart lineup generation...",
    "Reviewing the roster and position preferences...",
    "Determing pitcher and catcher assignments...",
    "Balancing innings, positions, and batting order...",
    "Validating inning availability and position eligibility...",
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
    "...............⚾",
];

const lineupState = {
    currentLineup: null,
    draftLineup: null,
    isEditing: false,
    hasUnsavedChanges: false,
    draggedPlayerId: null,
    availabilityPlayerId: null,
    pitchingPlayerId: null,
    touchDragActive: false,
    validationStatus: "idle",
    validationMessage: "",
    invalidSpotKeys: new Set(),
    lastValidationRequestToken: 0,
    pendingValidationRequests: 0
};

const availabilityModal = availabilityModalElement ? new bootstrap.Modal(availabilityModalElement) : null;
const pitchingModal = pitchingModalElement ? new bootstrap.Modal(pitchingModalElement) : null;

function getSettings() {
    return window.AppSettings?.getSettings ? window.AppSettings.getSettings() : fallbackSettings;
}

function getPlayerId(player) {
    return player.player_id ?? player.id;
}

function getLineupId(lineup) {
    return lineup?.lineup_id ?? lineup?.id ?? null;
}

function getLineupSpotKey(playerId, inning) {
    return String(playerId) + ":" + String(inning);
}

function normalizeAvailableInnings(value) {
    const innings = Array.isArray(value) ? value : FULL_GAME_INNINGS;

    return [...new Set(innings
        .map((inning) => Number.parseInt(inning, 10))
        .filter((inning) => FULL_GAME_INNINGS.includes(inning)))]
        .sort((firstInning, secondInning) => firstInning - secondInning);
}

function getUpcomingSaturdayDateValue() {
    const today = new Date();
    const nextSaturday = new Date(today);
    const daysUntilSaturday = (6 - today.getDay() + 7) % 7;

    nextSaturday.setDate(today.getDate() + daysUntilSaturday);
    nextSaturday.setHours(0, 0, 0, 0);
    return nextSaturday.toISOString().slice(0, 10);
}

function getCurrentGameDate() {
    return gameDateInput?.value || getUpcomingSaturdayDateValue();
}

function setCurrentGameDate(value) {
    if (!gameDateInput) {
        return;
    }

    gameDateInput.value = value || getUpcomingSaturdayDateValue();
}

function updatePlayerSearchPlaceholder() {
    if (!playerSearch) {
        return;
    }

    const isMobileView = window.matchMedia("(max-width: 767.98px)").matches;
    playerSearch.placeholder = isMobileView
        ? (playerSearch.dataset.mobilePlaceholder || "Add player to this game")
        : (playerSearch.dataset.desktopPlaceholder || "Select a player to add to this game");
}

function getPrintableGameDateLabel(value) {
    if (!value) {
        return "";
    }

    const parsedDate = new Date(value + "T00:00:00");

    if (Number.isNaN(parsedDate.getTime())) {
        return value;
    }

    return parsedDate.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric"
    });
}

function getPlayerAvailableInnings(player) {
    const innings = normalizeAvailableInnings(player?.available_innings);
    return innings.length ? innings : FULL_GAME_INNINGS.slice();
}

function normalizePitchingEligibility(value) {
    if (value === true || value === false) {
        return value;
    }

    return null;
}

function getPlayerPitchingEligibility(player) {
    return normalizePitchingEligibility(player?.is_pitching);
}

function cloneRosterPlayer(player, availableInnings) {
    return {
        ...player,
        player_id: getPlayerId(player),
        available_innings: getPlayerAvailableInnings({
            available_innings: availableInnings ?? player?.available_innings
        }),
        is_pitching: getPlayerPitchingEligibility({
            is_pitching: player?.is_pitching
        })
    };
}

function getPlayerObject(player) {
    return {
        player_id: getPlayerId(player),
        available_innings: getPlayerAvailableInnings(player),
        is_pitching: getPlayerPitchingEligibility(player)
    };
}

function getAvailabilitySummary(player) {
    return getPlayerAvailableInnings(player).length === FULL_GAME_INNINGS.length ? "Full Game" : "Partial";
}

function getPitchingSummary(player) {
    const pitchingEligibility = getPlayerPitchingEligibility(player);

    if (pitchingEligibility === true) {
        return "Pitching";
    }

    if (pitchingEligibility === false) {
        return "Not Pitching";
    }

    return "Default";
}

function getPitchingSummaryClass(player) {
    const pitchingEligibility = getPlayerPitchingEligibility(player);

    if (pitchingEligibility === true) {
        return "lineup-pitching-summary is-required";
    }

    if (pitchingEligibility === false) {
        return "lineup-pitching-summary is-blocked";
    }

    return "lineup-pitching-summary";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

function persistLineupPageState() {
    const nextState = {
        gameDate: getCurrentGameDate(),
        selectedPlayers: rosterState.selectedPlayers.map((player) => ({
            player_id: String(getPlayerId(player)),
            available_innings: getPlayerAvailableInnings(player),
            is_pitching: getPlayerPitchingEligibility(player)
        })),
        currentLineup: lineupState.currentLineup ? cloneData(lineupState.currentLineup) : null
    };

    try {
        sessionStorage.setItem(LINEUP_PAGE_STATE_KEY, JSON.stringify(nextState));
    } catch (error) {
        console.debug("Unable to persist lineup page state:", error);
    }
}

function getPersistedLineupPageState() {
    try {
        const rawState = sessionStorage.getItem(LINEUP_PAGE_STATE_KEY);
        return rawState ? JSON.parse(rawState) : null;
    } catch (error) {
        console.debug("Unable to read lineup page state:", error);
        return null;
    }
}

function resolveSelectedPlayers(playerIds, lineup) {
    const fallbackPlayers = Array.isArray(lineup?.players) ? lineup.players : [];

    return playerIds.map((playerId) => {
        return rosterState.allPlayers.find((player) => String(getPlayerId(player)) === String(playerId))
            || fallbackPlayers.find((player) => String(getPlayerId(player)) === String(playerId));
    }).filter(Boolean);
}

function resolveRosterEntries(playerEntries, lineup) {
    const fallbackPlayers = Array.isArray(lineup?.players) ? lineup.players : [];

    return playerEntries.map((entry) => {
        const playerId = String(entry.player_id ?? entry.id ?? "");
        const matchingPlayer = rosterState.allPlayers.find((player) => String(getPlayerId(player)) === playerId)
            || fallbackPlayers.find((player) => String(getPlayerId(player)) === playerId);

        if (!matchingPlayer) {
            return null;
        }

        return {
            ...cloneRosterPlayer(matchingPlayer, entry.available_innings),
            is_pitching: getPlayerPitchingEligibility(entry)
        };
    }).filter(Boolean);
}

function resetRenderedLineupState() {
    lineupState.currentLineup = null;
    lineupState.draftLineup = null;
    lineupState.isEditing = false;
    lineupState.hasUnsavedChanges = false;
    lineupState.draggedPlayerId = null;
    resetLineupValidationState();
    lineupResult.innerHTML = '<div class="text-muted">Generate a lineup to see results.</div>';
    setLineupActionState();
}

function restorePersistedLineupPageState(savedState) {
    if (!savedState) {
        return false;
    }

    const savedLineup = savedState.currentLineup ? normalizeLineupPayload(cloneData(savedState.currentLineup)) : null;
    const savedPlayers = Array.isArray(savedState.selectedPlayers) ? savedState.selectedPlayers : [];
    const lineupPlayers = Array.isArray(savedLineup?.players)
        ? savedLineup.players.map((player) => ({
            player_id: String(getPlayerId(player)),
            available_innings: getPlayerAvailableInnings(player),
            is_pitching: getPlayerPitchingEligibility(player)
        }))
        : [];

    setCurrentGameDate(savedState.gameDate);
    rosterState.selectedPlayers = resolveRosterEntries(savedPlayers.length ? savedPlayers : lineupPlayers, savedLineup);
    renderRoster();
    renderPlayerOptions();

    if (savedLineup) {
        renderGeneratedLineup(savedLineup);
    } else {
        resetRenderedLineupState();
    }

    saveRememberedRoster();
    return true;
}

async function loadLatestLineup() {
    return window.getAppDataResource
        ? await window.getAppDataResource("latestLineup")
        : null;
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

function cloneData(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

function getLineupSource() {
    return lineupState.isEditing && lineupState.draftLineup
        ? lineupState.draftLineup
        : lineupState.currentLineup;
}

function getBattingOrder(player, fallbackOrder) {
    const battingOrder = Number.parseInt(player?.batting_order, 10);
    return Number.isNaN(battingOrder) ? fallbackOrder : battingOrder;
}

function normalizeLineupPayload(lineup) {
    if (!lineup || !Array.isArray(lineup.players)) {
        return lineup;
    }

    lineup.players = [...lineup.players]
        .sort((firstPlayer, secondPlayer) => {
            return getBattingOrder(firstPlayer, Number.MAX_SAFE_INTEGER) - getBattingOrder(secondPlayer, Number.MAX_SAFE_INTEGER);
        })
        .map((player, index) => {
            player.batting_order = index + 1;

            if (Array.isArray(player.innings)) {
                player.innings = [...player.innings].sort((firstInning, secondInning) => firstInning.inning - secondInning.inning);
            }

            return player;
        });

    return lineup;
}

function normalizeLineupPositionValue(value) {
    return String(value ?? "").trim().toUpperCase();
}

function getEditingLineupStatusMessage() {
    return "Editing lineup. Update positions or drag rows to change batting order, then save once validation passes.";
}

function resetLineupValidationState() {
    lineupState.validationStatus = "idle";
    lineupState.validationMessage = "";
    lineupState.invalidSpotKeys = new Set();
    lineupState.lastValidationRequestToken = 0;
    lineupState.pendingValidationRequests = 0;
    renderLineupValidationMessage();
    applyRenderedInvalidSpots();
}

function renderLineupValidationMessage() {
    if (!lineupValidationMessage) {
        return;
    }

    const shouldShowMessage = Boolean(lineupState.validationMessage)
        && (lineupState.validationStatus === "invalid" || lineupState.validationStatus === "error");

    lineupValidationMessage.textContent = shouldShowMessage ? lineupState.validationMessage : "";
    lineupValidationMessage.classList.toggle("d-none", !shouldShowMessage);
}

function applyRenderedInvalidSpots() {
    lineupResult.querySelectorAll("[data-lineup-cell-player-id][data-lineup-cell-inning]").forEach((cell) => {
        const playerId = cell.getAttribute("data-lineup-cell-player-id");
        const inning = cell.getAttribute("data-lineup-cell-inning");
        const isInvalid = lineupState.invalidSpotKeys.has(getLineupSpotKey(playerId, inning));

        cell.classList.toggle("is-invalid", isInvalid);
    });
}

function setLineupValidationResult(result) {
    const invalidSpots = Array.isArray(result?.invalid_spots) ? result.invalid_spots : [];

    lineupState.validationStatus = result?.is_valid ? "valid" : "invalid";
    lineupState.validationMessage = result?.is_valid ? "" : String(result?.message || "One or more lineup changes are invalid.");
    lineupState.invalidSpotKeys = new Set(invalidSpots.map((spot) => {
        return getLineupSpotKey(spot.player_id, spot.inning);
    }));
    renderLineupValidationMessage();
    applyRenderedInvalidSpots();
}

function setLineupValidationPending() {
    lineupState.validationStatus = "pending";
    lineupState.validationMessage = "";
    lineupState.invalidSpotKeys = new Set();
    renderLineupValidationMessage();
    applyRenderedInvalidSpots();
}

function setLineupValidationError(message) {
    lineupState.validationStatus = "error";
    lineupState.validationMessage = message || "Unable to validate this lineup change right now.";
    lineupState.invalidSpotKeys = new Set();
    renderLineupValidationMessage();
    applyRenderedInvalidSpots();
}

function getDraftLineupPlayer(playerId) {
    if (!lineupState.draftLineup || !Array.isArray(lineupState.draftLineup.players)) {
        return null;
    }

    return lineupState.draftLineup.players.find((candidate) => String(getPlayerId(candidate)) === String(playerId)) || null;
}

function buildPlayerInningPositionMap(player) {
    const innings = Array.isArray(player?.innings) ? player.innings : [];

    return new Map(innings.map((inningEntry) => {
        return [Number.parseInt(inningEntry.inning, 10), normalizeLineupPositionValue(inningEntry.position) || "--"];
    }));
}

function getUnsavedLineupPositionChanges() {
    if (!lineupState.currentLineup || !lineupState.draftLineup) {
        return [];
    }

    const currentPlayers = Array.isArray(lineupState.currentLineup.players) ? lineupState.currentLineup.players : [];
    const draftPlayers = Array.isArray(lineupState.draftLineup.players) ? lineupState.draftLineup.players : [];
    const currentPlayersById = new Map(currentPlayers.map((player) => [String(getPlayerId(player)), player]));

    return draftPlayers.flatMap((draftPlayer) => {
        const playerId = String(getPlayerId(draftPlayer));
        const currentPlayer = currentPlayersById.get(playerId);
        const currentPositions = buildPlayerInningPositionMap(currentPlayer);
        const draftPositions = buildPlayerInningPositionMap(draftPlayer);
        const inningNumbers = new Set([...currentPositions.keys(), ...draftPositions.keys()]);

        return Array.from(inningNumbers)
            .sort((firstInning, secondInning) => firstInning - secondInning)
            .flatMap((inningNumber) => {
                const currentPosition = currentPositions.get(inningNumber) || "--";
                const draftPosition = draftPositions.get(inningNumber) || "--";

                if (currentPosition === draftPosition) {
                    return [];
                }

                return [{
                    player_id: playerId,
                    inning: inningNumber,
                    position: draftPosition
                }];
            });
    });
}

function hasDraftLineupChanges() {
    if (!lineupState.currentLineup || !lineupState.draftLineup) {
        return false;
    }

    const currentPlayers = Array.isArray(lineupState.currentLineup.players) ? lineupState.currentLineup.players : [];
    const draftPlayers = Array.isArray(lineupState.draftLineup.players) ? lineupState.draftLineup.players : [];

    if (currentPlayers.length !== draftPlayers.length) {
        return true;
    }

    return draftPlayers.some((draftPlayer, index) => {
        const currentPlayer = currentPlayers[index];

        if (!currentPlayer) {
            return true;
        }

        if (String(getPlayerId(draftPlayer)) !== String(getPlayerId(currentPlayer))) {
            return true;
        }

        if (Number.parseInt(draftPlayer?.batting_order, 10) !== Number.parseInt(currentPlayer?.batting_order, 10)) {
            return true;
        }

        const currentPositions = buildPlayerInningPositionMap(currentPlayer);
        const draftPositions = buildPlayerInningPositionMap(draftPlayer);
        const inningNumbers = new Set([...currentPositions.keys(), ...draftPositions.keys()]);

        return Array.from(inningNumbers).some((inningNumber) => {
            return (currentPositions.get(inningNumber) || "--") !== (draftPositions.get(inningNumber) || "--");
        });
    });
}

function upsertDraftLineupPosition(playerId, inningNumber, position) {
    const player = getDraftLineupPlayer(playerId);

    if (!player) {
        return false;
    }

    const innings = Array.isArray(player.innings) ? player.innings : [];
    const inningEntry = innings.find((candidate) => candidate.inning === inningNumber);

    if (inningEntry) {
        inningEntry.position = position;
    } else {
        innings.push({ inning: inningNumber, position });
        innings.sort((firstEntry, secondEntry) => firstEntry.inning - secondEntry.inning);
        player.innings = innings;
    }

    return true;
}

function setLineupActionState() {
    const hasLineup = Boolean(lineupState.currentLineup && Array.isArray(lineupState.currentLineup.players) && lineupState.currentLineup.players.length);
    const hasBlockingValidationState = lineupState.validationStatus === "pending"
        || lineupState.validationStatus === "invalid"
        || lineupState.validationStatus === "error";

    saveLineupBtn.disabled = !lineupState.isEditing
        || !lineupState.draftLineup
        || !lineupState.hasUnsavedChanges
        || hasBlockingValidationState;
    lineupEditControls.classList.toggle("d-none", !lineupState.isEditing);
    downloadLineupBtn.disabled = !hasLineup || lineupState.isEditing;
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

    playerSelect.innerHTML = '<option value="">Add player to this game</option>' + availablePlayers.map((player) => {
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

    rosterState.selectedPlayers.push(cloneRosterPlayer(player));
    rosterState.searchTerm = "";
    playerSearch.value = "";
    playerSelect.value = "";
    renderRoster();
    renderPlayerOptions();
    saveRememberedRoster();
    persistLineupPageState();
    lineupStatus.textContent = getPlayerName(player) + " added to the roster.";
}

function renderRoster() {
    if (!rosterState.selectedPlayers.length) {
        rosterTableBody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">No players added yet.</td></tr>';
        rosterMobileList.innerHTML = '<div class="lineup-mobile-empty">No players added yet.</div>';
        return;
    }

    rosterTableBody.innerHTML = rosterState.selectedPlayers.map((player) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");
        const availabilitySummary = getAvailabilitySummary(player);
        const summaryClass = availabilitySummary === "Full Game"
            ? "lineup-availability-summary"
            : "lineup-availability-summary is-partial";
        const pitchingSummary = getPitchingSummary(player);
        const pitchingSummaryClass = getPitchingSummaryClass(player);

        return '<tr>' +
            '<td>' + getPlayerName(player) + '</td>' +
            '<td><span class="' + summaryClass + '">' + availabilitySummary + '</span></td>' +
            '<td><span class="' + pitchingSummaryClass + '">' + pitchingSummary + '</span></td>' +
            '<td class="text-end text-nowrap">' +
                '<button type="button" class="btn btn-sm btn-outline-primary edit-availability-btn" data-player-id="' + playerId + '">Edit Innings</button> ' +
                '<button type="button" class="btn btn-sm btn-outline-secondary edit-pitching-btn" data-player-id="' + playerId + '">Edit Pitching</button> ' +
                '<button type="button" class="btn btn-sm btn-outline-danger remove-player-btn" data-player-id="' + playerId + '">Remove</button>' +
            '</td>' +
        '</tr>';
    }).join("");

    rosterMobileList.innerHTML = rosterState.selectedPlayers.map((player) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");
        const availabilitySummary = getAvailabilitySummary(player);
        const pitchingSummary = getPitchingSummary(player);

        return '<div class="lineup-mobile-roster-card">' +
            '<div class="lineup-mobile-roster-header">' +
                '<div>' +
                    '<h6 class="lineup-mobile-player-name">' + getPlayerName(player) + '</h6>' +
                    '<p class="lineup-mobile-player-subtitle">Innings: ' + availabilitySummary + '</p>' +
                    '<p class="lineup-mobile-player-subtitle">Pitching Eligibility: ' + pitchingSummary + '</p>' +
                '</div>' +
            '</div>' +
            '<div class="lineup-mobile-roster-actions">' +
                '<button type="button" class="btn btn-sm btn-outline-primary edit-availability-btn" data-player-id="' + playerId + '">Edit Innings</button>' +
                '<button type="button" class="btn btn-sm btn-outline-secondary edit-pitching-btn" data-player-id="' + playerId + '">Edit Pitching</button>' +
                '<button type="button" class="btn btn-sm btn-outline-danger remove-player-btn" data-player-id="' + playerId + '">Remove</button>' +
            '</div>' +
        '</div>';
    }).join("");
}

function renderAvailabilityModal(player) {
    if (!player || !availabilityCheckboxes) {
        return;
    }

    const availableInnings = getPlayerAvailableInnings(player);
    availabilityModalSubtitle.textContent = getPlayerName(player, "full");
    availabilityCheckboxes.innerHTML = FULL_GAME_INNINGS.map((inningNumber) => {
        const isSelected = availableInnings.includes(inningNumber);
        const selectedClass = isSelected ? " is-selected" : "";
        const pressedState = isSelected ? "true" : "false";

        return '<button type="button" class="lineup-availability-option' + selectedClass + '" data-inning="' + inningNumber + '" aria-pressed="' + pressedState + '">' +
            "Inning " + inningNumber +
        '</button>';
    }).join("");
}

function openAvailabilityModal(playerId) {
    const player = rosterState.selectedPlayers.find((candidate) => String(getPlayerId(candidate)) === String(playerId));

    if (!player || !availabilityModal) {
        return;
    }

    lineupState.availabilityPlayerId = String(playerId);
    renderAvailabilityModal(player);
    availabilityModal.show();
}

function renderPitchingModal(player) {
    if (!player || !pitchingOptions) {
        return;
    }

    const pitchingEligibility = getPlayerPitchingEligibility(player);
    pitchingModalSubtitle.textContent = getPlayerName(player, "full");
    pitchingOptions.innerHTML = PITCHING_PREFERENCES.map((option) => {
        const isSelected = (option.value === "default" && pitchingEligibility === null)
            || (option.value === "not_eligible" && pitchingEligibility === false)
            || (option.value === "required" && pitchingEligibility === true);
        const selectedClass = isSelected ? " is-selected" : "";
        const pressedState = isSelected ? "true" : "false";

        return '<button type="button" class="lineup-pitching-option' + selectedClass + '" data-pitching-value="' + option.value + '" aria-pressed="' + pressedState + '">' +
            option.label +
        '</button>';
    }).join("");
}

function openPitchingModal(playerId) {
    const player = rosterState.selectedPlayers.find((candidate) => String(getPlayerId(candidate)) === String(playerId));

    if (!player || !pitchingModal) {
        return;
    }

    lineupState.pitchingPlayerId = String(playerId);
    renderPitchingModal(player);
    pitchingModal.show();
}

function saveAvailabilityChanges() {
    if (!lineupState.availabilityPlayerId) {
        return;
    }

    const selectedInnings = Array.from(availabilityCheckboxes.querySelectorAll(".lineup-availability-option.is-selected"))
        .map((option) => Number.parseInt(option.getAttribute("data-inning"), 10))
        .filter((inning) => FULL_GAME_INNINGS.includes(inning))
        .sort((firstInning, secondInning) => firstInning - secondInning);

    if (!selectedInnings.length) {
        lineupStatus.textContent = "Select at least one available inning for the player.";
        return;
    }

    rosterState.selectedPlayers = rosterState.selectedPlayers.map((player) => {
        if (String(getPlayerId(player)) !== lineupState.availabilityPlayerId) {
            return player;
        }

        return {
            ...player,
            available_innings: selectedInnings
        };
    });

    renderRoster();
    saveRememberedRoster();
    persistLineupPageState();
    availabilityModal.hide();
    lineupStatus.textContent = "Player inning availability updated.";
}

function savePitchingChanges() {
    if (!lineupState.pitchingPlayerId) {
        return;
    }

    const selectedOption = pitchingOptions?.querySelector(".lineup-pitching-option.is-selected");

    if (!selectedOption) {
        lineupStatus.textContent = "Select a pitching eligibility option for the player.";
        return;
    }

    const selectedValue = selectedOption.getAttribute("data-pitching-value");
    const nextPitchingValue = selectedValue === "required"
        ? true
        : selectedValue === "not_eligible"
            ? false
            : null;

    rosterState.selectedPlayers = rosterState.selectedPlayers.map((player) => {
        if (String(getPlayerId(player)) !== lineupState.pitchingPlayerId) {
            return player;
        }

        return {
            ...player,
            is_pitching: nextPitchingValue
        };
    });

    renderRoster();
    saveRememberedRoster();
    persistLineupPageState();
    pitchingModal.hide();
    lineupStatus.textContent = "Player pitching eligibility updated.";
}

function toggleAvailabilityOption(event) {
    const option = event.target.closest(".lineup-availability-option");

    if (!option) {
        return;
    }

    option.classList.toggle("is-selected");
    option.setAttribute("aria-pressed", option.classList.contains("is-selected") ? "true" : "false");
}

function togglePitchingOption(event) {
    const option = event.target.closest(".lineup-pitching-option");

    if (!option || !pitchingOptions) {
        return;
    }

    pitchingOptions.querySelectorAll(".lineup-pitching-option").forEach((candidate) => {
        const isSelected = candidate === option;
        candidate.classList.toggle("is-selected", isSelected);
        candidate.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
}

function renderGeneratedLineup(lineup) {
    if (lineup) {
        lineupState.currentLineup = normalizeLineupPayload(cloneData(lineup));
    }

    const lineupSource = getLineupSource();
    const players = Array.isArray(lineupSource?.players) ? lineupSource.players : [];

    if (!players.length) {
        lineupState.currentLineup = null;
        lineupState.draftLineup = null;
        lineupState.isEditing = false;
        lineupState.hasUnsavedChanges = false;
        resetLineupValidationState();
        lineupResult.innerHTML = '<div class="text-muted">No lineup data was returned.</div>';
        setLineupActionState();
        return;
    }

    const inningNumbers = Array.from({ length: getSettings().inningsToDisplay }, (_, index) => index + 1);
    const lineupRows = players.map((player, index) => {
        const playerId = String(getPlayerId(player)).replace(/"/g, "&quot;");
        const inningMap = new Map((player.innings || []).map((inningEntry) => [inningEntry.inning, inningEntry.position]));
        const inningCells = inningNumbers.map((inningNumber) => {
            const position = inningMap.get(inningNumber) || "--";
            const invalidClass = lineupState.invalidSpotKeys.has(getLineupSpotKey(getPlayerId(player), inningNumber))
                ? " is-invalid"
                : "";

            if (lineupState.isEditing) {
                return '<td class="lineup-position-cell' + invalidClass + '" data-lineup-cell-player-id="' + playerId + '" data-lineup-cell-inning="' + inningNumber + '">' +
                    '<input type="text" maxlength="2" inputmode="text" enterkeyhint="done" list="lineupPositionSuggestions" class="form-control form-control-sm lineup-position-input text-center" data-player-id="' + playerId + '" data-inning="' + inningNumber + '" data-committed-position="' + escapeHtml(position) + '" value="' + escapeHtml(position) + '">' +
                "</td>";
            }

            return '<td class="text-center lineup-position-cell" data-lineup-cell-player-id="' + playerId + '" data-lineup-cell-inning="' + inningNumber + '">' + position + '</td>';
        }).join("");

        const rowAttributes = lineupState.isEditing
            ? ' class="lineup-edit-row" draggable="true" data-player-id="' + playerId + '"'
            : "";

        const playerCellContent = lineupState.isEditing
            ? '<span class="text-muted lineup-drag-handle" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>' + getPlayerName(player, getSettings().lineupNameFormat)
            : getPlayerName(player, getSettings().lineupNameFormat);

        return '<tr' + rowAttributes + '><td class="fw-semibold text-nowrap lineup-player-cell">' + playerCellContent + '</td>' + inningCells + '</tr>';
    }).join("");

    lineupResult.innerHTML =
        '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">' +
            '<div><h6 class="mb-1">Lineup</h6></div>' +
            (lineupState.isEditing
                ? '<div class="text-muted small">Editing lineup</div>'
                : '<button type="button" class="btn btn-outline-secondary btn-sm" id="editLineupInlineBtn">Edit Lineup</button>') +
        '</div>' +
        '<div class="table-responsive">' +
            '<table class="table table-bordered table-striped align-middle mb-0">' +
                '<thead>' +
                    '<tr>' +
                        '<th class="text-nowrap lineup-player-cell">Player</th>' +
                        inningNumbers.map((inningNumber) => '<th class="text-center">' + inningNumber + '</th>').join("") +
                    '</tr>' +
                '</thead>' +
                '<tbody>' + lineupRows + '</tbody>' +
            '</table>' +
        '</div>';
    renderLineupValidationMessage();
    applyRenderedInvalidSpots();
    setLineupActionState();
}

function beginLineupEdit() {
    if (!lineupState.currentLineup) {
        return;
    }

    lineupState.draftLineup = normalizeLineupPayload(cloneData(lineupState.currentLineup));
    lineupState.isEditing = true;
    lineupState.hasUnsavedChanges = false;
    lineupState.draggedPlayerId = null;
    resetLineupValidationState();
    renderGeneratedLineup();
    lineupStatus.textContent = getEditingLineupStatusMessage();
}

function cancelLineupEdit() {
    lineupState.draftLineup = null;
    lineupState.isEditing = false;
    lineupState.hasUnsavedChanges = false;
    lineupState.draggedPlayerId = null;
    resetLineupValidationState();
    renderGeneratedLineup();
    lineupStatus.textContent = "Lineup edits discarded.";
}

function reorderDraftLineupPlayers(draggedPlayerId, targetPlayerId, placeAfter) {
    if (!lineupState.draftLineup || !Array.isArray(lineupState.draftLineup.players) || !draggedPlayerId || !targetPlayerId || draggedPlayerId === targetPlayerId) {
        return false;
    }

    const players = [...lineupState.draftLineup.players];
    const draggedIndex = players.findIndex((player) => String(getPlayerId(player)) === draggedPlayerId);
    const targetIndex = players.findIndex((player) => String(getPlayerId(player)) === targetPlayerId);

    if (draggedIndex === -1 || targetIndex === -1) {
        return false;
    }

    const [draggedPlayer] = players.splice(draggedIndex, 1);
    let nextIndex = targetIndex;

    if (draggedIndex < targetIndex) {
        nextIndex -= 1;
    }

    if (placeAfter) {
        nextIndex += 1;
    }

    players.splice(nextIndex, 0, draggedPlayer);
    lineupState.draftLineup.players = players.map((player, index) => {
        player.batting_order = index + 1;
        return player;
    });
    return true;
}

function clearLineupDropTargets() {
    lineupResult.querySelectorAll(".lineup-edit-row").forEach((row) => {
        row.classList.remove("lineup-drop-target", "lineup-drop-after", "dragging");
        row.removeAttribute("data-drop-placement");
    });
}

function getDropPlacement(targetRow, clientY) {
    const rowBounds = targetRow.getBoundingClientRect();
    return clientY > rowBounds.top + (rowBounds.height / 2) ? "after" : "before";
}

function updateDraggedRowState(targetRow, clientY) {
    if (!targetRow || !lineupState.isEditing || !lineupState.draggedPlayerId) {
        return false;
    }

    const targetPlayerId = targetRow.getAttribute("data-player-id");

    if (targetPlayerId === lineupState.draggedPlayerId) {
        clearLineupDropTargets();
        targetRow.classList.add("dragging");
        return false;
    }

    const dropPlacement = getDropPlacement(targetRow, clientY);
    clearLineupDropTargets();
    targetRow.classList.add("lineup-drop-target");
    targetRow.classList.toggle("lineup-drop-after", dropPlacement === "after");
    targetRow.setAttribute("data-drop-placement", dropPlacement);

    const draggedRow = lineupResult.querySelector('.lineup-edit-row[data-player-id="' + lineupState.draggedPlayerId + '"]');

    if (draggedRow) {
        draggedRow.classList.add("dragging");
    }

    return true;
}

function finishDraggedRowReorder(targetRow) {
    if (!targetRow || !lineupState.isEditing || !lineupState.draggedPlayerId) {
        lineupState.draggedPlayerId = null;
        lineupState.touchDragActive = false;
        clearLineupDropTargets();
        return false;
    }

    const targetPlayerId = targetRow.getAttribute("data-player-id");
    const placeAfter = targetRow.getAttribute("data-drop-placement") === "after";
    const didReorder = reorderDraftLineupPlayers(lineupState.draggedPlayerId, targetPlayerId, placeAfter);

    lineupState.draggedPlayerId = null;
    lineupState.touchDragActive = false;
    clearLineupDropTargets();

    if (!didReorder) {
        return false;
    }

    lineupState.hasUnsavedChanges = hasDraftLineupChanges();
    renderGeneratedLineup();
    lineupStatus.textContent = getEditingLineupStatusMessage();
    return true;
}

async function validateEditedLineupPosition() {
    const lineupId = getLineupId(lineupState.currentLineup) || getLineupId(lineupState.draftLineup);

    if (!lineupId) {
        setLineupValidationError("This lineup cannot be validated because it is missing a lineup ID.");
        setLineupActionState();
        return false;
    }

    const unsavedPositionChanges = getUnsavedLineupPositionChanges();

    if (!unsavedPositionChanges.length) {
        resetLineupValidationState();
        setLineupActionState();
        return true;
    }

    const requestToken = lineupState.lastValidationRequestToken + 1;

    lineupState.lastValidationRequestToken = requestToken;
    lineupState.pendingValidationRequests += 1;
    setLineupValidationPending();
    setLineupActionState();

    try {
        const response = await apiRequest("/lineup/" + encodeURIComponent(lineupId) + "/validate_position", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(unsavedPositionChanges)
        }, {
            showSlowOverlay: false
        });

        let payload = null;

        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (requestToken !== lineupState.lastValidationRequestToken) {
            return false;
        }

        if (!response.ok) {
            setLineupValidationError(payload?.message || "Unable to validate this lineup change right now.");
            return false;
        }

        setLineupValidationResult(payload || {});
        return lineupState.validationStatus === "valid";
    } catch (error) {
        console.error("Error validating lineup position:", error);

        if (requestToken === lineupState.lastValidationRequestToken) {
            setLineupValidationError("Unable to validate this lineup change right now.");
        }

        return false;
    } finally {
        lineupState.pendingValidationRequests = Math.max(0, lineupState.pendingValidationRequests - 1);

        if (requestToken === lineupState.lastValidationRequestToken) {
            setLineupActionState();
        }
    }
}

async function saveEditedLineup() {
    if (!lineupState.isEditing || !lineupState.draftLineup) {
        return;
    }

    saveLineupBtn.disabled = true;
    lineupStatus.textContent = "Saving lineup...";

    try {
        const response = await apiRequest("/edit_lineup", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lineupState.draftLineup)
        });

        if (!response.ok) {
            let errorMessage = "Unable to save lineup edits.";

            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (error) {
                // Keep the fallback message if the error payload is not JSON.
            }

            lineupStatus.textContent = errorMessage;
            setLineupActionState();
            return;
        }

        const contentType = response.headers.get("content-type") || "";
        const savedLineup = contentType.includes("application/json")
            ? await response.json()
            : lineupState.draftLineup;

        lineupState.currentLineup = normalizeLineupPayload(cloneData(savedLineup));
        lineupState.draftLineup = null;
        lineupState.isEditing = false;
        lineupState.hasUnsavedChanges = false;
        lineupState.draggedPlayerId = null;
        resetLineupValidationState();
        await window.refreshAppData?.({
            resources: ["lineups", "latestLineup"],
            feedbackOptions: { showSlowOverlay: false }
        });
        renderGeneratedLineup();
        persistLineupPageState();
        lineupStatus.textContent = "Lineup saved.";
    } catch (error) {
        console.error("Error saving lineup:", error);
        lineupStatus.textContent = "Unable to save lineup edits.";
        setLineupActionState();
    }
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

    const printableGameDate = getPrintableGameDateLabel(getCurrentGameDate());
    const printTitle = printableGameDate ? printableGameDate + " Lineup" : "Lineup";

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
        '<h1>' + escapeHtml(printTitle) + '</h1>' +
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
        const [data, latestLineup] = await Promise.all([
            window.getAppDataResource
                ? window.getAppDataResource("players")
                : Promise.resolve([]),
            loadLatestLineup()
        ]);
        rosterState.allPlayers = Array.isArray(data) ? data : (data.players || []);
        setCurrentGameDate(getUpcomingSaturdayDateValue());
        const savedPageState = getPersistedLineupPageState();

        if (restorePersistedLineupPageState(savedPageState)) {
            lineupStatus.textContent = (rosterState.selectedPlayers.length || lineupState.currentLineup)
                ? "Restored your current lineup."
                : "Players loaded.";
            return;
        }

        if (latestLineup && Array.isArray(latestLineup.players) && latestLineup.players.length) {
            setCurrentGameDate(latestLineup.game_date);
            rosterState.selectedPlayers = resolveRosterEntries(
                latestLineup.players.map((player) => ({
                    player_id: String(getPlayerId(player)),
                    available_innings: getPlayerAvailableInnings(player),
                    is_pitching: getPlayerPitchingEligibility(player)
                })),
                latestLineup
            );
            renderRoster();
            renderPlayerOptions();
            renderGeneratedLineup(latestLineup);
            saveRememberedRoster();
            persistLineupPageState();
            lineupStatus.textContent = "Loaded the most recent generated lineup.";
            return;
        }

        rosterState.selectedPlayers = [];
        renderRoster();
        renderPlayerOptions();
        resetRenderedLineupState();
        persistLineupPageState();
        lineupStatus.textContent = rosterState.allPlayers.length
            ? "Players loaded."
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
        game_date: getCurrentGameDate(),
        players: rosterState.selectedPlayers.map((player) => getPlayerObject(player))
    };

    lineupResult.innerHTML = '<div class="text-muted">Generating lineup...</div>';
    generatedLineupSection?.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
        const response = await apiRequest("/generate_lineup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }, {
            delayMs: 0,
            title: "Generating Smart Lineup",
            subtitle: "We are building the best lineup for this roster. This request make take a moment.",
            messages: LINEUP_GENERATE_MESSAGES
        });

        if (!response.ok) {
            throw new Error("Lineup request failed with status " + response.status + ".");
        }

        const data = await response.json();
        lineupState.draftLineup = null;
        lineupState.isEditing = false;
        lineupState.hasUnsavedChanges = false;
        lineupState.draggedPlayerId = null;
        resetLineupValidationState();
        await window.refreshAppData?.({
            resources: ["lineups", "latestLineup"],
            feedbackOptions: { showSlowOverlay: false }
        });
        renderGeneratedLineup(data);
        persistLineupPageState();
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
    persistLineupPageState();
    lineupStatus.textContent = "Player removed from the roster.";
}

function handleEditAvailabilityClick(event) {
    const editButton = event.target.closest(".edit-availability-btn");

    if (!editButton) {
        return;
    }

    openAvailabilityModal(editButton.getAttribute("data-player-id"));
}

function handleEditPitchingClick(event) {
    const editButton = event.target.closest(".edit-pitching-btn");

    if (!editButton) {
        return;
    }

    openPitchingModal(editButton.getAttribute("data-player-id"));
}

async function commitLineupPositionInput(input) {
    if (!input || !lineupState.isEditing || !lineupState.draftLineup) {
        return;
    }

    const playerId = input.getAttribute("data-player-id");
    const inningNumber = Number.parseInt(input.getAttribute("data-inning"), 10);
    const nextPosition = normalizeLineupPositionValue(input.value) || "--";
    const committedPosition = normalizeLineupPositionValue(input.getAttribute("data-committed-position"));

    if (!playerId || Number.isNaN(inningNumber)) {
        return;
    }

    input.value = nextPosition;

    if (nextPosition === committedPosition) {
        return;
    }

    if (!upsertDraftLineupPosition(playerId, inningNumber, nextPosition)) {
        return;
    }

    input.setAttribute("data-committed-position", nextPosition);
    lineupState.hasUnsavedChanges = hasDraftLineupChanges();
    setLineupActionState();
    await validateEditedLineupPosition();
}

lineupResult.addEventListener("keydown", (event) => {
    const input = event.target.closest(".lineup-position-input");

    if (!input) {
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
        return;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        input.value = input.getAttribute("data-committed-position") || "";
        input.blur();
    }
});

lineupResult.addEventListener("focusout", (event) => {
    const input = event.target.closest(".lineup-position-input");

    if (!input) {
        return;
    }

    commitLineupPositionInput(input);
});

lineupResult.addEventListener("click", (event) => {
    const editButton = event.target.closest("#editLineupInlineBtn");

    if (!editButton) {
        return;
    }

    beginLineupEdit();
});

lineupResult.addEventListener("dragstart", (event) => {
    const targetRow = event.target.closest(".lineup-edit-row");

    if (!targetRow || !lineupState.isEditing) {
        return;
    }

    lineupState.draggedPlayerId = targetRow.getAttribute("data-player-id");
    clearLineupDropTargets();
    targetRow.classList.add("dragging");

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", lineupState.draggedPlayerId);
    }
});

lineupResult.addEventListener("dragover", (event) => {
    const targetRow = event.target.closest(".lineup-edit-row");

    if (!targetRow || !lineupState.isEditing || !lineupState.draggedPlayerId) {
        return;
    }

    event.preventDefault();
    updateDraggedRowState(targetRow, event.clientY);

    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
});

lineupResult.addEventListener("drop", (event) => {
    const targetRow = event.target.closest(".lineup-edit-row");

    if (!targetRow || !lineupState.isEditing || !lineupState.draggedPlayerId) {
        return;
    }

    event.preventDefault();
    finishDraggedRowReorder(targetRow);
});

lineupResult.addEventListener("dragend", () => {
    lineupState.draggedPlayerId = null;
    lineupState.touchDragActive = false;
    clearLineupDropTargets();
});

lineupResult.addEventListener("touchstart", (event) => {
    const dragHandle = event.target.closest(".lineup-drag-handle");
    const targetRow = dragHandle?.closest(".lineup-edit-row");

    if (!targetRow || !lineupState.isEditing) {
        return;
    }

    lineupState.draggedPlayerId = targetRow.getAttribute("data-player-id");
    lineupState.touchDragActive = true;
    clearLineupDropTargets();
    targetRow.classList.add("dragging");
}, { passive: true });

lineupResult.addEventListener("touchmove", (event) => {
    if (!lineupState.touchDragActive || !lineupState.draggedPlayerId) {
        return;
    }

    const touch = event.touches[0];

    if (!touch) {
        return;
    }

    const targetRow = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".lineup-edit-row");

    if (!targetRow) {
        return;
    }

    event.preventDefault();
    updateDraggedRowState(targetRow, touch.clientY);
}, { passive: false });

lineupResult.addEventListener("touchend", (event) => {
    if (!lineupState.touchDragActive || !lineupState.draggedPlayerId) {
        return;
    }

    const touch = event.changedTouches[0];
    const targetRow = touch
        ? document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".lineup-edit-row")
        : null;

    finishDraggedRowReorder(targetRow);
});

lineupResult.addEventListener("touchcancel", () => {
    lineupState.draggedPlayerId = null;
    lineupState.touchDragActive = false;
    clearLineupDropTargets();
});

rosterTableBody.addEventListener("click", handleRemovePlayerClick);
rosterTableBody.addEventListener("click", handleEditAvailabilityClick);
rosterTableBody.addEventListener("click", handleEditPitchingClick);
rosterMobileList.addEventListener("click", handleRemovePlayerClick);
rosterMobileList.addEventListener("click", handleEditAvailabilityClick);
rosterMobileList.addEventListener("click", handleEditPitchingClick);

gameDateInput?.addEventListener("change", () => {
    persistLineupPageState();
    lineupStatus.textContent = "Game date updated.";
});

saveAvailabilityBtn?.addEventListener("click", saveAvailabilityChanges);
availabilityCheckboxes?.addEventListener("click", toggleAvailabilityOption);
savePitchingBtn?.addEventListener("click", savePitchingChanges);
pitchingOptions?.addEventListener("click", togglePitchingOption);

availabilityModalElement?.addEventListener("hidden.bs.modal", () => {
    lineupState.availabilityPlayerId = null;
    availabilityCheckboxes.innerHTML = "";
});

pitchingModalElement?.addEventListener("hidden.bs.modal", () => {
    lineupState.pitchingPlayerId = null;
    pitchingOptions.innerHTML = "";
});

clearRosterBtn.addEventListener("click", () => {
    rosterState.selectedPlayers = [];
    rosterState.searchTerm = "";
    playerSearch.value = "";
    playerSelect.value = "";
    renderRoster();
    renderPlayerOptions();
    saveRememberedRoster();
    downloadLineupBtn.disabled = true;
    persistLineupPageState();
    lineupStatus.textContent = "Roster cleared.";
});

saveLineupBtn.addEventListener("click", saveEditedLineup);
cancelLineupEditsBtn.addEventListener("click", cancelLineupEdit);
generateLineupBtn.addEventListener("click", generateLineup);
downloadLineupBtn.addEventListener("click", downloadLineupPdf);
window.addEventListener("resize", updatePlayerSearchPlaceholder);
updatePlayerSearchPlaceholder();
loadPlayers();

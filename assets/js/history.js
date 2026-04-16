const fallbackHistorySettings = {
    lineupNameFormat: "abbreviated",
    lineupSortOrder: "first_name_asc",
    inningsToDisplay: 9
};

const FULL_GAME_INNINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const historyContent = document.getElementById("historyContent");
const historyStatus = document.getElementById("historyStatus");
const addLineupBtn = document.getElementById("addLineupBtn");

const historyState = {
    historyGroups: [],
    historyLoadFailed: false,
    allPlayers: [],
    isLoadingPlayers: false,
    editorMode: null,
    editingLineupKey: null,
    currentLineup: null,
    draftLineup: null,
    hasUnsavedChanges: false,
    draggedPlayerId: null,
    touchDragActive: false,
    validationStatus: "idle",
    validationMessage: "",
    invalidSpotKeys: new Set(),
    lastValidationRequestToken: 0,
    pendingValidationRequests: 0
};

function getHistorySettings() {
    return window.AppSettings?.getSettings ? window.AppSettings.getSettings() : fallbackHistorySettings;
}

function getHistoryPlayerId(player) {
    return player.player_id ?? player.id;
}

function getHistoryStoredLineupId(lineup) {
    return lineup?.lineup_id ?? lineup?.id ?? null;
}

function getHistoryLineupKey(lineup, fallbackIndex) {
    return String(getHistoryStoredLineupId(lineup) ?? ("lineup-" + fallbackIndex));
}

function getHistoryPlayerName(player) {
    const settings = getHistorySettings();
    const firstName = String(player.first_name || "").trim();
    const lastName = String(player.last_name || "").trim();

    if (settings.lineupNameFormat === "full" && (firstName || lastName)) {
        return [firstName, lastName].filter(Boolean).join(" ");
    }

    if (firstName && lastName) {
        return firstName + " " + lastName.charAt(0) + ".";
    }

    return firstName || lastName || player.name || ("Player " + getHistoryPlayerId(player));
}

function getHistoryBattingOrder(player, fallbackOrder) {
    const battingOrder = Number.parseInt(player?.batting_order, 10);
    return Number.isNaN(battingOrder) ? fallbackOrder : battingOrder;
}

function cloneHistoryData(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function compareText(leftValue, rightValue) {
    return String(leftValue || "").localeCompare(String(rightValue || ""), undefined, { sensitivity: "base" });
}

function getHistoryOverallRating(player) {
    if (Array.isArray(player.position_scores)) {
        return player.position_scores.reduce((total, entry) => {
            return total + (Number.parseInt(entry.score, 10) || 0);
        }, 0);
    }

    return ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].reduce((total, position) => {
        return total + (Number.parseInt(player[position], 10) || 0);
    }, 0);
}

function sortHistoryPlayers(players) {
    const sortOrder = getHistorySettings().lineupSortOrder;
    const sortedPlayers = [...players];

    sortedPlayers.sort((firstPlayer, secondPlayer) => {
        if (sortOrder === "rating_desc") {
            const ratingDifference = getHistoryOverallRating(secondPlayer) - getHistoryOverallRating(firstPlayer);

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

function normalizeHistoryLineup(lineup) {
    if (!lineup || !Array.isArray(lineup.players)) {
        return lineup;
    }

    lineup.players = [...lineup.players]
        .sort((firstPlayer, secondPlayer) => {
            return getHistoryBattingOrder(firstPlayer, Number.MAX_SAFE_INTEGER) - getHistoryBattingOrder(secondPlayer, Number.MAX_SAFE_INTEGER);
        })
        .map((player, index) => {
            player.batting_order = index + 1;
            player.innings = Array.isArray(player.innings)
                ? [...player.innings].sort((firstInning, secondInning) => {
                    return Number.parseInt(firstInning?.inning, 10) - Number.parseInt(secondInning?.inning, 10);
                })
                : [];
            return player;
        });

    return lineup;
}

function formatHistoryDate(gameDate) {
    if (!gameDate) {
        return "No Game Date";
    }

    const parsedDate = new Date(gameDate + "T00:00:00");

    if (Number.isNaN(parsedDate.getTime())) {
        return gameDate;
    }

    return parsedDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function getUpcomingSaturdayDateValue() {
    const today = new Date();
    const nextSaturday = new Date(today);
    const daysUntilSaturday = (6 - today.getDay() + 7) % 7;

    nextSaturday.setDate(today.getDate() + daysUntilSaturday);
    nextSaturday.setHours(0, 0, 0, 0);
    return nextSaturday.toISOString().slice(0, 10);
}

function getDefaultNewLineupGameDate() {
    const latestTimestamp = historyState.historyGroups.reduce((currentLatest, group) => {
        if (!group?.game_date) {
            return currentLatest;
        }

        const nextTimestamp = new Date(group.game_date + "T00:00:00").getTime();
        return Number.isNaN(nextTimestamp) ? currentLatest : Math.max(currentLatest, nextTimestamp);
    }, Number.NEGATIVE_INFINITY);

    if (latestTimestamp > Number.NEGATIVE_INFINITY) {
        return new Date(latestTimestamp).toISOString().slice(0, 10);
    }

    return getUpcomingSaturdayDateValue();
}

function normalizeLineupPositionValue(value) {
    return String(value ?? "").trim().toUpperCase();
}

function getHistoryLineupSpotKey(playerId, inning) {
    return String(playerId) + ":" + String(inning);
}

function isEditingExistingHistoryLineup() {
    return historyState.editorMode === "edit";
}

function getHistoryEditingStatusMessage() {
    return "Editing lineup. Update positions or drag rows to change batting order, then save once validation passes.";
}

function resetHistoryValidationState() {
    historyState.validationStatus = "idle";
    historyState.validationMessage = "";
    historyState.invalidSpotKeys = new Set();
    historyState.lastValidationRequestToken = 0;
    historyState.pendingValidationRequests = 0;
    renderHistoryValidationMessage();
    applyRenderedInvalidSpots();
}

function renderHistoryValidationMessage() {
    const validationMessage = document.getElementById("historyLineupValidationMessage");

    if (!validationMessage) {
        return;
    }

    const shouldShowMessage = isEditingExistingHistoryLineup()
        && Boolean(historyState.validationMessage)
        && (historyState.validationStatus === "invalid" || historyState.validationStatus === "error");

    validationMessage.textContent = shouldShowMessage ? historyState.validationMessage : "";
    validationMessage.classList.toggle("d-none", !shouldShowMessage);
}

function getActiveHistoryEditorRoot() {
    return historyContent.querySelector("[data-history-editor='active']");
}

function applyRenderedInvalidSpots() {
    const editorRoot = getActiveHistoryEditorRoot();

    if (!editorRoot) {
        return;
    }

    editorRoot.querySelectorAll("[data-history-lineup-cell-player-id][data-history-lineup-cell-inning]").forEach((cell) => {
        const playerId = cell.getAttribute("data-history-lineup-cell-player-id");
        const inning = cell.getAttribute("data-history-lineup-cell-inning");
        const isInvalid = historyState.invalidSpotKeys.has(getHistoryLineupSpotKey(playerId, inning));

        cell.classList.toggle("is-invalid", isInvalid);
    });
}

function setHistoryValidationResult(result) {
    const invalidSpots = Array.isArray(result?.invalid_spots) ? result.invalid_spots : [];

    historyState.validationStatus = result?.is_valid ? "valid" : "invalid";
    historyState.validationMessage = result?.is_valid ? "" : String(result?.message || "One or more lineup changes are invalid.");
    historyState.invalidSpotKeys = new Set(invalidSpots.map((spot) => {
        return getHistoryLineupSpotKey(spot.player_id, spot.inning);
    }));
    renderHistoryValidationMessage();
    applyRenderedInvalidSpots();
}

function setHistoryValidationPending() {
    historyState.validationStatus = "pending";
    historyState.validationMessage = "";
    historyState.invalidSpotKeys = new Set();
    renderHistoryValidationMessage();
    applyRenderedInvalidSpots();
}

function setHistoryValidationError(message) {
    historyState.validationStatus = "error";
    historyState.validationMessage = message || "Unable to validate this lineup change right now.";
    historyState.invalidSpotKeys = new Set();
    renderHistoryValidationMessage();
    applyRenderedInvalidSpots();
}

function getHistoryDraftLineupPlayer(playerId) {
    if (!historyState.draftLineup || !Array.isArray(historyState.draftLineup.players)) {
        return null;
    }

    return historyState.draftLineup.players.find((candidate) => {
        return String(getHistoryPlayerId(candidate)) === String(playerId);
    }) || null;
}

function buildHistoryPlayerInningPositionMap(player) {
    const innings = Array.isArray(player?.innings) ? player.innings : [];

    return new Map(innings.map((inningEntry) => {
        return [Number.parseInt(inningEntry.inning, 10), normalizeLineupPositionValue(inningEntry.position) || "--"];
    }));
}

function getUnsavedHistoryLineupPositionChanges() {
    if (!historyState.currentLineup || !historyState.draftLineup) {
        return [];
    }

    const currentPlayers = Array.isArray(historyState.currentLineup.players) ? historyState.currentLineup.players : [];
    const draftPlayers = Array.isArray(historyState.draftLineup.players) ? historyState.draftLineup.players : [];
    const currentPlayersById = new Map(currentPlayers.map((player) => [String(getHistoryPlayerId(player)), player]));

    return draftPlayers.flatMap((draftPlayer) => {
        const playerId = String(getHistoryPlayerId(draftPlayer));
        const currentPlayer = currentPlayersById.get(playerId);
        const currentPositions = buildHistoryPlayerInningPositionMap(currentPlayer);
        const draftPositions = buildHistoryPlayerInningPositionMap(draftPlayer);
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

function hasHistoryDraftLineupChanges() {
    if (!historyState.currentLineup || !historyState.draftLineup) {
        return false;
    }

    const currentPlayers = Array.isArray(historyState.currentLineup.players) ? historyState.currentLineup.players : [];
    const draftPlayers = Array.isArray(historyState.draftLineup.players) ? historyState.draftLineup.players : [];

    if (currentPlayers.length !== draftPlayers.length) {
        return true;
    }

    return draftPlayers.some((draftPlayer, index) => {
        const currentPlayer = currentPlayers[index];

        if (!currentPlayer) {
            return true;
        }

        if (String(getHistoryPlayerId(draftPlayer)) !== String(getHistoryPlayerId(currentPlayer))) {
            return true;
        }

        if (Number.parseInt(draftPlayer?.batting_order, 10) !== Number.parseInt(currentPlayer?.batting_order, 10)) {
            return true;
        }

        const currentPositions = buildHistoryPlayerInningPositionMap(currentPlayer);
        const draftPositions = buildHistoryPlayerInningPositionMap(draftPlayer);
        const inningNumbers = new Set([...currentPositions.keys(), ...draftPositions.keys()]);

        return Array.from(inningNumbers).some((inningNumber) => {
            return (currentPositions.get(inningNumber) || "--") !== (draftPositions.get(inningNumber) || "--");
        });
    });
}

function upsertHistoryDraftLineupPosition(playerId, inningNumber, position) {
    const player = getHistoryDraftLineupPlayer(playerId);

    if (!player) {
        return false;
    }

    const innings = Array.isArray(player.innings) ? player.innings : [];
    const inningEntry = innings.find((candidate) => Number.parseInt(candidate.inning, 10) === inningNumber);

    if (inningEntry) {
        inningEntry.position = position;
    } else {
        innings.push({ inning: inningNumber, position });
        innings.sort((firstEntry, secondEntry) => {
            return Number.parseInt(firstEntry.inning, 10) - Number.parseInt(secondEntry.inning, 10);
        });
        player.innings = innings;
    }

    return true;
}

function isHistorySaveDisabled() {
    if (!historyState.draftLineup) {
        return true;
    }

    if (historyState.editorMode === "new") {
        return !Array.isArray(historyState.draftLineup.players) || !historyState.draftLineup.players.length;
    }

    const hasBlockingValidationState = historyState.validationStatus === "pending"
        || historyState.validationStatus === "invalid"
        || historyState.validationStatus === "error";

    return !historyState.hasUnsavedChanges || hasBlockingValidationState;
}

function renderHistoryActionState() {
    const saveButton = historyContent.querySelector(".save-history-lineup-btn");

    if (saveButton) {
        saveButton.disabled = isHistorySaveDisabled();
    }

    updateAddLineupButtonState();
}

function updateAddLineupButtonState() {
    if (!addLineupBtn) {
        return;
    }

    const hasPlayers = historyState.allPlayers.length > 0;
    addLineupBtn.disabled = historyState.isLoadingPlayers || !hasPlayers;
    addLineupBtn.innerHTML = historyState.isLoadingPlayers
        ? '<i class="fas fa-spinner fa-spin"></i> Loading Roster'
        : '<i class="fas fa-plus"></i> Add Lineup';
    addLineupBtn.title = hasPlayers
        ? ""
        : (historyState.isLoadingPlayers ? "Loading players..." : "Players must load before you can add a lineup.");
}

function buildHistoryLineupTable(lineup, options = {}) {
    const normalizedLineup = normalizeHistoryLineup(cloneHistoryData(lineup));
    const inningNumbers = Array.from({ length: getHistorySettings().inningsToDisplay }, (_, index) => index + 1);
    const players = Array.isArray(normalizedLineup?.players) ? normalizedLineup.players : [];
    const isEditable = options.editable === true;

    if (!players.length) {
        return '<div class="text-center text-muted py-3">No players in this lineup.</div>';
    }

    const rows = players.map((player) => {
        const playerId = String(getHistoryPlayerId(player)).replace(/"/g, "&quot;");
        const inningMap = new Map((player.innings || []).map((inningEntry) => {
            return [Number.parseInt(inningEntry.inning, 10), inningEntry.position];
        }));
        const inningCells = inningNumbers.map((inningNumber) => {
            const position = inningMap.get(inningNumber) || "--";
            const invalidClass = historyState.invalidSpotKeys.has(getHistoryLineupSpotKey(getHistoryPlayerId(player), inningNumber))
                ? " is-invalid"
                : "";

            if (isEditable) {
                return '<td class="text-center history-lineup-position-cell' + invalidClass + '" data-history-lineup-cell-player-id="' + playerId + '" data-history-lineup-cell-inning="' + inningNumber + '">' +
                    '<input type="text" maxlength="2" inputmode="text" enterkeyhint="done" list="lineupPositionSuggestions" class="form-control form-control-sm history-lineup-position-input text-center" data-player-id="' + playerId + '" data-inning="' + inningNumber + '" data-committed-position="' + escapeHtml(position) + '" value="' + escapeHtml(position) + '">' +
                "</td>";
            }

            return '<td class="text-center history-lineup-position-cell" data-history-lineup-cell-player-id="' + playerId + '" data-history-lineup-cell-inning="' + inningNumber + '">' + escapeHtml(position) + "</td>";
        }).join("");

        const rowAttributes = isEditable
            ? ' class="history-lineup-edit-row" draggable="true" data-player-id="' + playerId + '"'
            : "";
        const playerCellContent = isEditable
            ? '<span class="text-muted history-lineup-drag-handle" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>' + escapeHtml(getHistoryPlayerName(player))
            : escapeHtml(getHistoryPlayerName(player));

        return "<tr" + rowAttributes + '><td class="fw-semibold text-nowrap">' + playerCellContent + "</td>" + inningCells + "</tr>";
    }).join("");

    return '<div class="table-responsive">' +
        '<table class="table table-bordered table-striped align-middle mb-0 history-lineup-table">' +
            "<thead>" +
                "<tr>" +
                    "<th>Player</th>" +
                    inningNumbers.map((inningNumber) => '<th class="text-center">' + inningNumber + "</th>").join("") +
                "</tr>" +
            "</thead>" +
            "<tbody>" + rows + "</tbody>" +
        "</table>" +
    "</div>";
}

function buildHistoryEditorValidationMarkup() {
    const shouldShowMessage = isEditingExistingHistoryLineup()
        && Boolean(historyState.validationMessage)
        && (historyState.validationStatus === "invalid" || historyState.validationStatus === "error");
    const messageText = shouldShowMessage ? escapeHtml(historyState.validationMessage) : "";
    const hiddenClass = shouldShowMessage ? "" : " d-none";

    return '<div id="historyLineupValidationMessage" class="alert alert-danger mb-3 py-2' + hiddenClass + '" role="alert">' + messageText + "</div>";
}

function buildHistoryLineupCard(lineup, options) {
    const isEditing = options.isEditing === true;
    const isNew = options.isNew === true;
    const title = isNew ? "New Lineup" : "Lineup " + (options.lineupIndex + 1);
    const subtitle = isNew ? "Start with every inning set to \"//\" and adjust as needed." : options.groupDateLabel;
    const canEdit = options.canEdit !== false;
    const canDelete = options.canDelete === true;
    const editorCardClass = isEditing ? " history-editor-card" : "";
    const editorAttribute = isEditing ? ' data-history-editor="active"' : "";
    const lineupId = options.lineupId ? escapeHtml(options.lineupId) : "";
    const lineupKey = escapeHtml(options.lineupKey);
    const saveLabel = isNew ? "Save Lineup" : "Save Changes";
    const editingNote = isEditing
        ? '<div class="text-muted small mb-2">' + (isNew
            ? "Drag rows to set batting order, update positions, then save the lineup."
            : "Drag rows to change batting order. Position changes are validated as you edit.") + "</div>"
        : "";

    const headerLeftMarkup = isNew
        ? "<div>" +
            '<h6 class="mb-1">' + title + "</h6>" +
            '<p class="text-muted mb-0">' + subtitle + "</p>" +
            '<div class="history-lineup-editor-fields">' +
                '<label for="newLineupGameDateInput" class="form-label">Game Date</label>' +
                '<input id="newLineupGameDateInput" type="date" class="form-control form-control-sm" value="' + escapeHtml(lineup?.game_date || getDefaultNewLineupGameDate()) + '">' +
            "</div>" +
        "</div>"
        : "<div>" +
            '<h6 class="mb-1">' + title + "</h6>" +
            '<p class="text-muted mb-0">' + escapeHtml(subtitle) + "</p>" +
        "</div>";

    const headerRightMarkup = isEditing
        ? '<div class="history-lineup-editor-actions">' +
            '<button type="button" class="btn btn-primary btn-sm save-history-lineup-btn"' + (isHistorySaveDisabled() ? " disabled" : "") + ">" + saveLabel + "</button>" +
            '<button type="button" class="btn btn-outline-secondary btn-sm cancel-history-lineup-btn">Cancel</button>' +
        "</div>"
        : '<div class="history-lineup-editor-actions">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary edit-history-lineup-btn"' + (canEdit ? ' data-lineup-key="' + lineupKey + '"' : " disabled") + ">Edit</button>" +
            '<button type="button" class="btn btn-sm btn-outline-danger delete-lineup-btn"' + (canDelete ? ' data-lineup-id="' + lineupId + '"' : " disabled") + ">Delete</button>" +
        "</div>";

    return '<div class="card history-lineup-card' + editorCardClass + '"' + editorAttribute + ">" +
        '<div class="content">' +
            '<div class="history-lineup-meta">' +
                headerLeftMarkup +
                headerRightMarkup +
            "</div>" +
            editingNote +
            (isEditing ? buildHistoryEditorValidationMarkup() : "") +
            buildHistoryLineupTable(lineup, { editable: isEditing }) +
        "</div>" +
    "</div>";
}

function buildHistoryGroupMarkup(group, groupIndex) {
    const collapseId = "history-group-" + groupIndex;
    const headingId = "history-heading-" + groupIndex;
    const groupDateLabel = formatHistoryDate(group.game_date);
    const lineups = Array.isArray(group.lineups) ? group.lineups : [];
    const isExpanded = historyState.editorMode === "edit" && lineups.some((lineup, lineupIndex) => {
        return getHistoryLineupKey(lineup, groupIndex + "-" + lineupIndex) === historyState.editingLineupKey;
    });

    const lineupCards = lineups.length
        ? lineups.map((lineup, lineupIndex) => {
            const lineupKey = getHistoryLineupKey(lineup, groupIndex + "-" + lineupIndex);
            const lineupId = getHistoryStoredLineupId(lineup);
            const canDelete = lineupId !== null && lineupId !== undefined;
            const isEditing = historyState.editorMode === "edit" && historyState.editingLineupKey === lineupKey;
            const lineupToRender = isEditing ? historyState.draftLineup : lineup;

            return buildHistoryLineupCard(lineupToRender, {
                groupDateLabel,
                lineupIndex,
                lineupKey,
                lineupId,
                canDelete,
                canEdit: canDelete,
                isEditing
            });
        }).join("")
        : '<div class="text-center text-muted py-4">No lineups saved for this date.</div>';

    return '<div class="accordion-item history-group">' +
        '<h2 class="accordion-header" id="' + headingId + '">' +
            '<button class="accordion-button history-group-toggle' + (isExpanded ? "" : " collapsed") + '" type="button" data-bs-toggle="collapse" data-bs-target="#' + collapseId + '" aria-expanded="' + (isExpanded ? "true" : "false") + '" aria-controls="' + collapseId + '">' +
                '<div class="d-flex justify-content-between align-items-center w-100 gap-3 flex-wrap">' +
                    "<div>" +
                        '<div class="fw-semibold">' + escapeHtml(groupDateLabel) + "</div>" +
                        '<div class="text-muted small">Saved lineup history</div>' +
                    "</div>" +
                    '<div class="d-flex align-items-center gap-2">' +
                        '<span class="history-count-badge">' + lineups.length + "</span>" +
                        '<i class="fas fa-chevron-down history-group-chevron text-muted"></i>' +
                    "</div>" +
                "</div>" +
            "</button>" +
        "</h2>" +
        '<div id="' + collapseId + '" class="accordion-collapse collapse' + (isExpanded ? " show" : "") + '" aria-labelledby="' + headingId + '" data-bs-parent="#historyAccordion">' +
            '<div class="accordion-body">' + lineupCards + "</div>" +
        "</div>" +
    "</div>";
}

function renderHistory() {
    const newEditorMarkup = historyState.editorMode === "new" && historyState.draftLineup
        ? buildHistoryLineupCard(historyState.draftLineup, {
            lineupIndex: 0,
            lineupKey: "new",
            lineupId: null,
            canDelete: false,
            isEditing: true,
            isNew: true
        })
        : "";

    if (!historyState.historyGroups.length) {
        const emptyStateMarkup = historyState.historyLoadFailed
            ? '<div class="text-center text-muted py-4">Unable to load lineup history.</div>'
            : '<div class="text-center text-muted py-4">No saved lineups yet.</div>';

        historyContent.innerHTML = newEditorMarkup + emptyStateMarkup;
        renderHistoryValidationMessage();
        applyRenderedInvalidSpots();
        renderHistoryActionState();
        return;
    }

    historyContent.innerHTML = newEditorMarkup +
        '<div class="accordion" id="historyAccordion">' +
            historyState.historyGroups.map((group, groupIndex) => buildHistoryGroupMarkup(group, groupIndex)).join("") +
        "</div>";
    renderHistoryValidationMessage();
    applyRenderedInvalidSpots();
    renderHistoryActionState();
}

function findHistoryLineupEntry(lineupKey) {
    for (let groupIndex = 0; groupIndex < historyState.historyGroups.length; groupIndex += 1) {
        const group = historyState.historyGroups[groupIndex];
        const lineups = Array.isArray(group?.lineups) ? group.lineups : [];

        for (let lineupIndex = 0; lineupIndex < lineups.length; lineupIndex += 1) {
            const lineup = lineups[lineupIndex];
            const candidateKey = getHistoryLineupKey(lineup, groupIndex + "-" + lineupIndex);

            if (candidateKey === String(lineupKey)) {
                return { group, groupIndex, lineup, lineupIndex, lineupKey: candidateKey };
            }
        }
    }

    return null;
}

function confirmDiscardActiveHistoryEditor() {
    if (!historyState.draftLineup || !historyState.hasUnsavedChanges) {
        return true;
    }

    const confirmationMessage = historyState.editorMode === "new"
        ? "Discard this new lineup draft?"
        : "Discard the current lineup edits?";

    return window.confirm(confirmationMessage);
}

function clearHistoryEditorState() {
    historyState.editorMode = null;
    historyState.editingLineupKey = null;
    historyState.currentLineup = null;
    historyState.draftLineup = null;
    historyState.hasUnsavedChanges = false;
    historyState.draggedPlayerId = null;
    historyState.touchDragActive = false;
    resetHistoryValidationState();
}

function scrollActiveHistoryEditorIntoView() {
    window.requestAnimationFrame(() => {
        const activeEditor = getActiveHistoryEditorRoot();
        activeEditor?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

function createBlankHistoryLineup() {
    if (!historyState.allPlayers.length) {
        return null;
    }

    return normalizeHistoryLineup({
        game_date: getDefaultNewLineupGameDate(),
        players: sortHistoryPlayers(historyState.allPlayers).map((player, index) => {
            return {
                ...cloneHistoryData(player),
                player_id: getHistoryPlayerId(player),
                batting_order: index + 1,
                innings: FULL_GAME_INNINGS.map((inningNumber) => ({
                    inning: inningNumber,
                    position: "//"
                }))
            };
        })
    });
}

function startNewHistoryLineup() {
    if (!historyState.allPlayers.length) {
        historyStatus.textContent = "Players must load before you can add a lineup.";
        return;
    }

    if (!confirmDiscardActiveHistoryEditor()) {
        return;
    }

    const blankLineup = createBlankHistoryLineup();

    if (!blankLineup) {
        historyStatus.textContent = "Unable to prepare a new lineup right now.";
        return;
    }

    historyState.editorMode = "new";
    historyState.editingLineupKey = "new";
    historyState.currentLineup = null;
    historyState.draftLineup = blankLineup;
    historyState.hasUnsavedChanges = true;
    historyState.draggedPlayerId = null;
    historyState.touchDragActive = false;
    resetHistoryValidationState();
    renderHistory();
    historyStatus.textContent = "New lineup ready. Set the game date, assign positions, and save when you're ready.";
    scrollActiveHistoryEditorIntoView();
}

function beginHistoryLineupEdit(lineupKey) {
    if (historyState.editorMode === "edit" && historyState.editingLineupKey === String(lineupKey)) {
        return;
    }

    if (!confirmDiscardActiveHistoryEditor()) {
        return;
    }

    const lineupEntry = findHistoryLineupEntry(lineupKey);

    if (!lineupEntry) {
        historyStatus.textContent = "Unable to find that lineup.";
        return;
    }

    historyState.editorMode = "edit";
    historyState.editingLineupKey = lineupEntry.lineupKey;
    historyState.currentLineup = normalizeHistoryLineup(cloneHistoryData(lineupEntry.lineup));
    historyState.draftLineup = normalizeHistoryLineup(cloneHistoryData(lineupEntry.lineup));
    historyState.hasUnsavedChanges = false;
    historyState.draggedPlayerId = null;
    historyState.touchDragActive = false;
    resetHistoryValidationState();
    renderHistory();
    historyStatus.textContent = getHistoryEditingStatusMessage();
    scrollActiveHistoryEditorIntoView();
}

function cancelHistoryLineupEdit() {
    const canceledMode = historyState.editorMode;

    clearHistoryEditorState();
    renderHistory();
    historyStatus.textContent = canceledMode === "new"
        ? "New lineup discarded."
        : "Lineup edits discarded.";
}

function reorderHistoryDraftLineupPlayers(draggedPlayerId, targetPlayerId, placeAfter) {
    if (!historyState.draftLineup || !Array.isArray(historyState.draftLineup.players) || !draggedPlayerId || !targetPlayerId || draggedPlayerId === targetPlayerId) {
        return false;
    }

    const players = [...historyState.draftLineup.players];
    const draggedIndex = players.findIndex((player) => String(getHistoryPlayerId(player)) === draggedPlayerId);
    const targetIndex = players.findIndex((player) => String(getHistoryPlayerId(player)) === targetPlayerId);

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
    historyState.draftLineup.players = players.map((player, index) => {
        player.batting_order = index + 1;
        return player;
    });
    return true;
}

function clearHistoryLineupDropTargets() {
    historyContent.querySelectorAll(".history-lineup-edit-row").forEach((row) => {
        row.classList.remove("history-lineup-drop-target", "history-lineup-drop-after", "dragging");
        row.removeAttribute("data-drop-placement");
    });
}

function getHistoryDropPlacement(targetRow, clientY) {
    const rowBounds = targetRow.getBoundingClientRect();
    return clientY > rowBounds.top + (rowBounds.height / 2) ? "after" : "before";
}

function updateHistoryDraggedRowState(targetRow, clientY) {
    if (!targetRow || !historyState.draftLineup || !historyState.draggedPlayerId) {
        return false;
    }

    const targetPlayerId = targetRow.getAttribute("data-player-id");

    if (targetPlayerId === historyState.draggedPlayerId) {
        clearHistoryLineupDropTargets();
        targetRow.classList.add("dragging");
        return false;
    }

    const dropPlacement = getHistoryDropPlacement(targetRow, clientY);
    clearHistoryLineupDropTargets();
    targetRow.classList.add("history-lineup-drop-target");
    targetRow.classList.toggle("history-lineup-drop-after", dropPlacement === "after");
    targetRow.setAttribute("data-drop-placement", dropPlacement);

    const draggedRow = historyContent.querySelector('.history-lineup-edit-row[data-player-id="' + historyState.draggedPlayerId + '"]');

    if (draggedRow) {
        draggedRow.classList.add("dragging");
    }

    return true;
}

function finishHistoryDraggedRowReorder(targetRow) {
    if (!targetRow || !historyState.draftLineup || !historyState.draggedPlayerId) {
        historyState.draggedPlayerId = null;
        historyState.touchDragActive = false;
        clearHistoryLineupDropTargets();
        return false;
    }

    const targetPlayerId = targetRow.getAttribute("data-player-id");
    const placeAfter = targetRow.getAttribute("data-drop-placement") === "after";
    const didReorder = reorderHistoryDraftLineupPlayers(historyState.draggedPlayerId, targetPlayerId, placeAfter);

    historyState.draggedPlayerId = null;
    historyState.touchDragActive = false;
    clearHistoryLineupDropTargets();

    if (!didReorder) {
        return false;
    }

    historyState.hasUnsavedChanges = historyState.editorMode === "new" ? true : hasHistoryDraftLineupChanges();
    renderHistory();
    historyStatus.textContent = historyState.editorMode === "new"
        ? "Updated the new lineup batting order."
        : getHistoryEditingStatusMessage();
    return true;
}

async function validateHistoryEditedLineupPosition() {
    const lineupId = getHistoryStoredLineupId(historyState.currentLineup) || getHistoryStoredLineupId(historyState.draftLineup);

    if (!lineupId) {
        setHistoryValidationError("This lineup cannot be validated because it is missing a lineup ID.");
        renderHistoryActionState();
        return false;
    }

    const unsavedPositionChanges = getUnsavedHistoryLineupPositionChanges();

    if (!unsavedPositionChanges.length) {
        resetHistoryValidationState();
        renderHistoryActionState();
        return true;
    }

    const requestToken = historyState.lastValidationRequestToken + 1;

    historyState.lastValidationRequestToken = requestToken;
    historyState.pendingValidationRequests += 1;
    setHistoryValidationPending();
    renderHistoryActionState();

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

        if (requestToken !== historyState.lastValidationRequestToken) {
            return false;
        }

        if (!response.ok) {
            setHistoryValidationError(payload?.message || "Unable to validate this lineup change right now.");
            return false;
        }

        setHistoryValidationResult(payload || {});
        return historyState.validationStatus === "valid";
    } catch (error) {
        console.error("Error validating lineup position:", error);

        if (requestToken === historyState.lastValidationRequestToken) {
            setHistoryValidationError("Unable to validate this lineup change right now.");
        }

        return false;
    } finally {
        historyState.pendingValidationRequests = Math.max(0, historyState.pendingValidationRequests - 1);

        if (requestToken === historyState.lastValidationRequestToken) {
            renderHistoryActionState();
        }
    }
}

async function getHistoryErrorMessage(response, fallbackMessage) {
    try {
        const errorData = await response.json();
        return errorData?.detail || errorData?.message || fallbackMessage;
    } catch (error) {
        return fallbackMessage;
    }
}

async function saveEditedHistoryLineup() {
    if (historyState.editorMode !== "edit" || !historyState.draftLineup) {
        return;
    }

    const saveButton = historyContent.querySelector(".save-history-lineup-btn");

    if (saveButton) {
        saveButton.disabled = true;
    }

    historyStatus.textContent = "Saving lineup...";

    try {
        const response = await apiRequest("/edit_lineup", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(historyState.draftLineup)
        });

        if (!response.ok) {
            historyStatus.textContent = await getHistoryErrorMessage(response, "Unable to save lineup edits.");
            renderHistoryActionState();
            return;
        }

        clearHistoryEditorState();
        await loadHistory();
        historyStatus.textContent = "Lineup saved.";
    } catch (error) {
        console.error("Error saving lineup:", error);
        historyStatus.textContent = "Unable to save lineup edits.";
        renderHistoryActionState();
    }
}

async function saveNewHistoryLineup() {
    if (historyState.editorMode !== "new" || !historyState.draftLineup) {
        return;
    }

    const payload = cloneHistoryData(historyState.draftLineup);

    delete payload.lineup_id;
    delete payload.id;

    const saveButton = historyContent.querySelector(".save-history-lineup-btn");

    if (saveButton) {
        saveButton.disabled = true;
    }

    historyStatus.textContent = "Adding lineup...";

    try {
        const response = await apiRequest("/add_lineup", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            historyStatus.textContent = await getHistoryErrorMessage(response, "Unable to add lineup.");
            renderHistoryActionState();
            return;
        }

        clearHistoryEditorState();
        await loadHistory();
        historyStatus.textContent = "Lineup added.";
    } catch (error) {
        console.error("Error adding lineup:", error);
        historyStatus.textContent = "Unable to add lineup.";
        renderHistoryActionState();
    }
}

async function saveActiveHistoryLineup() {
    if (historyState.editorMode === "new") {
        await saveNewHistoryLineup();
        return;
    }

    await saveEditedHistoryLineup();
}

async function loadHistory() {
    historyStatus.textContent = "Loading lineup history...";

    try {
        const response = await apiRequest("/lineups");

        if (!response.ok) {
            throw new Error("History request failed with status " + response.status + ".");
        }

        const data = await response.json();
        historyState.historyGroups = Array.isArray(data) ? data : [];
        historyState.historyLoadFailed = false;
        renderHistory();
        historyStatus.textContent = historyState.historyGroups.length
            ? "Showing saved lineups grouped by game date."
            : "No saved lineups yet.";
    } catch (error) {
        console.error("Error loading lineup history:", error);
        historyState.historyGroups = [];
        historyState.historyLoadFailed = true;
        renderHistory();
        historyStatus.textContent = "Unable to load lineup history.";
    }
}

async function loadPlayersForNewLineups() {
    historyState.isLoadingPlayers = true;
    updateAddLineupButtonState();

    try {
        const response = await apiRequest("/players");

        if (!response.ok) {
            throw new Error("Players request failed with status " + response.status + ".");
        }

        const data = await response.json();
        historyState.allPlayers = data;
    } catch (error) {
        console.error("Error loading players for history add flow:", error);
        // historyState.allPlayers = [];
    } finally {
        historyState.isLoadingPlayers = false;
        updateAddLineupButtonState();
    }
}

async function deleteLineup(lineupId) {
    if (!lineupId) {
        return;
    }

    if (!window.confirm("Delete this saved lineup from history?")) {
        return;
    }

    historyStatus.textContent = "Deleting lineup...";

    try {
        const response = await apiRequest("/delete_lineup/" + encodeURIComponent(lineupId), {
            method: "DELETE"
        });

        if (!response.ok) {
            throw new Error("Delete request failed with status " + response.status + ".");
        }

        await loadHistory();
        historyStatus.textContent = "Lineup deleted.";
    } catch (error) {
        console.error("Error deleting lineup:", error);
        historyStatus.textContent = "Unable to delete lineup.";
    }
}

function updateNewLineupGameDate(value) {
    if (historyState.editorMode !== "new" || !historyState.draftLineup) {
        return;
    }

    historyState.draftLineup.game_date = value || getDefaultNewLineupGameDate();
    historyState.hasUnsavedChanges = true;
    renderHistoryActionState();
    historyStatus.textContent = "New lineup date updated.";
}

async function commitHistoryLineupPositionInput(input) {
    if (!input || !historyState.draftLineup) {
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

    if (!upsertHistoryDraftLineupPosition(playerId, inningNumber, nextPosition)) {
        return;
    }

    input.setAttribute("data-committed-position", nextPosition);
    historyState.hasUnsavedChanges = historyState.editorMode === "new" ? true : hasHistoryDraftLineupChanges();
    renderHistoryActionState();

    if (isEditingExistingHistoryLineup()) {
        await validateHistoryEditedLineupPosition();
    } else {
        resetHistoryValidationState();
    }
}

historyContent.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-lineup-btn");

    if (deleteButton) {
        deleteLineup(deleteButton.getAttribute("data-lineup-id"));
        return;
    }

    const editButton = event.target.closest(".edit-history-lineup-btn");

    if (editButton) {
        beginHistoryLineupEdit(editButton.getAttribute("data-lineup-key"));
        return;
    }

    if (event.target.closest(".save-history-lineup-btn")) {
        saveActiveHistoryLineup();
        return;
    }

    if (event.target.closest(".cancel-history-lineup-btn")) {
        cancelHistoryLineupEdit();
    }
});

historyContent.addEventListener("keydown", (event) => {
    const input = event.target.closest(".history-lineup-position-input");

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

historyContent.addEventListener("focusout", (event) => {
    const input = event.target.closest(".history-lineup-position-input");

    if (!input) {
        return;
    }

    commitHistoryLineupPositionInput(input);
});

historyContent.addEventListener("change", (event) => {
    if (event.target.id === "newLineupGameDateInput") {
        updateNewLineupGameDate(event.target.value);
    }
});

historyContent.addEventListener("dragstart", (event) => {
    const targetRow = event.target.closest(".history-lineup-edit-row");

    if (!targetRow || !historyState.draftLineup) {
        return;
    }

    historyState.draggedPlayerId = targetRow.getAttribute("data-player-id");
    clearHistoryLineupDropTargets();
    targetRow.classList.add("dragging");

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", historyState.draggedPlayerId);
    }
});

historyContent.addEventListener("dragover", (event) => {
    const targetRow = event.target.closest(".history-lineup-edit-row");

    if (!targetRow || !historyState.draftLineup || !historyState.draggedPlayerId) {
        return;
    }

    event.preventDefault();
    updateHistoryDraggedRowState(targetRow, event.clientY);

    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
});

historyContent.addEventListener("drop", (event) => {
    const targetRow = event.target.closest(".history-lineup-edit-row");

    if (!targetRow || !historyState.draftLineup || !historyState.draggedPlayerId) {
        return;
    }

    event.preventDefault();
    finishHistoryDraggedRowReorder(targetRow);
});

historyContent.addEventListener("dragend", () => {
    historyState.draggedPlayerId = null;
    historyState.touchDragActive = false;
    clearHistoryLineupDropTargets();
});

historyContent.addEventListener("touchstart", (event) => {
    const dragHandle = event.target.closest(".history-lineup-drag-handle");
    const targetRow = dragHandle?.closest(".history-lineup-edit-row");

    if (!targetRow || !historyState.draftLineup) {
        return;
    }

    historyState.draggedPlayerId = targetRow.getAttribute("data-player-id");
    historyState.touchDragActive = true;
    clearHistoryLineupDropTargets();
    targetRow.classList.add("dragging");
}, { passive: true });

historyContent.addEventListener("touchmove", (event) => {
    if (!historyState.touchDragActive || !historyState.draggedPlayerId) {
        return;
    }

    const touch = event.touches[0];

    if (!touch) {
        return;
    }

    const targetRow = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".history-lineup-edit-row");

    if (!targetRow) {
        return;
    }

    event.preventDefault();
    updateHistoryDraggedRowState(targetRow, touch.clientY);
}, { passive: false });

historyContent.addEventListener("touchend", (event) => {
    if (!historyState.touchDragActive || !historyState.draggedPlayerId) {
        return;
    }

    const touch = event.changedTouches[0];
    const targetRow = touch
        ? document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".history-lineup-edit-row")
        : null;

    finishHistoryDraggedRowReorder(targetRow);
});

historyContent.addEventListener("touchcancel", () => {
    historyState.draggedPlayerId = null;
    historyState.touchDragActive = false;
    clearHistoryLineupDropTargets();
});

addLineupBtn?.addEventListener("click", startNewHistoryLineup);

// loadPlayersForNewLineups();
loadHistory();
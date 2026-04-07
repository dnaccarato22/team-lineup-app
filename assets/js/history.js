const fallbackHistorySettings = {
    lineupNameFormat: "abbreviated",
    inningsToDisplay: 9
};

const historyContent = document.getElementById("historyContent");
const historyStatus = document.getElementById("historyStatus");

function getHistorySettings() {
    return window.AppSettings?.getSettings ? window.AppSettings.getSettings() : fallbackHistorySettings;
}

function getHistoryPlayerId(player) {
    return player.player_id ?? player.id;
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

    return (firstName || lastName || player.name || ("Player " + getHistoryPlayerId(player)));
}

function getHistoryBattingOrder(player, fallbackOrder) {
    const battingOrder = Number.parseInt(player?.batting_order, 10);
    return Number.isNaN(battingOrder) ? fallbackOrder : battingOrder;
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
                ? [...player.innings].sort((firstInning, secondInning) => firstInning.inning - secondInning.inning)
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

function getLineupId(lineup, fallbackIndex) {
    return lineup.lineup_id ?? lineup.id ?? ("lineup-" + fallbackIndex);
}

function cloneHistoryData(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

function buildHistoryLineupTable(lineup) {
    const normalizedLineup = normalizeHistoryLineup(cloneHistoryData(lineup));
    const inningNumbers = Array.from({ length: getHistorySettings().inningsToDisplay }, (_, index) => index + 1);
    const rows = normalizedLineup.players.map((player) => {
        const inningMap = new Map((player.innings || []).map((inningEntry) => [inningEntry.inning, inningEntry.position]));
        const inningCells = inningNumbers.map((inningNumber) => {
            return '<td class="text-center">' + (inningMap.get(inningNumber) || "--") + '</td>';
        }).join("");

        return '<tr>' +
            '<td class="fw-semibold">' + getHistoryPlayerName(player) + '</td>' +
            inningCells +
        '</tr>';
    }).join("");

    return '<div class="table-responsive">' +
        '<table class="table table-bordered table-striped align-middle mb-0 history-lineup-table">' +
            '<thead>' +
                '<tr>' +
                    '<th>Player</th>' +
                    inningNumbers.map((inningNumber) => '<th class="text-center">' + inningNumber + '</th>').join("") +
                '</tr>' +
            '</thead>' +
            '<tbody>' + rows + '</tbody>' +
        '</table>' +
    '</div>';
}

function renderHistory(historyGroups) {
    if (!historyGroups.length) {
        historyContent.innerHTML = '<div class="text-center text-muted py-4">No saved lineups yet.</div>';
        return;
    }

    historyContent.innerHTML = '<div class="accordion" id="historyAccordion">' + historyGroups.map((group, groupIndex) => {
        const collapseId = "history-group-" + groupIndex;
        const headingId = "history-heading-" + groupIndex;
        const isExpanded = false;
        const groupDateLabel = formatHistoryDate(group.game_date);
        const lineups = Array.isArray(group.lineups) ? group.lineups : [];

        const lineupCards = lineups.map((lineup, lineupIndex) => {
            const lineupId = getLineupId(lineup, groupIndex + "-" + lineupIndex);
            const canDelete = lineup.lineup_id !== undefined && lineup.lineup_id !== null;

            return '<div class="card history-lineup-card">' +
                '<div class="content">' +
                    '<div class="history-lineup-meta">' +
                        '<div>' +
                            '<h6 class="mb-1">Lineup ' + (lineupIndex + 1) + '</h6>' +
                            '<p class="text-muted mb-0">' + groupDateLabel + '</p>' +
                        '</div>' +
                        '<button type="button" class="btn btn-sm btn-outline-danger delete-lineup-btn"' + (canDelete ? ' data-lineup-id="' + lineupId + '"' : " disabled") + '>Delete</button>' +
                    '</div>' +
                    buildHistoryLineupTable(lineup) +
                '</div>' +
            '</div>';
        }).join("");

        return '<div class="accordion-item history-group">' +
            '<h2 class="accordion-header" id="' + headingId + '">' +
                '<button class="accordion-button history-group-toggle' + (isExpanded ? "" : " collapsed") + '" type="button" data-bs-toggle="collapse" data-bs-target="#' + collapseId + '" aria-expanded="' + (isExpanded ? "true" : "false") + '" aria-controls="' + collapseId + '">' +
                    '<div class="d-flex justify-content-between align-items-center w-100 gap-3 flex-wrap">' +
                        '<div>' +
                            '<div class="fw-semibold">' + groupDateLabel + '</div>' +
                            '<div class="text-muted small">Saved lineup history</div>' +
                        '</div>' +
                        '<div class="d-flex align-items-center gap-2">' +
                            '<span class="history-count-badge">' + lineups.length + '</span>' +
                            '<i class="fas fa-chevron-down history-group-chevron text-muted"></i>' +
                        '</div>' +
                    '</div>' +
                '</button>' +
            '</h2>' +
            '<div id="' + collapseId + '" class="accordion-collapse collapse' + (isExpanded ? " show" : "") + '" aria-labelledby="' + headingId + '" data-bs-parent="#historyAccordion">' +
                '<div class="accordion-body">' + lineupCards + '</div>' +
            '</div>' +
        '</div>';
    }).join("") + '</div>';
}

async function loadHistory() {
    historyStatus.textContent = "Loading lineup history...";

    try {
        const response = await apiRequest("/lineups");

        if (!response.ok) {
            throw new Error("History request failed with status " + response.status + ".");
        }

        const data = await response.json();
        const historyGroups = Array.isArray(data) ? data : [];
        renderHistory(historyGroups);
        historyStatus.textContent = historyGroups.length
            ? "Showing saved lineups grouped by game date."
            : "No saved lineups yet.";
    } catch (error) {
        console.error("Error loading lineup history:", error);
        historyContent.innerHTML = '<div class="text-center text-muted py-4">Unable to load lineup history.</div>';
        historyStatus.textContent = "Unable to load lineup history.";
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

historyContent.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-lineup-btn");

    if (!deleteButton) {
        return;
    }

    deleteLineup(deleteButton.getAttribute("data-lineup-id"));
});

loadHistory();

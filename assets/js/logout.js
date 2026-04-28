document.addEventListener("click", function(event) {
    const logoutButton = event.target.closest("#logoutBtn");

    if (!logoutButton) {
        return;
    }

    event.preventDefault();
    if (window.APP_SESSION_KEYS?.lineupPageState) {
        sessionStorage.removeItem(window.APP_SESSION_KEYS.lineupPageState);
    }
    window.clearAppSessionData?.();
    sessionStorage.removeItem("loggedIn");
    window.location.href = "index.html";
});

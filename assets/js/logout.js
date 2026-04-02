document.getElementById("logoutBtn")?.addEventListener("click", function(e) {
    e.preventDefault();
    sessionStorage.removeItem("loggedIn");
});
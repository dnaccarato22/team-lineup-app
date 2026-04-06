function setActiveSidebarLink(sidebarContainer) {
    const currentPage = sidebarContainer.dataset.currentPage;

    if (!currentPage) {
        return;
    }

    sidebarContainer.querySelectorAll("[data-nav-page]").forEach((link) => {
        const isActive = link.getAttribute("data-nav-page") === currentPage;
        link.classList.toggle("active", isActive);

        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

async function injectSharedFragment(container, fragmentPath) {
    const response = await fetch(fragmentPath);

    if (!response.ok) {
        throw new Error("Unable to load shared fragment: " + fragmentPath);
    }

    container.innerHTML = await response.text();
}

async function initSharedLayout() {
    const sidebarContainer = document.querySelector("[data-shared-sidebar]");
    const accountMenuContainer = document.querySelector("[data-shared-account-menu]");
    const tasks = [];

    if (sidebarContainer) {
        tasks.push(
            injectSharedFragment(sidebarContainer, "assets/components/sidebar/sidebar.html")
                .then(() => setActiveSidebarLink(sidebarContainer))
        );
    }

    if (accountMenuContainer) {
        tasks.push(injectSharedFragment(accountMenuContainer, "assets/components/navbar/account-dropdown.html"));
    }

    try {
        await Promise.all(tasks);
    } catch (error) {
        console.error("Error loading shared layout:", error);
    }
}

window.sharedLayoutReady = initSharedLayout();

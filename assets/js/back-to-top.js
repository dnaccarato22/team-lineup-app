(function() {
    'use strict';

    const MOBILE_QUERY = "(max-width: 767.98px)";
    const SHOW_AFTER_SCROLL_Y = 220;
    const BUTTON_ID = "backToTopButton";

    function isMobileView() {
        return window.matchMedia(MOBILE_QUERY).matches;
    }

    function getScrollTop() {
        return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    function getBackToTopButton() {
        let button = document.getElementById(BUTTON_ID);

        if (button) {
            return button;
        }

        button = document.createElement("button");
        button.type = "button";
        button.id = BUTTON_ID;
        button.className = "back-to-top-btn";
        button.setAttribute("aria-label", "Scroll back to top");
        button.setAttribute("title", "Back to top");
        button.innerHTML = '<span aria-hidden="true">&uarr;</span>';
        button.addEventListener("click", function() {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        document.body.appendChild(button);
        return button;
    }

    function updateBackToTopVisibility() {
        const button = getBackToTopButton();
        const shouldShow = isMobileView() && getScrollTop() > SHOW_AFTER_SCROLL_Y;
        button.classList.toggle("is-visible", shouldShow);
    }

    document.addEventListener("DOMContentLoaded", function() {
        getBackToTopButton();
        updateBackToTopVisibility();
        window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
        window.addEventListener("resize", updateBackToTopVisibility);
    });
})();

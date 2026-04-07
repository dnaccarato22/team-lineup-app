/*------------------------------------------------------------------
* Bootstrap Simple Admin Template
* Version: 3.0
* Author: Alexis Luna
* Website: https://github.com/alexis-luna/bootstrap-simple-admin-template
-------------------------------------------------------------------*/
(function() {
    'use strict';

    function getSidebarElements() {
        return {
            sidebar: document.getElementById("sidebar"),
            body: document.getElementById("body")
        };
    }

    function isSidebarOpen(sidebar) {
        return Boolean(sidebar) && !sidebar.classList.contains("active");
    }

    function setSidebarOpenState(isOpen) {
        const { sidebar, body } = getSidebarElements();

        if (!sidebar || !body) {
            return;
        }

        sidebar.classList.toggle("active", !isOpen);
        body.classList.toggle("active", !isOpen);
    }

    document.addEventListener("click", function(event) {
        const sidebarToggle = event.target.closest("#sidebarCollapse");
        const { sidebar } = getSidebarElements();

        if (sidebarToggle) {
            setSidebarOpenState(!isSidebarOpen(sidebar));
            return;
        }

        if (!isSidebarOpen(sidebar)) {
            return;
        }

        if (event.target.closest("#sidebar")) {
            return;
        }

        setSidebarOpenState(false);
    });

    const tooltipElements = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipElements.forEach(function(element) {
        new bootstrap.Tooltip(element);
    });

    // Auto-hide sidebar on window resize if window size is small
    // $(window).on('resize', function () {
    //     if ($(window).width() <= 768) {
    //         $('#sidebar, #body').addClass('active');
    //     }
    // });
})();

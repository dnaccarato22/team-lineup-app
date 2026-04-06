/*------------------------------------------------------------------
* Bootstrap Simple Admin Template
* Version: 3.0
* Author: Alexis Luna
* Website: https://github.com/alexis-luna/bootstrap-simple-admin-template
-------------------------------------------------------------------*/
(function() {
    'use strict';

    document.addEventListener("click", function(event) {
        const sidebarToggle = event.target.closest("#sidebarCollapse");

        if (!sidebarToggle) {
            return;
        }

        document.getElementById("sidebar")?.classList.toggle("active");
        document.getElementById("body")?.classList.toggle("active");
    });

    // Auto-hide sidebar on window resize if window size is small
    // $(window).on('resize', function () {
    //     if ($(window).width() <= 768) {
    //         $('#sidebar, #body').addClass('active');
    //     }
    // });
})();

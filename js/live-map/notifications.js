/* ============================================================
   UI
============================================================ */

function hideMapLoading() {


    document
        .getElementById(
            'map-loading'
        )
        .style.display =
        'none';

}



function showToast(message) {


    var toast =
        document
        .getElementById(
            'toast'
        );


    toast.innerText =
        message;


    toast.style.display =
        'block';


    setTimeout(

        function() {


            toast.style.display =
                'none';

        },

        2200

    );

}



/* ============================================================
   HTML SAFETY
============================================================ */

function escapeHTML(value) {


    if (
        value === null
        ||
        value === undefined
    ) {

        return '';

    }


    return String(value)

        .replace(
            /&/g,
            '&amp;'
        )

        .replace(
            /</g,
            '&lt;'
        )

        .replace(
            />/g,
            '&gt;'
        )

        .replace(
            /"/g,
            '&quot;'
        )

        .replace(
            /'/g,
            '&#039;'
        );

}

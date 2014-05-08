/* inject.js
 */

var host = null;
var login = null;
var password = null;
var port = null;

/* Listen for incoming connections from background.js.
 */
function listener(message) {
    if (message.command == "initialized") {
        if (message.initialized) {
            // If there is a running session, install a long-lived listener to
            // the background.js connection that handles all the subsequent
            // communication.
            chrome.runtime.onConnect.addListener(function(port) {
                port.onMessage.addListener(listener);
            });

            port.postMessage({command: "find", url: window.location.href});
        }

    } else if (message.command == "find") {
        // There were credentials found for the current tab.
        if (message.password) {
            host = message.host;
            login = message.login;
            password = message.password;

            console.log("passext: found host:%s login:%s password:%d chars", host, login, password.length);

            inject();

            // Adjust the right-click context menu.
            port.postMessage({command: "context", has_password: true, host: host, login: login, password: password.length});
        }

    } else if (message.command == "insert_username") {
        // Callback from the context menu, insert the username in the currently
        // active input element.
        document.activeElement.value = login;

    } else if (message.command == "insert_password") {
        // Callback from the context menu, insert the password in the currently
        // active input element.
        document.activeElement.value = password;

    } else if (message.command == "context") {
        // background.js ask if we have credentials here that it shall update
        // the context menu with.
        port.postMessage({command: "context", has_password: login !== null,
            host: host, login: login, password: password.length});

    } else if (message.command == "error") {
        console.error("error: " + message.message);

    } else {
        console.warn("unhandled background script message " + JSON.stringify(message));
    }
}

/* Initialize the content script and ask the background script if there is a
 * session currently running, otherwise we just return without doing anything.
 */
function initialize() {
    // Connect to background.js and install a short-lived listener, so that we
    // get the answer to the "initialized" request.
    port = chrome.runtime.connect();
    port.onMessage.addListener(listener);
    port.postMessage({command: "initialized"});
}

/* Go through all possible permutations of possible attributes and values in
 * order to find the login/username input field in the DOM. We don't use a
 * chained jquery selection here because we need case insensitve matching,
 * which jquery apparently does not provide with the *= selector.
 */
function find_login_input() {
    return $("input").filter(function() {
        var attrs = ["name", "id", "type"];
        var strings = ["user", "email", "name", "login"];
        for (var i = 0; i < attrs.length; i++) {
            var attr = $(this).attr(attrs[i]);
            if (attr === undefined)
                continue;
            attr = attr.toLowerCase();
            for (var j = 0; j < strings.length; j++) {
                var string = strings[j];
                if (attr.indexOf(string) > -1)
                    return true;
            }
        }
        return false;
    });
}

/* Inject our popup code into the DOM of the current page.
 */
function inject() {
    // Create a dummy div to inject popup.html into.
    $("body").append('<div id="popup_passext"></div>');

    // Load the popup.html code and position each popup alongside their
    // respective input elements.
    $("#popup_passext").load(chrome.extension.getURL("src/popup.html"), function() {
        // First find the password field.
        var elements = $('input[type="password"]');
        if (elements.length > 0) {
            var element = elements.first();
            var pos = element.offset();
            $("#popup_password").css({
                "left": pos.left + element.width() + 20,
                "top": pos.top
            });
            $("#popup_password").fadeIn();

            // On success, look for the login field.
            elements = find_login_input();
            if (elements.length > 0) {
                element = elements.first();
                pos = element.offset();
                $("#popup_login").css({
                    "left": pos.left + element.width() + 20,
                    "top": pos.top
                });
                $("#popup_login").fadeIn();
            }
        }
    });
}

/* Wait for the page to settle and initialize our content script.
 */
var readyStateCheckInterval = setInterval(function() {
    if (document.readyState === "complete") {
        clearInterval(readyStateCheckInterval);
        initialize();
    }
}, 10);

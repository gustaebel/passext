/* background.js
 */

var unlocked = false;
var timeout_id = null;

/* Set up the context menu which allows inserting the login name and password
 * into input fields other than the ones that were autodetected.
 */
function setupContextMenu(host, login, passlen) {
    var parentId = chrome.contextMenus.create(
        {contexts: ["editable"], title: host}
    );
    var childId1 = chrome.contextMenus.create(
        {contexts: ["editable"], title: 'Insert login name "' + login + '"', parentId: parentId, onclick:
            function(info, tab) {
                var port = chrome.tabs.connect(tab.id);
                port.postMessage({command: "insert_login"});
            }
        }
    );
    var childId2 = chrome.contextMenus.create(
        {contexts: ["editable"], title: "Insert password (" + passlen + " characters)", parentId: parentId, onclick:
            function(info, tab) {
                var port = chrome.tabs.connect(tab.id);
                port.postMessage({command: "insert_password"});
            }
        }
    );
}

function teardownContextMenu() {
    chrome.contextMenus.removeAll();
}

/* Unlock the private gpg key for the password store. This activates the
 * browser action icon, reloads the current tab and sets a timeout when the key
 * is locked again. This way the private gpg key passphrase has to be entered
 * only once at the start of the "session".
 */
function setup(reload) {
    chrome.runtime.sendNativeMessage("de.gustaebel.passext", {command: "setup"}, function(message) {
        chrome.browserAction.setIcon({path: "icons/icon19.png"});
        chrome.browserAction.setTitle({title: "active"});

        unlocked = true;

        // Check once every 15 seconds whether the password store is still unlocked.
        timeout_id = window.setInterval(check, 15000);

        if (reload) {
            reload_tab();
        }
    });
}

/* Lock the private gpg key for the password store.
 */
function teardown(reload) {
    chrome.runtime.sendNativeMessage("de.gustaebel.passext", {command: "teardown"}, function(message) {
        chrome.browserAction.setIcon({path: "icons/disabled19.png"});
        chrome.browserAction.setTitle({title: "inactive"});

        teardownContextMenu();

        unlocked = false;

        clearInterval(timeout_id);

        if (reload) {
            reload_tab();
        }
    });
}

/* Reload the current tab.
 */
function reload_tab() {
    chrome.tabs.query({active: true, windowType: "normal", currentWindow: true}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            // Do not reload e.g. chrome:// tabs.
            if (tab.url.search(/https?:\/\//) == 0) {
                chrome.tabs.reload(tab.id);
            }
        }
    });
}

/* Check whether the password store is still unlocked.
 */
function check() {
    chrome.runtime.sendNativeMessage("de.gustaebel.passext", {command: "unlocked"}, function(message) {
        if (!message.unlocked) {
            teardown(false);
        }
    });
}

/* Lock/unlock the private gpg key once the browser action icon is clicked.
 */
chrome.browserAction.onClicked.addListener(function(tab) {
    if (!unlocked) {
        setup(true);
    } else {
        teardown(true);
    }
});

/* Listen for connections from the content scripts that are running in the
 * tabs.
 */
chrome.runtime.onConnect.addListener(function(port) {
    port.onMessage.addListener(function(message) {
        if (message.command == "unlock") {
            port.postMessage({command: "unlocked", unlocked: unlocked});

        } else if (!unlocked) {
            port.postMessage({command: "error", message: "not unlocked"});

        } else if (message.command == "find" && unlocked) {
            chrome.runtime.sendNativeMessage("de.gustaebel.passext",
                { command: "find", url: message.url},
                function(message) {
                    message.command = "find";
                    port.postMessage(message);
            });

        } else if (message.command == "context") {
            if (message.has_password) {
                teardownContextMenu();
                setupContextMenu(message.host, message.login, message.password);
            }

        } else {
            console.warn("unhandled content script message " + JSON.stringify(message));
        }
    });
});

/* Reconfigure the context menu each time the active tab is changed.
 */
chrome.tabs.onActivated.addListener(function(activeInfo) {
    teardownContextMenu();

    var port = chrome.tabs.connect(activeInfo.tabId);
    port.postMessage({command: "context"});
});


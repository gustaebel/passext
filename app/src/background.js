/* background.js
 */

var initialized = false;
var gpg_agent = {pid: null, socket: null, expires: null};
var timeout_id = null;

/* Set up the context menu which allows inserting the username and password
 * into input fields other than the ones that were autodetected.
 */
function setupContextMenu(host, login, passlen) {
    var parentId = chrome.contextMenus.create(
        {contexts: ["editable"], title: host}
    );
    var childId1 = chrome.contextMenus.create(
        {contexts: ["editable"], title: 'Insert username "' + login + '"', parentId: parentId, onclick:
            function(info, tab) {
                var port = chrome.tabs.connect(tab.id);
                port.postMessage({command: "insert_username"});
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
    chrome.runtime.sendNativeMessage("de.gustaebel.passext", {command: "setup", pid: gpg_agent.pid, socket: gpg_agent.socket, expires: gpg_agent.expires},
    function(message) {
        gpg_agent.pid = message.pid;
        gpg_agent.socket = message.socket;
        gpg_agent.expires = message.expires;
        chrome.storage.local.set({gpg_agent_pid: message.pid, gpg_agent_socket: message.socket, gpg_agent_expires: message.expires});

        // XXX is there really no builtin way to zero-pad numbers?
        var date = new Date();
        date.setTime(gpg_agent.expires * 1000);
        var hours = date.getHours().toString();
        if (hours.length == 1)
            hours = "0" + hours;
        var minutes = date.getMinutes().toString();
        if (minutes.length == 1)
            minutes = "0" + minutes;

        chrome.browserAction.setIcon({path: "icons/icon19.png"});
        chrome.browserAction.setTitle({title: "active until " + hours + ":" + minutes});

        // Set an expiration timer so that the browser action icon is disabled just
        // before the gpg-agent (started by passext-host) forgets the passphrase.
        var now = new Date().getTime();
        timeout_id = window.setTimeout(teardown, (gpg_agent.expires * 1000) - now - 10000);
        initialized = true;

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

/* Lock the private gpg key for the password store.
 */
function teardown(reload) {
    chrome.runtime.sendNativeMessage("de.gustaebel.passext", {command: "teardown", pid: gpg_agent.pid, socket: gpg_agent.socket}, function(message) {
        chrome.browserAction.setIcon({path: "icons/disabled19.png"});
        chrome.browserAction.setTitle({title: "inactive"});

        teardownContextMenu();

        gpg_agent.pid = null;
        gpg_agent.socket = null;
        gpg_agent.expires = null;
        chrome.storage.local.remove(["gpg_agent_pid", "gpg_agent_socket", "gpg_agent_expires"]);

        if (reload) {
            reload_tab();
        }

        initialized = false;
    });
}

/* Lock/unlock the private gpg key once the browser action icon is clicked.
 */
chrome.browserAction.onClicked.addListener(function(tab) {
    if (!initialized) {
        setup(true);
    } else {
        clearTimeout(timeout_id);
        teardown(true);
    }
});

/* Listen for connections from the content scripts that are running in the
 * tabs.
 */
chrome.runtime.onConnect.addListener(function(port) {
    port.onMessage.addListener(function(message) {
        if (message.command == "initialized") {
            port.postMessage({command: "initialized", initialized: initialized});

        } else if (!initialized) {
            port.postMessage({command: "error", message: "not initialized"});

        } else if (message.command == "find") {
            chrome.runtime.sendNativeMessage("de.gustaebel.passext",
                { command: "find", url: message.url, pid: gpg_agent.pid, socket: gpg_agent.socket},
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

/* Initialize the background script. Synchronize the running "session" with
 * passext-host, i.e.  if a gpg-agent is already running the browser action
 * icon will already be unlocked.
 */
chrome.runtime.onInstalled.addListener(function() {
    initialized = false;

    // Fetch the configuration of the currently running gpg-agent from the
    // browser storage. passext-host is questioned about whether this gpg-agent
    // is still active. If not it implicitly starts a new instance.
    chrome.storage.local.get(["gpg_agent_pid", "gpg_agent_socket", "gpg_agent_expires"], function(items) {
        if ("gpg_agent_pid" in items) {
            gpg_agent.pid = items["gpg_agent_pid"];
            gpg_agent.socket = items["gpg_agent_socket"];
            gpg_agent.expires = items["gpg_agent_expires"];
        }
        chrome.runtime.sendNativeMessage("de.gustaebel.passext", {command: "running", pid: gpg_agent.pid, socket: gpg_agent.socket}, function(message) {
            // Unlock the browser action icon only if there is already
            // a running session.
            if (message.running)
                setup(false);
        });
    });
});


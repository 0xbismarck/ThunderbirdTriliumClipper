///////////////////////////////////////////////////////////////////////////////
//
// Code for the Thunderbird add-on Trilium Clipper.
//
// TriliumClipper is an add-on for the Thunderbird email client that lets a
// user clip messages to the Trilium notetaking application. Both
// applications are open source and free to use, just like this add-on!
//
// Project hosted at https://github.com/0xbismarck/ThunderbirdTriliumClipper
//
// Original code written by Kevin Haw. http://www.KevinHaw.com and forked
// by 0xBismarck. https://github.com/0xbismarck
//
// Released under the Mozilla Public Licence.
// See https://github.com/0xbismarck/ThunderbirdTriliumClipper/blob/main/LICENSE
//
// popup.js - Code for the Obsidian Clipper add-on for Thunderbird
// to save a selected mail message .//
///////////////////////////////////////////////////////////////////////////////

// Map of the menu button IDs to the clip mode sent to background.js
const clipModeButtons = {
    "clip-plaintext":   "plaintext",
    "clip-html":        "html",
    "clip-both":        "both",
};

// Function to request a clip of the displayed message in the given mode.
async function requestClip(clipMode) {
    console.log("popup.js: requesting clip in '" + clipMode + "' mode");

    // Disable the menu so an impatient user cannot clip the same message twice.
    for (const buttonId in clipModeButtons) {
        document.getElementById(buttonId).disabled = true;
    }

    // Get the active tab in the current window using the tabs API.
    let tabs = await messenger.tabs.query({ active: true, currentWindow: true });

    // User has hit the button - request a clip of the message via "cliprequest" command.
    await browser.runtime.sendMessage({
        command: "cliprequest",
        tabId: tabs[0].id,
        clipMode: clipMode
    });

    // Clip is underway and reports its own progress on the status line, so
    // close the popup to get it out of the user's way.
    window.close();
}


///////////////////////
// Main execution path
///////////////////////

// Set up event listeners for each of the clip mode buttons.
for (const buttonId in clipModeButtons) {
    document.getElementById(buttonId).onclick = function() {
        requestClip(clipModeButtons[buttonId]);
    };
}

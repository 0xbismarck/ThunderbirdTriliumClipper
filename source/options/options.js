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
// options.js - Handle Options tab for Trilium Clipper add-on for Thunderbird.
//
///////////////////////////////////////////////////////////////////////////////


/* generic error handler */
function onError(error) {
  console.log("options.js: " + error);
}


///////////////////////////////////////////////////////////////
// DEBUG: Start with a clean slate when testing add-on...
// console.log("DEBUG: Clearing local store values for testing...");
//
// browser.storage.local.clear();
//
///////////////////////////////////////////////////////////////

// Set up array of default parameters for each HTML field.
// remember to assign listeners to any new field (below)
var defaultParameters = [];
defaultParameters["attachmentSaveEnabled"] = false;
defaultParameters["attachmentStorageMode"] = "attachment";
defaultParameters["noteFilenameTemplate"] = "Email (_MSGDATE) : _MSGSUBJECT";
defaultParameters["noteContentTemplate"] = 
    "Created: _NOTEDATE, _NOTETIME\n" +
    "Subject: _MSGSUBJECT\n" +
    "Message Date: _MSGDATE, _MSGTIME\n" +
    "Author: _MSGAUTHOR\n" +
    "Recipients: _MSGRECIPENTS\n" +
    "CC: _MSGCC\n" +
    "BCC: _MSGBCC\n" +
    "Attachments: _MSGATTACHMENTLIST\n" +
    "_MSGIDURI\n\n" +
    "---\n\n" +
    "_MSGCONTENT";
    
defaultParameters["defaultClipMode"] = "ask";
defaultParameters["htmlClippingEnabled"] = true;
defaultParameters["maxEmailSize"] = "Disabled";
defaultParameters["triliumdb"]  = "http://localhost:37840/etapi";
defaultParameters["triliumUser"] = "etapi";
defaultParameters["triliumToken"] = "[ETAPI Token]";
defaultParameters["parentNoteId"] = ""
defaultParameters["messageLinkText"] = "Click to open message in email client"

// Store the data to local storage with the given key
function parameterStore(key, value) {
    storeLocal = browser.storage.local.set({ [key] : value });
    storeLocal.then(() => {
        console.log("parameterStore: Stored parameter [" + key + ", " + value + "] success");  // Huh? Not seeing this on console, but appears to work.
    }, onError);
}

// Store the contents of an options field to local storage.
// The parameter name is the id field of the HTML <input>.
//
// For radio buttons, call storeOption() on all the component buttons so 
// all the set and unset buttons get processed.
function storeOption(id) {
    // Read the options field
    var elem = document.getElementById(id);
    
    console.log("storeOption: id=" + id + " elem.type = " + elem.type);
    
    // Did we find option by ID?
    if(typeof elem !== 'undefined' && elem !== null) {
        
        if(elem.type == "checkbox") {
            // Unlike text fields, read boolean to see if checkboxes are set or cleared
            parameterStore(id, elem.checked);
        } else if(elem.type == "radio") {
            // Store parameter for this one radio button option.
            parameterStore(id, elem.checked);
            
        } else {
            // Read field
            parameterStore(id, elem.value);
        }
    }
    else {

        console.log("storeOption("+id+") ERROR: typeof elem == " + typeof elem + "elem == " + elem);
    }
}


// Store the default value of an option to local storage
function storeDefault(id) {
    defaultValue = defaultParameters[id];
    
    // Is element in the array of default values?
    if(undefined != defaultValue) {
        // There is an entry - save this default value away.
        console.log("storeDefault("+id+") storing default value of "+defaultValue);
        parameterStore(id, defaultValue);
    } else {
        console.log("ERROR: storeDefault("+id+") can't find a default value");
    }
}

function loadOptionsFields(storedParameters)
{
    // Loop through list of expected parameters to set the fields
    for(key in defaultParameters) {
        fieldContent = "";
        if(storedParameters[key] == undefined) {
            console.log("loadOptionsFields: Parameter ["+key+"] not found. Using default value \"" + defaultParameters[key] +"\'");
            
            // Save field content
            fieldContent =  defaultParameters[key];  // Save filed content
            
            // Store default parameter
            parameterStore(key, fieldContent);
            
        } else  {
            console.log("loadOptionsFields: Parameter ["+key+"] found. Using value \"" + storedParameters[key] +"\'");
            
            // Save field content
            fieldContent =  storedParameters[key];  
        }
        
        // Now set the field's value on the options webpage.
        var elem = document.getElementById(key);
        if(typeof elem !== 'undefined' && elem !== null) {
            if(elem.type == "checkbox") {
                // Unlike text fields, use a boolean to set/clear checkboxes
                elem.checked = fieldContent;
            } else if(elem.type == "radio") {
                // Record the check
                elem.checked = fieldContent;
            } else {
                // Set field to the indicated string
                elem.value = fieldContent;
            }
        }
    }
}


/////////////////////////////
// Trilium host permission
/////////////////////////////

// Function to turn the configured Trilium URL into a match pattern covering just
// that host. Returns "" if the URL cannot be read.
function triliumOriginPattern(triliumdb) {

    // Catch the error thrown by URL() when the configured address is not a URL.
    try {
        let triliumUrl = new URL(triliumdb);
        return triliumUrl.protocol + "//" + triliumUrl.host + "/*";
    } catch(e) {
        onError("triliumOriginPattern - " + e);
    }

    return "";
}


// Function to show whether the add-on may contact the configured Trilium server.
// The URL is read from the page rather than from storage so that the status
// describes the same address the Grant Access button asks about.
async function refreshTriliumHostPermissionStatus() {
    var elem = document.getElementById("triliumHostPermissionStatus");
    if((typeof elem === 'undefined') || (elem === null)) {
        return;
    }

    let originPattern = triliumOriginPattern(document.getElementById("triliumdb").value);
    if("" == originPattern) {
        elem.innerText = "The Trilium URL above is not a valid address.";
        return;
    }

    if(await browser.permissions.contains({ origins: [originPattern] })) {
        elem.innerText = "Granted for " + originPattern;
    } else {
        elem.innerText = "Not granted for " + originPattern;
    }
}


// Function to ask for access to the configured Trilium server. This is called
// from a button press, because asking for a permission needs a user action.
// Note that this reads the Trilium URL from the page rather than from storage.
// Asking for a permission only works while handling a user's click, and any
// await before the request ends that, leaving the request silently refused.
function requestTriliumHostPermission() {
    let originPattern = triliumOriginPattern(document.getElementById("triliumdb").value);

    if("" == originPattern) {
        refreshTriliumHostPermissionStatus();
        return;
    }

    // Catch any errors thrown by request()
    try {
        // Call request() directly, without awaiting anything first, so the click
        // is still in progress and Thunderbird shows the prompt.
        browser.permissions.request({ origins: [originPattern] }).then(
            function() { refreshTriliumHostPermissionStatus(); },
            function(e) { onError("requestTriliumHostPermission - " + e); }
        );
    } catch(e) { onError("requestTriliumHostPermission - " + e); }
}


///////////////////////
// Main execution path
///////////////////////

// Set up event listeners for option buttons.

// Saving a new Trilium URL changes the host that access is needed for, so update
// the permission status alongside it.
document.getElementById('submit-triliumdb').onclick = function() {storeOption("triliumdb"); refreshTriliumHostPermissionStatus(); };
document.getElementById('default-triliumdb').onclick = function() {storeDefault("triliumdb"); refreshTriliumHostPermissionStatus(); };

document.getElementById('submit-triliumToken').onclick = function() {storeOption("triliumToken"); };
document.getElementById('default-triliumToken').onclick = function() {storeDefault("triliumToken"); };

document.getElementById('submit-parentNoteId').onclick = function() {storeOption("parentNoteId"); };
document.getElementById('default-parentNoteId').onclick = function() {storeDefault("parentNoteId"); };


document.getElementById('submit-attachmentSaveEnabled').onclick = function() {storeOption("attachmentSaveEnabled"); };
document.getElementById('default-attachmentSaveEnabled').onclick = function() {storeDefault("attachmentSaveEnabled"); };

document.getElementById('submit-attachmentStorageMode').onclick = function() {storeOption("attachmentStorageMode"); };
document.getElementById('default-attachmentStorageMode').onclick = function() {storeDefault("attachmentStorageMode"); };

document.getElementById('submit-defaultClipMode').onclick = function() {storeOption("defaultClipMode"); };
document.getElementById('default-defaultClipMode').onclick = function() {storeDefault("defaultClipMode"); };

document.getElementById('submit-htmlClippingEnabled').onclick = function() {storeOption("htmlClippingEnabled"); };
document.getElementById('default-htmlClippingEnabled').onclick = function() {storeDefault("htmlClippingEnabled"); };

document.getElementById('submit-noteFilenameTemplate').onclick = function() {storeOption("noteFilenameTemplate"); };
document.getElementById('default-noteFilenameTemplate').onclick = function() {storeDefault("noteFilenameTemplate"); };

document.getElementById('submit-messageLinkText').onclick = function() {storeOption("messageLinkText"); };
document.getElementById('default-messageLinkText').onclick = function() {storeDefault("messageLinkText"); };

document.getElementById('submit-noteContentTemplate').onclick = function() {storeOption("noteContentTemplate"); };
document.getElementById('default-noteContentTemplate').onclick = function() {storeDefault("noteContentTemplate"); };

document.getElementById('submit-maxEmailSize').onclick = function() {storeOption("maxEmailSize"); };
document.getElementById('default-maxEmailSize').onclick = function() {storeDefault("maxEmailSize"); };

document.getElementById('grant-triliumHostPermission').onclick = function(clickEvent) {
    // Stop the button from submitting the form it sits in, which would reload the page
    // and throw away the permission prompt.
    clickEvent.preventDefault();
    requestTriliumHostPermission();
};

// Get the stored parameters and pass them to a function to populate fields. The
// permission status is shown afterwards, because it reads the Trilium URL from
// the field that loadOptionsFields() fills in.
browser.storage.local.get(null).then(function(storedParameters) {
    loadOptionsFields(storedParameters);
    refreshTriliumHostPermissionStatus();
}, onError);





///////////////////////////////////////////////////////////////////////////////
//
// Code for the Thunderbird add-on Obsidian Clipper.
//
// ObsidianClipper is an add-on for the Thunderbird email client that lets a 
// user clip messages to the Obsidian notetaking application. Both 
// applications are open source and free to use, just like this add-on!
//
// Project hosted at https://github.com/KNHaw/ThunderbirdObsidianClipper
//
// Code written by Kevin Haw. http://www.KevinHaw.com
//
// Released under the Mozilla Public Licence. 
// See https://github.com/KNHaw/ThunderbirdObsidianClipper/blob/main/LICENSE
//
// options.js - Handle Options tab for Obsidian Clipper add-on for Thunderbird.
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
defaultParameters["attachmentFolderPath"] = "ClippedEmails/_resources";
defaultParameters["attachmentSaveEnabled"] = false;
defaultParameters["noteFilenameTemplate"] = "Email (_MSGDATE) : _MSGSUBJECT";
defaultParameters["noteContentTemplate"] = 
    "Created: _NOTEDATE, _NOTETIME\n" +
    "Subject: _MSGSUBJECT\n" +
    "Message Date: _MSGDATE, _MSGTIME\n" +
    "Author: _MSGAUTHOR\n" +
    "Recipients: _MSGRECIPENTS\n" +
    "CC: _MSGCC\n" +
    "BCC: _MSGBCC\n" +
    // "Attachments: _MSGATTACHMENTLIST\n" +
    "_MSGIDURI\n\n" +
    "---\n\n" +
    "_MSGCONTENT";
    
defaultParameters["unicodeCharSub"] = true;
defaultParameters["htmlClippingEnabled"] = true;
defaultParameters["subSpacesWithUnderscores"] = false;
defaultParameters["additionalDisallowedChars"] = "[]#^";
defaultParameters["noteNameReplaceChar"] = "-";
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


///////////////////////
// Main execution path
///////////////////////

// Set up event listeners for option buttons.

document.getElementById('submit-triliumdb').onclick = function() {storeOption("triliumdb"); };
document.getElementById('default-triliumdb').onclick = function() {storeDefault("triliumdb"); };

document.getElementById('submit-triliumToken').onclick = function() {storeOption("triliumToken"); };
document.getElementById('default-triliumToken').onclick = function() {storeDefault("triliumToken"); };

document.getElementById('submit-parentNoteId').onclick = function() {storeOption("parentNoteId"); };
document.getElementById('default-parentNoteId').onclick = function() {storeDefault("parentNoteId"); };


// As a radio button array, attachment save mode submits/defaults all three buttons at once.
// document.getElementById('submit-attachmentSaveEnabled').onclick = function() {storeOption("attachmentSaveEnabled"); };    
// document.getElementById('default-attachmentSaveEnabled').onclick = function() {storeDefault("attachmentSaveEnabled"); };

// document.getElementById('submit-attachmentFolderPath').onclick = function() {storeOption("attachmentFolderPath"); };
// document.getElementById('default-attachmentFolderPath').onclick = function() {storeDefault("attachmentFolderPath"); };

document.getElementById('submit-htmlClippingEnabled').onclick = function() {storeOption("htmlClippingEnabled"); };
document.getElementById('default-htmlClippingEnabled').onclick = function() {storeDefault("htmlClippingEnabled"); };

document.getElementById('submit-noteFilenameTemplate').onclick = function() {storeOption("noteFilenameTemplate"); };
document.getElementById('default-noteFilenameTemplate').onclick = function() {storeDefault("noteFilenameTemplate"); };

document.getElementById('submit-messageLinkText').onclick = function() {storeOption("messageLinkText"); };
document.getElementById('default-messageLinkText').onclick = function() {storeDefault("messageLinkText"); };

document.getElementById('submit-noteContentTemplate').onclick = function() {storeOption("noteContentTemplate"); };
document.getElementById('default-noteContentTemplate').onclick = function() {storeDefault("noteContentTemplate"); };

document.getElementById('submit-unicodeCharSub').onclick = function() {storeOption("unicodeCharSub"); };
document.getElementById('default-unicodeCharSub').onclick = function() {storeDefault("unicodeCharSub"); };

document.getElementById('submit-subSpacesWithUnderscores').onclick = function() {storeOption("subSpacesWithUnderscores"); };
document.getElementById('default-subSpacesWithUnderscores').onclick = function() {storeDefault("subSpacesWithUnderscores"); };

document.getElementById('submit-additionalDisallowedChars').onclick = function() {storeOption("additionalDisallowedChars"); };
document.getElementById('default-additionalDisallowedChars').onclick = function() {storeDefault("additionalDisallowedChars"); };

document.getElementById('submit-noteNameReplaceChar').onclick = function() {storeOption("noteNameReplaceChar"); };
document.getElementById('default-noteNameReplaceChar').onclick = function() {storeDefault("noteNameReplaceChar"); };

document.getElementById('submit-maxEmailSize').onclick = function() {storeOption("maxEmailSize"); };
document.getElementById('default-maxEmailSize').onclick = function() {storeDefault("maxEmailSize"); };

// Get the stored parameters and pass them to a function to populate fields.
browser.storage.local.get(null).then(loadOptionsFields, onError);





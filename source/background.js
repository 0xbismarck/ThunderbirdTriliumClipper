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
// Background.js - Main execution path
//
///////////////////////////////////////////////////////////////////////////////


console.log("DEBUG - background.js is running!!!");

// Global constants
const STATUSLINE_PERSIST_MS = 10000;    // Delete status line messgaes after indicated time

// Global, persistant variables.
var latestMsgDispTab = 1;       // Latest tab recorded on an incoming onMessageDisplay event. Used for later reference.
var plainTextMessageBody = "";  // Plain text of clipped message body
var htmlMessageBody = "";       // HTML of clipped message body

// Table used to substitute reserved characters with Unicode equivilents
    const unicodeSubs = {
        '|':        '\u2223',   // Mathamatical OR operator U+2223
        '/':        '\u29F8',   // Big solidus U+29F8
        '\u005c':   '\u29F9',   // Big reverse solidus U+29F9
        '"':        '\u201C',   // Curved opening quote U+201C
        '<':        '\u02C2',   // Unicode less than U+02C2
        '>':        '\u02C3',   // Unicode greater than U+02C2
        '*':        '\u2217',   // Asterisk operator U+2217 
        ':':        '\uA789',   // Letter colon U+A789
        '?':        '\u0294',   // Glottal stop U+0294
        '[':        '\uFF3B',   // U+FF3B Fullwidth Left Square Bracket 
        ']':        '\uFF3D',   // U+FF3D Fullwidth Right Square Bracket 
        '^':        '\uFF3E',   // U+FF3E Fullwidth Caret
        '#':        '\uFF03',   // U+FF03 Fullwidth Number Sign 
        '{':        '\uFF5B',   // U+FF5B Fullwidth Left Curly Bracket
        '}':        '\uFF5D',   // U+FF5D Fullwidth Right Curly Bracket
        '~':        '\uFF5E',   // U+FF5E Fullwidth Tilde
        '`':        '\uFF40',   // U+FF40 Fullwidth Backtick
        '@':        '\uFF20',   // U+FF20 Fullwidth Commercial At
        '=':        '\uFF1D',   // U+FF1D Fullwidth Equals Sign
        ';':        '\uFF1B',   // U+FF1B Fullwidth Semicolon
        '+':        '\uFF0B',   // U+FF0B Fullwidth Plus Sign
        '\'':       '\uFF07',   // U+FF07 Fullwidth Apostrophe
        '%':        '\uFF05',   // U+FF05 Fullwidth Percent Sign
        '&':        '\uFF06',   // U+FF06 Fullwidth Amperstand
        '!':        '\uFF01',   // U+FF01 Fullwidth Exclamation Mark
        '(':        '\uFF08',   // U+FF08 Fullwidth Left Parenthesis
        ')':        '\uFF09',   // U+FF09 Fullwidth Right Parenthesis
    };
    

///////////////////////////
// Utility functions
///////////////////////////

// Generic error handler
function onError(error, context="") {
    if("" == context) {
        console.error("background.js: " + error);
    } else {
        console.error("background.js: " + error + " (" + context + ")");
    }
        
}

// Function to post an alert to the user
// NOTE: Do not pass escaped quotes in messageString as they can hose the executeScrpt()
async function displayAlert(messageString) {

    let retVal = "";
    console.log("displaying alert \"" + messageString + "\" in tab " + latestMsgDispTab);
    
    // Also put message on status line
    displayStatusText(messageString);
    
    // Catch any errors thrown by executeScript()
    try {    
      const onelinecommand = 'alert(' + '"' + messageString + '");';
      retVal = await browser.tabs.executeScript(latestMsgDispTab, { code: onelinecommand, });
    } catch(e) { onError(e, ("displayAlert - " + messageString)); }
    
    return retVal;
}


// Function to post an confirmation dialog to the user.
// Returns true if user selected OK and false on CANCEL.
// NOTE: Do not pass escaped quotes in messageString as they can hose the executeScrpt()
async function displayConfirm(messageString) {
    var retval ="";
    
    console.log("displaying confirm dialog \"" + messageString + "\" in tab " + latestMsgDispTab);
    const onelinecommand = 'confirm(' + '"' + messageString + '");';
    
    // Catch any errors thrown by executeScript()
    try {    
        // Run the confirmation dialog.
        retArray = await browser.tabs.executeScript(latestMsgDispTab, { code: onelinecommand, });
        retval = retArray[0];
    } catch(e) { onError(e, ("displayConfirm - " + messageString)); }
    
    // Return the response
    return retval;
}


// Function to display clip status
// NOTE: Do not pass escaped quotes in messageString as they can hose the executeScrpt()
async function displayStatusText(messageString) {
    console.log("displaying status text \"" + messageString + "\" in tab " + latestMsgDispTab);
    
    // Catch any errors thrown by executeScript()
    try {    
        // First, inject script to create a DIV text element in the message content tab
        // where we can post text.
        await browser.tabs.executeScript(latestMsgDispTab, {
          file: "/statusLine/statusLine-script.js"
        });
        
        // Post the text to the innerText of the created DIV.
        const onelinecommand = 'document.getElementById("status-line-text").innerText = ' + '"' + messageString + '";';
            await browser.tabs.executeScript(latestMsgDispTab, { code: onelinecommand, });
        
        // Schedule status line for removal after a given time.
        setTimeout(deleteStatusLine, STATUSLINE_PERSIST_MS, latestMsgDispTab);
    } catch(e) { onError(e, ("displayStatusText - " + messageString)); }

}

// Function to remove the status message after clip completion
function deleteStatusLine(tabId) {
    
    // Catch any errors thrown by executeScript()
    try {    
        // Delete the status line DIV we have used for posting updates.
        //const onelinecommand = 'document.getElementById("status-line").remove();';
        const onelinecommand = 'var el = document.getElementById("status-line"); if(el != undefined) {el.remove();}';
        browser.tabs.executeScript(tabId, { code: onelinecommand, });
    } catch(e) { onError(e, ("deleteStatusLine - " + tabId)); }

}

// Function to read any selected text in an email in a given tab. Returns string of that text
// or empty string 
async function readTextSelection(tabId) {
    
    var retVal = "";
    
    // Catch any errors thrown by executeScript()
    try {    
        const onelinecommand = 'window.getSelection().toString();';
        var result = await browser.tabs.executeScript(tabId, { code: onelinecommand, });
        
        // Return any text selected.
        retVal = result[0];
        console.log("DEBUG: readTextSelection returns \"" + retVal + "\"");
        //return(result[0]);
    } catch(e) { onError(e, ("readTextSelection - " + tabId)); }
    
    return retVal;
    
}


/////////////////////////////
// Attachments Configuration
/////////////////////////////

// Function to clip and save a message's attachments.
// Returns a string suitable for the _MSGATTACHMENTLIST field. Either a newline and list
// of attachments in the vault or "none" if no attachments on the message.
// Note that attachmentFolderPath must be an absolute position in the vault and begin with "/"
async function saveAttachments(messageId, attachmentFolderPath,
    attachmentSaveEnabled, contentIdToFilenameMap) {
    
    var attachmentList = "";        // Returned markdown formatted list
    var attachmentCount = 0;        // Count attachments as they're saved
    var attachmentCountTotal = 0;   // Total count of attachments in this mail message
    
    // Get attachments
    let attachments = await browser.messages.listAttachments(messageId);
    attachmentCountTotal = attachments.length;  // Count, starting from one instead of zero
    
    // Process the attachments
    if(false == attachmentSaveEnabled){
        // No attachments. Return "none"
        attachmentList = "none";
    } else {
        
        // Step through the attachments
        for (let att of attachments) {
            // Get the attached file.
            let file = await browser.messages.getAttachmentFile(messageId, att.partName);
            let filename = file.name;
            let fileType = file.type;
            let contentId = att.contentId;  // Optional field - be sure to verify it exists before use
            
            console.log("Getting attachment " + filename + ", type " + fileType);
            
            let flobUrl = URL.createObjectURL(file);
            
            var imgId = await browser.downloads.download({
              url: flobUrl,
              filename: filename,
              conflictAction: "uniquify",
              saveAs:false
            });
            
            // Check to see if the write operation worked.
            let fileDownloadStatus = await browser.downloads.search({id:imgId});
            // TODO - throw error on download fail.

            console.log("Downloaded attachment " + fileDownloadStatus[0].filename);
            
            // To find the filename, take the full file path of the attachment and (if needed) convert it 
            // to a UNIX-like path (slashes instead of backslashes). Then take the last part of it.
            let fileNameAsWritten = fileDownloadStatus[0].filename.replaceAll(/\\/g, "/").split("/").pop();
            
            // Log file as saved
            attachmentCount = attachmentCount + 1;
            var attachmentSaveSuccessMsg = "Saved attachment file '"+ filename + "' (" + attachmentCount + " of " + attachmentCountTotal + ")";
            console.log(attachmentSaveSuccessMsg);
            await displayStatusText(attachmentSaveSuccessMsg);
            
            // Append link to attachment file list
            attachmentList += "\n - [" + fileNameAsWritten + "](" + attachmentFolderPath + "/" + fileNameAsWritten + ")";
            
            // If the content ID field is used, map the content ID to the file path
            if(contentId) {
                contentIdToFilenameMap[contentId] = attachmentFolderPath + "/" + fileNameAsWritten;
                }
            
            }
    }
    
    // If no attachments clipped, correct list to read "none"
    if("" == attachmentList) {
        attachmentList = "none";
    }
    
    // Report completed number of attachments
    return attachmentList;
}




///////////////////////////
// Mail clipping functions
///////////////////////////

// Function to replace a reserved character with its Unicode equivilent or default replacement
function replaceUnicodeChar(c, defaultReplace="") {
    let newChar = unicodeSubs[c];
    
    // If Unicode match not found, return default replacement character
    if(newChar == undefined) {
        newChar = defaultReplace;
    }
    
    return newChar;
}


// Function to extract text from a message object (specifically, a messagePart object),
// then recurse through any part[] arrays beneath that for more text.
function buildMessageBody(msgPart, maxEmailSize, contentIdToFilenameMap)
{
    console.log("background.js - buildMessageBody -  msgPart.contentType=" +  msgPart.contentType);
        
    // See if there's HTML content
    if (typeof msgPart.body !== 'undefined' && msgPart.contentType == "text/html") {
            htmlMessageBody = htmlMessageBody + msgPart.body;
        }
    // If no HTML, see if there's plaintext
    else if (typeof msgPart.body !== 'undefined' && msgPart.contentType == "text/plain") {
            plainTextMessageBody = plainTextMessageBody + msgPart.body;
        }
        
    // Is there a parts[] array?
    if(typeof msgPart.parts !== 'undefined') {
        // Loop through all elements of the parts[] array
        for (let i = 0; i < msgPart.parts.length; ++i) {
            // For each of those elements, add element's .body, if it exists
            buildMessageBody(msgPart.parts[i], maxEmailSize, contentIdToFilenameMap);
        }
    }
    
    // Do we need to crop the email text? Check for plain text first.
    if (plainTextMessageBody.length > maxEmailSize) {
        plainTextMessageBody = plainTextMessageBody.substr(1, maxEmailSize);
        plainTextMessageBody = plainTextMessageBody + "\n\n\n ========= Plain text Email cropped after " + maxEmailSize + " bytes ========= \n";
    }
    
    // Now check for HTML text size.
    if (htmlMessageBody.length > maxEmailSize) {
        htmlMessageBody = htmlMessageBody.substr(1, maxEmailSize);
        htmlMessageBody = htmlMessageBody + "\n\n\n ========= HTML Email cropped after " + maxEmailSize + " bytes ========= \n";
    }
}

// Function to get "to," "cc," and "bcc" fields of an email and format them as requested.
function getRecipients(msg, field, yamlFormat=false)
{
    let recipientArray = "";
    let messageRecipients = "";
    
    // Get the correct array of recipents.
    if(field == "to") {
        recipientArray = msg.recipients;
    } else if (field == "cc") {
        recipientArray = msg.ccList;
    } else if (field == "bcc") {
        recipientArray = msg.bccList;
    } else {
        // Not a match - throw an error
        console.log("getRecipients() error - unrecognized field "+ field);
        return "";
    }
    
    // Now, build a list of recipients based on user request
    if(yamlFormat == false) {
        // Build comma delimited list of recipients from message
        if(recipientArray.length == 0) {
            messageRecipients = "None Listed";
        }
        else {
            for (let index = 0; index < recipientArray.length; ++index) {
                // Add commas if we have a multi recipent list
                if(index > 0) {
                    messageRecipients = messageRecipients + ", ";
                }
                
                // Add next recipient
                const nextRecipient = recipientArray[index];
                messageRecipients = messageRecipients + nextRecipient;
            }
        }
    } else {
        // Build a YAML formatted list of recipients from message
        if(recipientArray.length == 0) {
            messageRecipients = "";
        }
        else {
            for (let index = 0; index < recipientArray.length; ++index) {
                
                // Add next recipient to the list. Replace quotes with backslashed quotes, per YAML specification.
                const nextRecipient = recipientArray[index].replaceAll('\"', '\\"');
                
                // Make a new line with 
                messageRecipients = messageRecipients + "\n- \"" + nextRecipient + "\"";
            }
        }
    }
    
    return messageRecipients;
}


// Function to actually clip the email. Pass in the saved array of parameters.
async function clipEmail(storedParameters)
{
    // Read the passed parameters that configure the app.
    let triliumdb = "";
    let triliumToken = "";
    let triliumParentNoteId = ""
    let noteTitleTemplate = "";
    let noteTemplate = "";
    let attachmentFolderPath = "";
    let attachmentSaveEnabled = false;
    let htmlClippingEnabled = true;
    let maxEmailSize = Number.MAX_SAFE_INTEGER;
    let messageLinkText = ""
    // Log that we're clipping the message
    await displayStatusText("TriliumNextClipper: Clipping message.");
    
    // Get the active tab in the current window using the tabs API.
    let tabs = await messenger.tabs.query({ active: true, currentWindow: true });
    
    // Check stored parameters - test  options that cause fatal errors if not present
    if( (storedParameters["noteFilenameTemplate"] == undefined) ||
        (storedParameters["noteContentTemplate"] == undefined) || 
        (storedParameters["triliumdb"] == undefined) || 
        (storedParameters["parentNoteId"] == undefined)) {
            // Warn user that add-on needs configuring.
            await displayAlert("ERROR: Please configure TriliumClipper on its Options page before using.  " +
                "Look in Settings->Add-ons Manager->Trilium Clipper->Options tab");
            return;
        } else {
            // Load parameters from storage
            noteTitleTemplate = storedParameters["noteFilenameTemplate"];
            noteTemplate = storedParameters["noteContentTemplate"];
            attachmentFolderPath = storedParameters["attachmentFolderPath"];
            attachmentSaveEnabled = storedParameters["attachmentSaveEnabled"];
            maxEmailSize = storedParameters["maxEmailSize"];
            htmlClippingEnabled = storedParameters["htmlClippingEnabled"];
            triliumdb = storedParameters["triliumdb"];
            triliumToken = storedParameters["triliumToken"];
            triliumParentNoteId = storedParameters["parentNoteId"];
            messageLinkText = storedParameters["messageLinkText"]

            // Correct any parameters the won't cause fatal errors when missing
            // by giving them default values.
            if(undefined == attachmentFolderPath) {attachmentFolderPath = "";}
            
            // Correct any parameters requiring additional processing
            if((undefined == maxEmailSize) || (NaN == parseInt(maxEmailSize))){            
                maxEmailSize = Number.MAX_SAFE_INTEGER;     // Set no limit
            } else {
                maxEmailSize = parseInt(maxEmailSize);      // Set user defined limit
            }
        }
    
    // Get the message currently displayed in the active tab, using the
    // messageDisplay API. Note: This needs the messagesRead permission.
    // The returned message is a MessageHeader object with the most relevant
    // information.
    let message = await messenger.messageDisplay.getDisplayedMessage(tabs[0].id);
    
    // Request the full message to access its full set of headers.
    let full = await messenger.messages.getFull(message.id);

    // Extract data from the message headers
    let messageSubject = message.subject;
    let messageDate = message.date.toLocaleDateString();
    let messageTime = message.date.toLocaleTimeString();
    let messageAuthor = message.author;
    
    // Create a mail "mid:" URI with the message ID
    // TODO: Put in template subsitition so it's only processed if used
    let messageIdUri = "mid:" + message.headerMessageId;        // Create a mail "mid:" URI with the message ID
    messageIdUri = "<a href=\"" + messageIdUri + "\">" + messageLinkText + "</a>"
    // // Build the message tag list that reflects how the email was tagged.
    // // TODO: Put in a function so it's not processed if not used
    // let messageTagList = "#email";
    // if(undefined != message.tags) {
    //     // Get a master list of tags known by Thunderbird
    //     let knownTagArray = await messenger.messages.listTags();
        
    //     // Loop through the tags on the email and find any matches
    //     for (var currMsgTagKeyString of message.tags) {
    //         // Check for a match of the email's tag against the master list.
    //         // Note that we're testing ".key" values here. Human readable strings are processed after a match.
    //         var matchingTagEntry = knownTagArray.find((t) => t.key == currMsgTagKeyString);
    //         if(undefined != matchingTagEntry) {
    //             // We have a match. Take the human readable string, replace spaces, and add a hashtag.
    //             var tagText = " #" + matchingTagEntry.tag.replaceAll(' ', '-');
                
    //             // Add tag to the tag list
    //             messageTagList = messageTagList + tagText;
    //         }
    //     }
    // }
    // console.log("MSG Tag List - " + messageTagList)
    
    // Save message attachments and get a markdown list with links to them and a map of content-id to the files.
    const contentIdToFilenameMap = [];
    attachmentList = await saveAttachments(message.id, attachmentFolderPath, 
        attachmentSaveEnabled, contentIdToFilenameMap);
    
    // Extract message body text from the message. First, see if user
    // selected specific text to be saved.    
    // TODO - Make this handle HTML.
    let messageBody = await readTextSelection(latestMsgDispTab);
    
    // Was anything selected?
    if(messageBody == "") {
        // No text was selected - get entire message text. Zero out variables for extraced message content.
        plainTextMessageBody = "";  // Plain text of clipped message body
        htmlMessageBody = "";       // HTML of clipped message body 
        
        //messageBody = buildMessageBody(full, maxEmailSize, contentIdToFilenameMap);
        
        // Get the message text
        buildMessageBody(full, maxEmailSize, contentIdToFilenameMap);
        
        // Set the message body to the HTML content (if present and user has configured to clip it) or the plain text.
        if((true == htmlClippingEnabled) && (htmlMessageBody != "")) {
            // Use the HTML
            messageBody = htmlMessageBody;
        } else {
            // There is no HTML. Just use the plain text.
            messageBody = plainTextMessageBody;
        }
    }
    
    console.log("background.js - clipEmail - messageBody: " + messageBody);
    
    // Build note name and content from templates and message data.
    // Use these placeholders for note and time content:
    //     Note Info: _NOTEDATE, _NOTETIME
    //     Message info: _MSGDATE, _MSGTIME, _MSGSUBJECT, _MSGRECIPENTS, _MSGAUTHOR, _MSGCONTENT

    // Create a mapping of template fields to the data to be inserted and an regular expression to use it.
    const thisMoment = new Date();   // For note time and date
    var templateMap = {
        _MSGDATE:message.date.toLocaleDateString(),
        
        _MSGYEAR:String(message.date.getFullYear()),
        _MSGMONTH:String(message.date.getMonth()+1).padStart(2, '0'),
        _MSGDAY:String(message.date.getDate()).padStart(2, '0'),
        _MSGHOUR:String(message.date.getHours()).padStart(2, '0'),
        _MSGMIN:String(message.date.getMinutes()).padStart(2, '0'),
        _MSGSEC:String(message.date.getSeconds()).padStart(2, '0'),
        
        _MSGTIME:message.date.toLocaleTimeString(),
        _MSGSUBJECT:messageSubject,
        _MSGAUTHOR:messageAuthor,
        _MSGIDURI:messageIdUri,
        _MSGCONTENT:messageBody,
        
        _MSGRECIPENTS_YAML:getRecipients(message, "to", true),
        _MSGCC_YAML:getRecipients(message, "cc", true),
        _MSGBCC_YAML:getRecipients(message, "bcc", true),
        _MSGRECIPENTS:getRecipients(message, "to"),
        _MSGCC:getRecipients(message, "cc"),
        _MSGBCC:getRecipients(message, "bcc"),
        
        _NOTEDATE:thisMoment.toLocaleDateString(),
        _NOTEYEAR:String(thisMoment.getFullYear()),
        _NOTEMONTH:String(thisMoment.getMonth()+1).padStart(2, '0'),
        _NOTEDAY:String(thisMoment.getDate()).padStart(2, '0'),

        _NOTETIME:thisMoment.toLocaleTimeString(),
        _NOTEHOUR:String(thisMoment.getHours()).padStart(2, '0'),
        _NOTEMIN:String(thisMoment.getMinutes()).padStart(2, '0'),
        _NOTESEC:String(thisMoment.getSeconds()).padStart(2, '0'),
        
        _MSGATTACHMENTLIST:attachmentList,
    };

    console.log("templateMap - " + templateMap)
    // Build a regular expression that will trip on each key in templateMap
    const templateRegExp = new RegExp(Object.keys(templateMap).join('|'), 'gi');
    
    console.log("templateRegExp - " + templateRegExp)
    // Substitute the template fields with the actual message and note data
    let noteSubject = noteTitleTemplate.replaceAll(templateRegExp, function(matched){
        return templateMap[matched];
    });

    console.log("noteTemplate - " + noteTemplate)
    // the template in the settings uses the newline character. this doesn't carry over to TN because html ignores the newline character. Replacing it with the html equivilent. 
    noteTemplate = noteTemplate.replaceAll('\n', '<br>');
    console.log("noteTemplate - " + noteTemplate)

    let noteContent = noteTemplate.replaceAll(templateRegExp, function(matched){
        return templateMap[matched];
    });


    console.log(`background.js: Note subject: \"${noteSubject}\"`);
    console.log("background.js: Note content:\n" + noteContent);
    
    // Build the TriliumNext URI
    let uploadInfo = { abortController: new AbortController() };
    let triliumUrl = triliumdb + "/create-note"


    // Build the TriliumNext http header.
    let headers = {
        "authorization": triliumToken,
        // "Access-Control-Allow-Origin": "*", 
        "content-type": "application/json"
    };

    let fetchInfo = {
        mode: "cors",
        method: "POST",
        headers,
        body: JSON.stringify({
            parentNoteId: triliumParentNoteId,
            title: noteSubject,
            type: "text",
            content: noteContent
        }),
        signal: uploadInfo.abortController.signal,
    };
    console.log('fetchInfo: ' +fetchInfo.toString());
    
    // Log status
    await displayStatusText("TriliumNextClipper: Sending data to TriliumNext application.");
    
    // Create new note
    try {
        response = await fetch(triliumUrl, fetchInfo);
        json = await response.json();
        if (response.ok) {
            /*{'note': {'noteId': 'ww1AZxxC0DaE', 'isProtected': False, 'title': 'aaaaa', 'type': 'text', 'mime': 'text/html', 'blobId': 'aHCJd06HhUBWJWIDePpT',
            'dateCreated': '2025-01-23 23:17:48.821-0500', 'dateModified': '2025-01-23 23:17:48.823-0500', 'utcDateCreated': '2025-01-24 04:17:48.822Z',
            'utcDateModified': '2025-01-24 04:17:48.823Z', 'parentNoteIds': ['LVA9YEQrPW0d'], 'childNoteIds': [], 'parentBranchIds': ['LVA9YEQrPW0d_ww1AZxTJ0FaF'],
            'childBranchIds': [], 'attributes': []}, 'branch': {'branchId': 'LVA9YEQrPW0d_ww1AZxTJ0FaF', 'noteId': 'ww1AZxTJ0FaF', 'parentNoteId': 'LVA9YEQrPW0d',
            'prefix': None, 'notePosition': 40, 'isExpanded': False, 'utcDateModified': '2025-01-24 04:17:48.824Z'}}*/
            // console.log("Trilium Result: " + json.note.noteId);
            labelNewNote(message, json.note.noteId, triliumdb, headers);
            updateNoteIcon(json.note.noteId, triliumdb, headers); // @TODO - updating this configurable
            await displayStatusText("TriliumNextClipper: Message clipped.");
        }
        else {
            // {'status': 400, 'code': 'PROPERTY_VALIDATION_ERROR', 'message': "Validation failed on property 'parentNoteId': Note 'LVA9YEQrPW0d' does not exist."}
            console.log(json.message);
            await displayAlert("TriliumNextClipper: " + json.message);
        }
    }
    catch (TypeError)
    {
        console.log("Error: Make sure Trilium is open")
        await displayAlert("Error: Please verify that TriliumNext is open.")
    }
}


async function labelNewNote(message, noteId, triliumdb, headers ) {
    // Build the message tag list that reflects how the email was tagged.

    let uploadInfo = { abortController: new AbortController() };
    
    if(undefined != message.tags) {
        // Get a master list of tags known by Thunderbird
        let knownTagArray = await messenger.messages.listTags();
        
        // Loop through the tags on the email and find any matches
        for (var currMsgTagKeyString of message.tags) {
            // Check for a match of the email's tag against the master list.
            // Note that we're testing ".key" values here. Human readable strings are processed after a match.
            var matchingTagEntry = knownTagArray.find((t) => t.key == currMsgTagKeyString);
            // matchingTagEntry.push("email");
            if(undefined != matchingTagEntry) {
                // We have a match. Take the human readable string, replace spaces, and add a hashtag.

                var tagText = matchingTagEntry.tag.replaceAll(' ', '-');
                let fetchInfo = {
                    mode: "cors",
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        noteId: noteId,
                        type: "label",
                        name: tagText,
                        value: ""
                    }),
                    signal: uploadInfo.abortController.signal,
                };
                console.log("tagText = " + tagText)
                // Create new attribute on the note
                addNoteAttribute(fetchInfo, triliumdb)
            }
        }

    }
}

async function updateNoteIcon( noteId, triliumdb, headers ) {
    // Build the message tag list that reflects how the email was tagged.

    let uploadInfo = { abortController: new AbortController() };

    //change the note icon
    let fetchInfo = {
        mode: "cors",
        method: "POST",
        headers,
        body: JSON.stringify({
            noteId: noteId,
            type: "label",
            name: "iconClass",
            value: "bx bx-envelope"
        }),

        signal: uploadInfo.abortController.signal,
    };
    addNoteAttribute(fetchInfo, triliumdb)
}

async function addNoteAttribute (fetchInfo, triliumdb) {
    // Method calls the create attribute function of ETAPI
    let triliumUrl = triliumdb + "/attributes"

    response = await fetch(triliumUrl, fetchInfo);
    json = await response.json();
    if (response.ok)
        {
            console.log("attribute added");
        }
    else {
        console.log("failure adding attribute");
        console.log(json.message)
    }

}


// Wrapper to run the email clip code
function doEmailClip() {
    // Get the stored parameters and pass them to a function to perform the actual mail clipping.
    browser.storage.local.get(null).then(clipEmail, onError);
}

//////////
// doHandleCommand() - handler for messages from content scripts
//////////
const doHandleCommand = async (message, sender) => {
    // Get command name and the sending tab ID
    const { command } = message;
    const { tabId } = message;

    const messageHeader = await browser.messageDisplay.getDisplayedMessage(tabId);
    
    // Record tab for later reference
    latestMsgDispTab = tabId;
    
    // Get an incoming message.
    let thisCommand = command.toLocaleLowerCase();
    console.log("Command '"+thisCommand+"' received from tab "+tabId);
    
    // Act on the command
    switch (thisCommand) {
        // Button requests that an email be clipped.
        // Reply with clipstatus and eventually clipdone
        case "cliprequest" : {
            console.log("message 'cliprequest' received.");
            
            // Clip email
            doEmailClip();
            
            // Reply with status
            return true;
            }
            break;
        
        // Tab responded to a textselectrequest with selectresponse
        case "textselectresponse" : {
            console.log("message 'selectresponse' received.");
            
            // Check to see if any data was sent back
            const { textselectdata } = message;
            if(textselectdata) {
                //
                console.log("DEBUG: Got text selection of: " + textselectdata);
            } else {
                //
                console.log("DEBUG: No text selected");
            }
        }
        break;
        
        default: {
            console.error("Do not recognize internal message '"+ thisCommand + "'");
        }
        break;
    }
};


///////////////////////
// Main execution path
///////////////////////

// Add a handler for communication with other parts of the extension:
//  - Display popup will request a clip with a "cliprequest" command.
//      - Background will reply with "clipstatus" messages and eventually "clipcomplete"
//  - Message tab will send a "textselectresponse" in reply to a "textselectrequest"

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.hasOwnProperty("command")) {
        // If we have a command, return a promise from the command handler.
        return doHandleCommand(message, sender);
    }
  return false;
});


// Add clipper to the message_list menu
browser.menus.create({
    title: "TriliumClipper",
    contexts: ["message_list"],
    onclick: doEmailClip,
  });

// Add listener for status line in the message content tab
browser.messageDisplay.onMessageDisplayed.addListener(async (tab, message) => {
    // Inject style sheet into the message content tab.
    await browser.tabs.insertCSS(tab.id, {
      file: "/statusLine/statusLine-styles.css"
    });
    
    // Record the tab for later updates. 
    console.log("Got messageDisplayed event for tab " + tab.id + ". Previous tab was " + latestMsgDispTab);
    latestMsgDispTab = tab.id;
    
    // To display text on the tab, call displayStatusText() to set text in the DIV
});
  


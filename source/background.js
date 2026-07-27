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

// Modes describing the format a message is clipped in. These strings are shared
// with the popup menu and with the default clip mode stored by the Options page.
const CLIPMODE_PLAINTEXT = "plaintext";  // Clip the plain text part of the message
const CLIPMODE_HTML      = "html";       // Clip the HTML part of the message
const CLIPMODE_BOTH      = "both";       // Clip both parts into one note
const CLIPMODE_PDF       = "pdf";        // Clip the message as a PDF file note

// Not a format in itself. Stored as the default clip mode to ask the user which
// of the formats above to use each time a message is clipped.
const CLIPMODE_ASK       = "ask";

// Path to the menu listing the clip formats, shown when the default clip mode
// is CLIPMODE_ASK. An empty path means the button clips without asking.
const CLIPMODE_POPUP_PATH = "messagePopup/popup.html";

// Ways a message's attachments can be stored on the note the message is clipped
// into. These strings are shared with the Options page.
const ATTACHMENTMODE_ATTACHMENT = "attachment";  // Store as attachments of the note
const ATTACHMENTMODE_CHILDNOTE  = "childnote";   // Store as child notes of the note

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

// Function to work out the role Trilium stores an attachment under. Trilium only
// accepts "image" or "file", and shows attachments in the "image" role inline.
function attachmentRoleForType(fileType) {
    let role = "file";

    if((undefined != fileType) && fileType.startsWith("image/")) {
        role = "image";
    }

    return role;
}


// Function to store one file on a note as a Trilium attachment of that note.
// Trilium carries attachment content as JSON, which cannot hold the file's binary
// data, so this creates the attachment and then PUTs the file to its content
// endpoint. Returns the attachmentId, or null if the file could not be stored.
async function uploadNoteAttachment(fileBytes, filename, fileType, noteId, triliumdb, headers) {

    let uploadInfo = { abortController: new AbortController() };

    // Create the attachment record. The content is a placeholder replaced below.
    let createFetchInfo = {
        mode: "cors",
        method: "POST",
        headers,
        body: JSON.stringify({
            ownerId: noteId,
            role: attachmentRoleForType(fileType),
            mime: fileType,
            title: filename,
            content: "placeholder"
        }),
        signal: uploadInfo.abortController.signal,
    };

    let response = await fetch(triliumdb + "/attachments", createFetchInfo);
    let json = await response.json();

    // Stop here if the attachment record could not be created.
    if(!response.ok) {
        console.log("failure creating attachment - " + json.message);
        return null;
    }

    let attachmentId = json.attachmentId;

    // Now send the file itself as the attachment's content.
    let contentHeaders = {
        "authorization": headers["authorization"],
        "content-type": "application/octet-stream"
    };

    let contentFetchInfo = {
        mode: "cors",
        method: "PUT",
        headers: contentHeaders,
        body: fileBytes,
        signal: uploadInfo.abortController.signal,
    };

    let contentResponse = await fetch(triliumdb + "/attachments/" + attachmentId + "/content",
        contentFetchInfo);

    // The content endpoint replies 204 with no body on success.
    if(!contentResponse.ok) {
        console.log("failure uploading attachment content, status " + contentResponse.status);
        return null;
    }

    return attachmentId;
}


// Function to store one file beneath a note as a child note of its own. Trilium
// holds files in notes of type "file", which are created the same way as the
// attachments above. Returns the child note's noteId, or null on failure.
async function uploadChildNoteAttachment(fileBytes, filename, fileType, noteId, triliumdb, headers) {

    let uploadInfo = { abortController: new AbortController() };

    // Store images as image notes so Trilium displays them, and everything else
    // as a file note.
    let noteType = "file";
    if("image" == attachmentRoleForType(fileType)) {
        noteType = "image";
    }

    // Create the child note. The content is a placeholder replaced below.
    let createFetchInfo = {
        mode: "cors",
        method: "POST",
        headers,
        body: JSON.stringify({
            parentNoteId: noteId,
            title: filename,
            type: noteType,
            mime: fileType,
            content: "placeholder"
        }),
        signal: uploadInfo.abortController.signal,
    };

    let response = await fetch(triliumdb + "/create-note", createFetchInfo);
    let json = await response.json();

    // Stop here if the child note could not be created.
    if(!response.ok) {
        console.log("failure creating attachment note - " + json.message);
        return null;
    }

    let childNoteId = json.note.noteId;

    // Now send the file itself as the note's content.
    let contentHeaders = {
        "authorization": headers["authorization"],
        "content-type": "application/octet-stream"
    };

    let contentFetchInfo = {
        mode: "cors",
        method: "PUT",
        headers: contentHeaders,
        body: fileBytes,
        signal: uploadInfo.abortController.signal,
    };

    let contentResponse = await fetch(triliumdb + "/notes/" + childNoteId + "/content", contentFetchInfo);

    // The content endpoint replies 204 with no body on success.
    if(!contentResponse.ok) {
        console.log("failure uploading attachment note content, status " + contentResponse.status);
        return null;
    }

    // Label the note with the original filename so Trilium offers it on download.
    let labelFetchInfo = {
        mode: "cors",
        method: "POST",
        headers,
        body: JSON.stringify({
            noteId: childNoteId,
            type: "label",
            name: "originalFileName",
            value: filename
        }),
        signal: uploadInfo.abortController.signal,
    };
    await addNoteAttribute(labelFetchInfo, triliumdb);

    return childNoteId;
}


// Function to build the list of a message's attachments for the note's
// _MSGATTACHMENTLIST field. Returns an HTML list of the filenames, or "none" when
// the message carries no attachments or saving them is disabled.
//
// This only names the files. They are stored in Trilium by saveAttachments()
// below, which runs once the note they are stored on has been created.
async function listAttachmentNames(messageId, attachmentSaveEnabled) {

    var attachmentList = "";

    // Report no attachments if the user has not enabled saving them.
    if(false == attachmentSaveEnabled) {
        return "none";
    }

    let attachments = await browser.messages.listAttachments(messageId);

    for (let att of attachments) {
        attachmentList += "<li>" + sanitizeEmailHtml(att.name) + "</li>";
    }

    // If the message has no attachments, report that instead of an empty list.
    if("" == attachmentList) {
        return "none";
    }

    return "<ul>" + attachmentList + "</ul>";
}


// Function to clip a message's attachments into Trilium, storing them on the
// note that the message was clipped into.
//
// Each file is stored either as an attachment of that note or as a child note
// beneath it, as chosen by attachmentStorageMode.
async function saveAttachments(messageId, noteId, attachmentSaveEnabled,
    attachmentStorageMode, triliumdb, headers) {

    var attachmentCount = 0;        // Count attachments as they're saved
    var attachmentCountTotal = 0;   // Total count of attachments in this mail message

    // Nothing to do if the user has not enabled saving attachments.
    if(false == attachmentSaveEnabled) {
        return;
    }

    // Get attachments
    let attachments = await browser.messages.listAttachments(messageId);
    attachmentCountTotal = attachments.length;  // Count, starting from one instead of zero

    // Step through the attachments
    for (let att of attachments) {
        // Get the attached file.
        let file = await browser.messages.getAttachmentFile(messageId, att.partName);
        let filename = file.name;
        let fileType = file.type;

        console.log("Getting attachment " + filename + ", type " + fileType);

        // Read the file so its bytes can be sent to Trilium.
        let fileBytes = await file.arrayBuffer();

        // Store the file in the way the user has asked for.
        let storedId = null;
        if(ATTACHMENTMODE_CHILDNOTE == attachmentStorageMode) {
            storedId = await uploadChildNoteAttachment(fileBytes, filename, fileType,
                noteId, triliumdb, headers);
        } else {
            storedId = await uploadNoteAttachment(fileBytes, filename, fileType,
                noteId, triliumdb, headers);
        }

        // Report the file, and skip it in the list if it could not be stored.
        attachmentCount = attachmentCount + 1;
        if(null == storedId) {
            var attachmentSaveFailMsg = "Could not save attachment file '" + filename + "'";
            console.log(attachmentSaveFailMsg);
            await displayStatusText(attachmentSaveFailMsg);
            continue;
        }

        var attachmentSaveSuccessMsg = "Saved attachment file '"+ filename + "' (" + attachmentCount + " of " + attachmentCountTotal + ")";
        console.log(attachmentSaveSuccessMsg);
        await displayStatusText(attachmentSaveSuccessMsg);
    }
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
function buildMessageBody(msgPart, maxEmailSize)
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
            buildMessageBody(msgPart.parts[i], maxEmailSize);
        }
    }
    
    // Do we need to crop the email text? Check for plain text first.
    if (plainTextMessageBody.length > maxEmailSize) {
        plainTextMessageBody = plainTextMessageBody.slice(0, maxEmailSize);
        plainTextMessageBody = plainTextMessageBody + "\n\n\n ========= Plain text Email cropped after " + maxEmailSize + " bytes ========= \n";
    }
    
    // Now check for HTML text size.
    if (htmlMessageBody.length > maxEmailSize) {
        htmlMessageBody = htmlMessageBody.slice(0, maxEmailSize);
        htmlMessageBody = htmlMessageBody + "\n\n\n ========= HTML Email cropped after " + maxEmailSize + " bytes ========= \n";
    }
}

// Sanitizing html characters that impact rendering within Trilium. (Issue #6)
function sanitizeEmailHtml(email) 
{
    return (email ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
}

// Function to wrap plain text so that Trilium renders it as it appeared in the
// email. Without this, HTML collapses the message's whitespace and line breaks.
function formatPlainTextAsHtml(plainText)
{
    return "<pre>" + sanitizeEmailHtml(plainText) + "</pre>";
}


// Function to build the message body in the format requested by the clip mode.
// Expects buildMessageBody() to have already filled the plainTextMessageBody and
// htmlMessageBody globals. Returns the HTML to place in the note.
function composeMessageBody(clipMode)
{
    let messageBody = "";

    switch (clipMode) {
        // Plain text only. Fall back to the HTML if the message has no plain text part.
        case CLIPMODE_PLAINTEXT : {
            if(plainTextMessageBody != "") {
                messageBody = formatPlainTextAsHtml(plainTextMessageBody);
            } else {
                console.log("composeMessageBody: no plain text part, falling back to HTML");
                messageBody = htmlMessageBody;
            }
        }
        break;

        // Both parts, one after the other, separated by a rule.
        case CLIPMODE_BOTH : {
            if((plainTextMessageBody != "") && (htmlMessageBody != "")) {
                messageBody = "<h3>Plain Text</h3>" + formatPlainTextAsHtml(plainTextMessageBody) +
                    "<hr><h3>HTML</h3>" + htmlMessageBody;
            } else if(htmlMessageBody != "") {
                // Only one part exists, so clip it without the headings.
                console.log("composeMessageBody: no plain text part, clipping HTML only");
                messageBody = htmlMessageBody;
            } else {
                console.log("composeMessageBody: no HTML part, clipping plain text only");
                messageBody = formatPlainTextAsHtml(plainTextMessageBody);
            }
        }
        break;

        // HTML only. Fall back to the plain text if the message has no HTML part.
        case CLIPMODE_HTML :
        default : {
            if(htmlMessageBody != "") {
                messageBody = htmlMessageBody;
            } else {
                console.log("composeMessageBody: no HTML part, falling back to plain text");
                messageBody = formatPlainTextAsHtml(plainTextMessageBody);
            }
        }
        break;
    }

    return messageBody;
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
                const nextRecipient = sanitizeEmailHtml(recipientArray[index]);
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
                const nextRecipient = sanitizeEmailHtml(recipientArray[index].replaceAll('\"', '\\"'));
                
                // Make a new line with 
                messageRecipients = messageRecipients + "\n- \"" + nextRecipient + "\"";
            }
        }
    }
    
    return messageRecipients;
}



/////////////////////////////
// Trilium host permission
/////////////////////////////

// Function to turn the configured Trilium URL into a match pattern covering just
// that host, so the add-on can ask for access to the user's own Trilium server
// rather than to every site. Returns "" if the URL cannot be read.
function triliumOriginPattern(triliumdb) {

    // Catch the error thrown by URL() when the configured address is not a URL.
    try {
        let triliumUrl = new URL(triliumdb);
        return triliumUrl.protocol + "//" + triliumUrl.host + "/*";
    } catch(e) {
        onError(e, ("triliumOriginPattern - " + triliumdb));
    }

    return "";
}


// Function to make sure the add-on is allowed to reach the user's Trilium server.
// The host is not known until the user configures it, so access to it is asked
// for the first time a message is clipped rather than when the add-on installs.
// Returns true if the add-on may contact the server.
async function ensureTriliumHostPermission(triliumdb) {

    let originPattern = triliumOriginPattern(triliumdb);
    if("" == originPattern) {
        await displayAlert("TriliumClipper: The Trilium URL on the Options page is not a valid address.");
        return false;
    }

    let permissionRequest = { origins: [originPattern] };

    // Nothing to do if access to this host has already been granted.
    if(await browser.permissions.contains(permissionRequest)) {
        return true;
    }

    console.log("Requesting permission for " + originPattern);

    // Catch any errors thrown by request(), which needs a user action to run.
    try {
        if(await browser.permissions.request(permissionRequest)) {
            return true;
        }
    } catch(e) { onError(e, ("ensureTriliumHostPermission - " + originPattern)); }

    // The user refused, or the request could not be made.
    await displayAlert("TriliumClipper: Permission to contact " + originPattern +
        " is needed to clip messages. Press the Trilium button and allow access when asked.");
    return false;
}


///////////////////////////
// PDF clipping functions
///////////////////////////

// Function to render the displayed message into a PDF. Returns a Uint8Array of
// the PDF file.
//
// The rendering is done by Thunderbird's own print engine through the NativePdf
// experiment API, so the PDF reproduces the message exactly as the message pane
// draws it and its text stays selectable. The message is rendered as currently
// displayed, so remote content that Thunderbird has blocked stays blocked and
// clipping a message never loads remote images behind the user's back.
async function buildMessagePdf(tabId)
{
    let pdfByteArray = await browser.NativePdf.generate(tabId);

    // The experiment API hands the file back as a plain array of bytes.
    return new Uint8Array(pdfByteArray);
}


// Function to upload a PDF to Trilium as a file note. ETAPI carries note content
// as JSON, which cannot hold the PDF's binary data, so this creates the note
// first and then PUTs the file itself to the note's content endpoint.
async function uploadPdfNote(pdfBytes, noteSubject, triliumdb, headers, triliumParentNoteId)
{
    let uploadInfo = { abortController: new AbortController() };

    // Trilium shows the note title as the file's name, so give it a .pdf suffix.
    let pdfFilename = noteSubject + ".pdf";

    // Create the file note. The content is a placeholder replaced by the PUT below.
    let createFetchInfo = {
        mode: "cors",
        method: "POST",
        headers,
        body: JSON.stringify({
            parentNoteId: triliumParentNoteId,
            title: noteSubject,
            type: "file",
            mime: "application/pdf",
            content: "placeholder"
        }),
        signal: uploadInfo.abortController.signal,
    };

    let response = await fetch(triliumdb + "/create-note", createFetchInfo);
    let json = await response.json();

    // Stop here if the note could not be created.
    if(!response.ok) {
        console.log(json.message);
        await displayAlert("TriliumClipper: " + json.message);
        return null;
    }

    let noteId = json.note.noteId;
    console.log("Created PDF file note " + noteId);

    // Now send the PDF itself as the note's content.
    await displayStatusText("TriliumClipper: Uploading PDF to Trilium Notes application.");

    // Send the raw bytes, so use a binary content type rather than the JSON one.
    let contentHeaders = {
        "authorization": headers["authorization"],
        "content-type": "application/octet-stream"
    };

    let contentFetchInfo = {
        mode: "cors",
        method: "PUT",
        headers: contentHeaders,
        body: pdfBytes,
        signal: uploadInfo.abortController.signal,
    };

    let contentResponse = await fetch(triliumdb + "/notes/" + noteId + "/content", contentFetchInfo);

    // The content endpoint replies 204 with no body on success.
    if(!contentResponse.ok) {
        console.log("failure uploading PDF content, status " + contentResponse.status);
        await displayAlert("TriliumClipper: Could not upload the PDF to Trilium Notes.");
        return null;
    }

    // Label the note with the original filename so Trilium offers it on download.
    let labelFetchInfo = {
        mode: "cors",
        method: "POST",
        headers,
        body: JSON.stringify({
            noteId: noteId,
            type: "label",
            name: "originalFileName",
            value: pdfFilename
        }),
        signal: uploadInfo.abortController.signal,
    };
    await addNoteAttribute(labelFetchInfo, triliumdb);

    return noteId;
}


// Function to actually clip the email. Pass in the saved array of parameters and
// the mode describing the format the message should be clipped in.
async function clipEmail(storedParameters, clipMode=CLIPMODE_HTML)
{
    // Read the passed parameters that configure the app.
    let triliumdb = "";
    let triliumToken = "";
    let triliumParentNoteId = ""
    let noteTitleTemplate = "";
    let noteTemplate = "";
    let attachmentSaveEnabled = false;
    let attachmentStorageMode = ATTACHMENTMODE_ATTACHMENT;
    let htmlClippingEnabled = true;
    let maxEmailSize = Number.MAX_SAFE_INTEGER;
    let messageLinkText = ""
    // Log that we're clipping the message
    console.log("background.js - clipEmail - clipMode = " + clipMode);
    await displayStatusText("TriliumClipper: Clipping message.");
    
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
            attachmentSaveEnabled = storedParameters["attachmentSaveEnabled"];
            attachmentStorageMode = storedParameters["attachmentStorageMode"];
            maxEmailSize = storedParameters["maxEmailSize"];
            htmlClippingEnabled = storedParameters["htmlClippingEnabled"];
            triliumdb = storedParameters["triliumdb"];
            triliumToken = storedParameters["triliumToken"];
            triliumParentNoteId = storedParameters["parentNoteId"];
            messageLinkText = storedParameters["messageLinkText"]

            // Correct any parameters the won't cause fatal errors when missing
            // by giving them default values.
            if(undefined == attachmentStorageMode) {attachmentStorageMode = ATTACHMENTMODE_ATTACHMENT;}
            
            // Correct any parameters requiring additional processing
            if((undefined == maxEmailSize) || (NaN == parseInt(maxEmailSize))){            
                maxEmailSize = Number.MAX_SAFE_INTEGER;     // Set no limit
            } else {
                maxEmailSize = parseInt(maxEmailSize);      // Set user defined limit
            }
        }

    // Make sure the add-on is allowed to reach the configured Trilium server
    // before any work is done that would end up being thrown away.
    if(false == await ensureTriliumHostPermission(triliumdb)) {
        return;
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

    // Sanitizing the html tags that sometimes appear in this string that results in messages not appearing. (See: Issue #6)
    let messageAuthor = sanitizeEmailHtml(message.author)
    
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
    
    // Build the list of attachment names for the note's _MSGATTACHMENTLIST field.
    // The files themselves are stored once the note exists, further down, because
    // storing them needs the ID of the note they are stored on.
    let attachmentList = await listAttachmentNames(message.id, attachmentSaveEnabled);

    // Extract message body text from the message. First, see if user
    // selected specific text to be saved.
    // TODO - Make this handle HTML.
    let messageBody = await readTextSelection(latestMsgDispTab);

    // Zero out variables for extracted message content. Do this whether or not the
    // user selected text so that a clip never picks up the previous message's body.
    plainTextMessageBody = "";  // Plain text of clipped message body
    htmlMessageBody = "";       // HTML of clipped message body

    // Was anything selected?
    if(messageBody != "") {
        // Text was selected. The selection is always plain text, so format it so
        // that Trilium preserves its line breaks and does not read it as markup.
        messageBody = formatPlainTextAsHtml(messageBody);
    } else {
        //messageBody = buildMessageBody(full, maxEmailSize);

        // Get the message text
        buildMessageBody(full, maxEmailSize);

        // The clip mode the user picked decides the format of the note. The older
        // 'Enable HTML Content Clipping' option still applies when the user asked
        // for HTML, so unchecking it clips plain text as it always has.
        let effectiveClipMode = clipMode;
        if((CLIPMODE_HTML == effectiveClipMode) && (false == htmlClippingEnabled)) {
            console.log("clipEmail: HTML clipping disabled in options, clipping plain text");
            effectiveClipMode = CLIPMODE_PLAINTEXT;
        }

        // Build the body in the requested format.
        messageBody = composeMessageBody(effectiveClipMode);
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
    
    // Build the Trilium Notes URI
    let uploadInfo = { abortController: new AbortController() };
    let triliumUrl = triliumdb + "/create-note"


    // Build the Trilium Notes http header.
    let headers = {
        "authorization": triliumToken,
        // "Access-Control-Allow-Origin": "*",
        "content-type": "application/json"
    };

    // A PDF clip creates a file note holding the rendered message rather than a
    // text note built from the note content template, so handle it here.
    if(CLIPMODE_PDF == clipMode) {
        await displayStatusText("TriliumClipper: Rendering message as PDF.");

        // The message is rendered by Thunderbird's print engine, which draws the
        // whole message from the message pane. Any text the user selected is
        // therefore not used, and the message headers come from the rendering
        // rather than from the note content template.
        try {
            let pdfBytes = await buildMessagePdf(tabs[0].id);

            let pdfNoteId = await uploadPdfNote(pdfBytes, noteSubject, triliumdb,
                headers, triliumParentNoteId);

            // Tag and label the note as the text clip path does.
            if(null != pdfNoteId) {
                labelNewNote(message, pdfNoteId, triliumdb, headers);
                await displayStatusText("TriliumClipper: Message clipped as PDF.");
            }
        }
        catch (e) {
            onError(e, "clipEmail - PDF");
            await displayAlert("TriliumClipper: Could not render the message as a PDF. " +
                "Open the message before clipping it as a PDF.");
        }

        return;
    }

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
    await displayStatusText("TriliumClipper: Sending data to Trilium Notes application.");
    
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

            // Store the message's attachments on the note just created. This is
            // done here because storing them needs the new note's ID.
            await saveAttachments(message.id, json.note.noteId, attachmentSaveEnabled,
                attachmentStorageMode, triliumdb, headers);

            await displayStatusText("TriliumClipper: Message clipped.");
        }
        else {
            // {'status': 400, 'code': 'PROPERTY_VALIDATION_ERROR', 'message': "Validation failed on property 'parentNoteId': Note 'LVA9YEQrPW0d' does not exist."}
            console.log(json.message);
            await displayAlert("TriliumClipper: " + json.message);
        }
    }
    catch (TypeError)
    {
        console.log("Error: Make sure Trilium is open")
        await displayAlert("Error: Please verify that Trilium Notes is open.")
    }
}


async function labelNewNote(message, noteId, triliumdb, headers ) {
    // Build the message tag list that reflects how the email was tagged.

    let uploadInfo = { abortController: new AbortController() };
    
    if(undefined != message.tags) {
        // Get a master list of tags known by Thunderbird
        // Note: listTags() is used in preference to the newer messages.tags.list(),
        // which was only added in Thunderbird 121. Both return the same tag records,
        // and using this one lets the add-on support Thunderbird 88 and later.
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


// Wrapper to run the email clip code in the given mode. When no mode is given
// (for example, from the message list context menu) the user's configured
// default clip mode is used.
function doEmailClip(clipMode) {
    // Get the stored parameters and pass them to a function to perform the actual mail clipping.
    browser.storage.local.get(null).then(function(storedParameters) {
        // Fall back to the configured default mode, then to HTML.
        let thisClipMode = clipMode;
        if(undefined == thisClipMode) {
            thisClipMode = storedParameters["defaultClipMode"];
        }

        // "Ask every time" is not a format a message can be clipped in. Reaching
        // here with it means the user was not asked, as happens when a message is
        // clipped from the message list context menu, so clip the HTML instead.
        if(CLIPMODE_ASK == thisClipMode) {
            thisClipMode = CLIPMODE_HTML;
        }

        if(undefined == thisClipMode) {
            thisClipMode = CLIPMODE_HTML;
        }

        clipEmail(storedParameters, thisClipMode);
    }, onError);
}

// Function to set whether the Trilium button opens the clip format menu. The menu
// is only shown when the user has asked to choose a format every time. Otherwise
// the button has no popup, so that pressing it fires the onClicked event below
// and clips the message straight away in the configured format.
async function updateClipModePopup(defaultClipMode) {

    // Treat a missing setting as asking, matching the default on the Options page.
    let popupPath = "";
    if((undefined == defaultClipMode) || (CLIPMODE_ASK == defaultClipMode)) {
        popupPath = CLIPMODE_POPUP_PATH;
    }

    console.log("updateClipModePopup: defaultClipMode = " + defaultClipMode +
        ", popup = \"" + popupPath + "\"");

    // Catch any errors thrown by setPopup()
    try {
        await browser.messageDisplayAction.setPopup({ popup: popupPath });
    } catch(e) { onError(e, "updateClipModePopup"); }
}


// Function to read the stored default clip mode and apply it to the button.
function refreshClipModePopup() {
    browser.storage.local.get("defaultClipMode").then(function(storedParameters) {
        updateClipModePopup(storedParameters["defaultClipMode"]);
    }, onError);
}


//////////
// doHandleCommand() - handler for messages from content scripts
//////////
const doHandleCommand = async (message, sender) => {
    // Get command name, the sending tab ID, and the requested clip mode
    const { command } = message;
    const { tabId } = message;
    const { clipMode } = message;

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
            console.log("message 'cliprequest' received. clipMode = " + clipMode);

            // Clip email in the mode the user picked from the popup menu
            doEmailClip(clipMode);
            
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


// Add clipper to the message_list menu. Note that the menu handler is passed an
// OnClickData object, so call doEmailClip() with no argument to clip using the
// user's configured default clip mode.
browser.menus.create({
    title: "TriliumClipper",
    contexts: ["message_list"],
    onclick: function() { doEmailClip(); },
  });


// Handle presses of the Trilium button. This event only fires when the button has
// no popup, which is the case when the user has chosen a clip format rather than
// asking every time, so clip the message in the configured format.
browser.messageDisplayAction.onClicked.addListener((tab) => {
    console.log("messageDisplayAction clicked for tab " + tab.id);

    // Record the tab so status messages reach the message being clipped.
    latestMsgDispTab = tab.id;

    doEmailClip();
});


// Show or hide the clip format menu whenever the user changes the setting on the
// Options page, so the button starts behaving the new way straight away.
browser.storage.onChanged.addListener((changes, areaName) => {
    if(("local" == areaName) && changes.defaultClipMode) {
        updateClipModePopup(changes.defaultClipMode.newValue);
    }
});


// Set the button up to match the stored setting when the add-on starts.
refreshClipModePopup();

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
  


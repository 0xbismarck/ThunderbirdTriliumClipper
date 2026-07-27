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
// implementation.js - Experiment API that renders a displayed message to a PDF
// using Thunderbird's own print engine. Printing this way reproduces the
// message exactly as the message pane draws it, and keeps the text of the
// message selectable and searchable in the resulting PDF.
//
// The approach used here is based on the pdf-attachment-native-thunder add-on.
// See https://github.com/vasconcelosfer/pdf-attachment-native-thunder
//
///////////////////////////////////////////////////////////////////////////////


// Load the modules this API needs. Thunderbird 115 and later provide these as
// ES modules, while earlier releases provide them as JSMs.
var ExtensionCommon;
var FileUtils;

try {
    // Thunderbird 115+ (ESM)
    ({ ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs"));
    ({ FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs"));
} catch (e) {
    // Older releases (JSM)
    ({ ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm"));
    ({ FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm"));
}


var NativePdf = class extends ExtensionCommon.ExtensionAPI {

    getAPI(context) {
        return {
            NativePdf: {

                // Render the message displayed in the given tab to a PDF and
                // return its bytes. Throws if the tab holds no printable message.
                async generate(tabId) {
                    console.log("NativePdf: generating PDF for tab " + tabId);

                    const Cc = Components.classes;
                    const Ci = Components.interfaces;

                    // Find the tab holding the message to print.
                    const tabObject = context.extension.tabManager.get(tabId);
                    if (!tabObject) {
                        throw new Error("Tab " + tabId + " was not found");
                    }
                    const nativeTab = tabObject.nativeTab;

                    // Find the browser that is drawing the message. A message open
                    // in its own tab uses the tab's linked browser, while a message
                    // shown in the message pane of a folder tab uses messageBrowser.
                    let messageBrowser = nativeTab.messageBrowser;
                    if (!messageBrowser) {
                        messageBrowser = nativeTab.linkedBrowser;
                    }
                    if (!messageBrowser) {
                        throw new Error("No message browser was found in tab " + tabId);
                    }
                    if (!messageBrowser.browsingContext) {
                        throw new Error("The message browser has no browsing context");
                    }

                    // Build the print settings that render to a PDF file rather
                    // than sending the message to a physical printer.
                    const printSettings = Cc["@mozilla.org/gfx/printsettings-service;1"]
                        .getService(Ci.nsIPrintSettingsService)
                        .createNewPrintSettings();

                    printSettings.outputDestination = Ci.nsIPrintSettings.kOutputDestinationFile;
                    printSettings.outputFormat = Ci.nsIPrintSettings.kOutputFormatPDF;

                    // Leave the printer name empty so that nothing is sent to a printer.
                    printSettings.printerName = "";

                    // Print the message's colors and background images so the PDF
                    // looks like the message pane does.
                    printSettings.printBGColors = true;
                    printSettings.printBGImages = true;

                    // Print silently, so that printing a message never raises the
                    // print dialog in front of the user.
                    printSettings.printSilent = true;

                    // Print at full size. Letting Thunderbird shrink the page to fit
                    // would scale down the whole message when it holds a wide table
                    // or image, leaving the text too small to read.
                    printSettings.shrinkToFit = false;
                    printSettings.scaling = 1.0;

                    // Use A4 paper with half inch margins. Margins are measured in
                    // inches regardless of the unit chosen for the paper size.
                    printSettings.paperWidth = 210.0;
                    printSettings.paperHeight = 297.0;
                    printSettings.paperSizeUnit = Ci.nsIPrintSettings.kPaperSizeMillimeters;
                    printSettings.marginTop = 0.5;
                    printSettings.marginBottom = 0.5;
                    printSettings.marginLeft = 0.5;
                    printSettings.marginRight = 0.5;

                    // Print to a uniquely named file in the system temporary directory.
                    const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
                    const tempFile = dirService.get("TmpD", Ci.nsIFile);
                    tempFile.append("triliumclipper_message.pdf");
                    tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
                    printSettings.toFileName = tempFile.path;

                    console.log("NativePdf: printing to " + tempFile.path);

                    // Render the message, then read the PDF back. Remove the
                    // temporary file whether or not the printing succeeded so a
                    // failed clip does not leave the message behind on disk.
                    try {
                        await messageBrowser.browsingContext.print(printSettings);

                        const pdfBytes = await IOUtils.read(tempFile.path);
                        console.log("NativePdf: generated a PDF of " + pdfBytes.byteLength + " bytes");

                        // The bytes cross into the extension as a plain array.
                        return Array.from(pdfBytes);
                    } finally {
                        try {
                            await IOUtils.remove(tempFile.path);
                        } catch (e) {
                            console.log("NativePdf: could not remove " + tempFile.path + " - " + e);
                        }
                    }
                }
            }
        };
    }
}

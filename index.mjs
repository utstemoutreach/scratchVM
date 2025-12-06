import * as compile from "./utils/compile.js";
import * as serial from "./utils/serialTools.js";
import {updateStatus, reportGameStatus} from "./utils/status.js";
import { unzipSync } from "https://unpkg.com/fflate/esm/browser.js";

// Parse project ID from Scratch URL
function parseProjectIDFromURL(url) {
    if (!url || !url.trim()) {
        return null;
    }
    
    // Remove whitespace
    url = url.trim();
    
    // If it's already just a number, return it
    if (/^\d+$/.test(url)) {
        return url;
    }
    
    // Try to extract ID from URL patterns:
    // https://scratch.mit.edu/projects/1238081605/editor/
    // https://scratch.mit.edu/projects/1238081605
    // scratch.mit.edu/projects/1238081605
    const patterns = [
        /scratch\.mit\.edu\/projects\/(\d+)/i,
        /\/projects\/(\d+)/i,
        /projects\/(\d+)/i
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    
    return null;
}

async function unzipFile(file) {
    const buffer = file.arrayBuffer;
    const bytes = new Uint8Array(buffer);
    const unzipped = unzipSync(bytes);
    return unzipped;
}

function sanitizeProjectName(rawName, fallback = "project") {
    const safeFallback = fallback || "project";
    if (!rawName || typeof rawName !== "string") {
        return safeFallback;
    }
    return rawName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50) || safeFallback;
}

// Download Scratch project by URL and store with project name
async function getScratchProject() {
    try {
        const projectURLInput = document.getElementById("projectURLInput");
        
        if (!projectURLInput) {
            throw new Error("Input field not found");
        }
        
        const projectURL = projectURLInput.value.trim();
        
        if (!projectURL) {
            updateStatus("Please enter a Scratch project URL or ID", "warning");
            return;
        }
        
        // Parse project ID from URL
        const projectID = parseProjectIDFromURL(projectURL);
        
        if (!projectID) {
            updateStatus("Invalid Scratch project URL. Please use format: https://scratch.mit.edu/projects/1238081605", "error");
            return;
        }
        
        updateStatus(`Downloading Scratch project ${projectID}...`, "info");
        
        const options = {
            onProgress: (type, loaded, total) => {
                const progress = Math.round((loaded / total) * 100);
                updateStatus(`Downloading ${type}: ${progress}%`);
            }
        };
        
        const project = await SBDL.downloadProjectFromID(projectID, options);
        console.log("Downloaded project:", project);
        
        // Get project name from the downloaded project
        let projectName = sanitizeProjectName(project.title, `project_${projectID}`);
        if (!project.title) {
            updateStatus(`Warning: Could not extract project name, using ${projectName}`, "warning");
        }
        
        let file = await unzipFile(project, projectID);
        let projectInfo = {
            id: projectID,
            name: projectName
        };
        
        // Clear the input
        projectURLInput.value = "";
        updateStatus(`✓ Project "${projectName}" (ID: ${projectID}) downloaded and stored successfully!`, "success");
        return {bytes: await compile.compileScratchProject(file), projectInfo}
        
        
    } catch (error) {
        updateStatus(`✗ Error downloading project: ${error.message}`, "error");
        console.error("Download error:", error);
    }
}

function get(DOMselector) {
    return document.querySelector(DOMselector);
}

function enable(DOMelement) {
    DOMelement.style.display = '';//DOMelement.displayOld || DOMelement.style.display;
}

function disable(DOMelement) {
    DOMelement.displayOld = DOMelement.style;
    DOMelement.style.display = "none";
}

let stateShared = {};
let stateLocals = {};

function validateShared(expectedFields) {
    for (let field of expectedFields) {
        if (stateShared[field] !== undefined) continue;
        return false;
    }
    return true;
}

let states = {
    awaitingProject: async function (updateEvent) {
        if (updateEvent.type == "switch" || updateEvent.type == "restore") {
            stateLocals = {};
            enable(projectDownloadCard);
            disable(serialMenuCard);
            disable(reportMenuCard);
            console.log("returning ok");
            return "ok";
        }
        else if (updateEvent.type == "dom") {
            console.log("getting project");
            let {bytes, projectInfo} = await getScratchProject();
            console.log(bytes, projectInfo);
            stateShared = {bytes, projectInfo};
            console.log("switching state");
            switchState("awaitingUpload");
            return "ok";
        }
        else if (updateEvent.type == "switchFail") {
            updateState("restore");
            return "ok";
        }
    },


    webVmTesting: async function (updateEvent) {
    },


    awaitingUpload: async function (updateEvent) {
        if (updateEvent.type == "switch") {
            if (!validateShared(["bytes", "projectInfo"])) {
                return "awaiting connection requires project";
            }
            stateLocals = {};
            disable(projectDownloadCard);
            disable(reportMenuCard);
            enable(serialMenuCard);
            return "ok";
        }
        else if (updateEvent.type == "dom") {
            await serial.connectSerial();
            await serial.sendProgramDataViaSerial(stateShared.bytes);
            await serial.disconnectSerial();
            switchState("awaitingFeedback");
            return "ok";
        }
        else if (updateEvent.type == "switchFail") {
            console.error("switch fail:", updateEvent.status);
        }
    },

    awaitingFeedback: async function (updateEvent) {
        if (updateEvent.type == "switch") {
            if (!validateShared(["bytes", "projectInfo"])) {
                return "awaiting feedback requires project";
            }
            disable(projectDownloadCard);
            disable(serialMenuCard);
            enable(reportMenuCard);
            return "ok";
        }
        else if (updateEvent.type == "dom") {
            console.log(updateEvent.sender);
            updateEvent.sender.dispatchFunction(stateShared.project);
            switchState("awaitingProject");
            return "ok";
        }
        else if (updateEvent.type == "switchFail") {
            console.error("switch fail:", updateEvent.status);
            return "ok";
        }
    },
};

function updateState(updateEvent) {
    states[currentState](updateEvent);
}

let currentState = "awaitingProject";
async function switchState(other) {
    let switchStatus = await states[other]({type: "switch"});
    console.log(switchStatus);
    if (switchStatus !== "ok") {
        states[currentState]({type: "switchFail", status: switchStatus});
    }
    else {
        currentState = other;
        console.log("currentState:", currentState);
    }
}

function registerStateUpdate(DOMobj, eventName, typeFilter) {
    DOMobj.addEventListener(
        eventName, 
        (event) => {
            if (typeFilter && typeFilter.includes(event.type)) return;
            updateState({type: "dom", eventName, event});
        }
    )
}

function autoRegisterStateUpdates(queryStrings, eventName, typeFilter) {
    for (let queryString of queryStrings) {
        console.log(queryString);
        let element = document.querySelector(queryString);
        element.addEventListener(
            eventName, 
            (event) => {
                if (typeFilter && typeFilter.includes(event.type)) return;
                updateState({type: "dom", eventName, event, sender: element});
            }
        )
    }
}

let projectDownloadCard = get("#projectDownload");
let serialMenuCard = get("#serialMenu");
let reportMenuCard = get("#reportMenu");

console.log(serialMenu);

async function main() {
    updateState({type: "switch"});
    autoRegisterStateUpdates([
        "#downloadProject", 
        "#sendProgramData", 
        "#reportGameWorked", 
        "#reportGameFailed"
    ], "click");

    get("#reportGameWorked").dispatchFunction = (bytes) => reportGameStatus(bytes, true);
    get("#reportGameFailed").dispatchFunction = (bytes) => reportGameStatus(bytes, false);
}

main();

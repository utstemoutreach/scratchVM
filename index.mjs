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
    let buffer = file.arrayBuffer;
    if (typeof buffer === "function") {
        buffer = await file.arrayBuffer();
    }
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

async function compileScratchProject(zipBuffer) {
    let projectInfo = null;
    let file = await unzipFile(zipBuffer);
    return {bytes: await compile.compileScratchProject(file), projectInfo}
}

// Download Scratch project by URL and store with project name
async function getScratchProject() {
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
    
    // Get project name from the downloaded project
    let projectName = sanitizeProjectName(project.title, `project_${projectID}`);
    if (!project.title) {
        updateStatus(`Warning: Could not extract project name, using ${projectName}`, "warning");
    }
    
    let file = await unzipFile(project);
    let projectInfo = {
        id: projectID,
        name: projectName
    };
    
    // Clear the input
    projectURLInput.value = "";
    updateStatus(`✓ Project "${projectName}" (ID: ${projectID}) downloaded and stored successfully!`, "success");
    return {bytes: await compile.compileScratchProject(file), projectInfo}
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
            return "ok";
        }
        else if (updateEvent.type == "dom") {
            if (updateEvent.eventName == "click") {
                let {bytes, projectInfo} = await getScratchProject();
                stateShared = {bytes, projectInfo};
                switchState("awaitingUpload");
                return "ok";
            }
            if (updateEvent.eventName == "drop") {
                updateEvent.event.preventDefault();
                const files = updateEvent.event.dataTransfer.files;
                let file = await unzipFile(files[0]);
                let bytes = await compile.compileScratchProject(file)
                stateShared = {bytes, projectInfo:null};
                switchState("awaitingUpload");
                return "ok";
            }
            else {
                console.warn(updateEvent);
            }
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
            let terminalOutput = get("#terminalOutput");
            let terminalForm = get("#terminalForm");
            let serialObj = await serial.initSerial(
                null,
                (bytes) => {
                    let text = new TextDecoder().decode(bytes)
                    const node = document.createTextNode(text);
                    terminalOutput.appendChild(node);
                },
                921600
            );
            terminalForm.addEventListener("submit", (e) => {
                e.preventDefault();
                
                let data = new FormData(terminalForm);
                let text = data.get("command");

                serial.sendInput(serialObj, new TextEncoder().encode(text));
            });
            let bytes = stateShared.bytes;
            let magic = bytes.slice(0, 8);
            let program = bytes.slice(8);
            serial.sendInput(serialObj, magic);
            serial.sendInput(serialObj, program);
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
    if (switchStatus !== "ok") {
        states[currentState]({type: "switchFail", status: switchStatus});
    }
    else {
        currentState = other;
    }
}

function registerStateUpdate(queryString, eventName, typeFilter) {
    let element = document.querySelector(queryString);
    element.addEventListener(
        eventName, 
        (event) => {
            if (typeFilter && typeFilter.includes(event.type)) return;
            updateState({type: "dom", eventName, event, sender: element});
        }
    )
}

function autoRegisterStateUpdates(queryStrings, eventName, typeFilter) {
    for (let queryString of queryStrings) {
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
let terminalCard = get("#terminal");


async function main() {
    updateState({type: "switch"});
    autoRegisterStateUpdates([
        "#downloadProject", 
        "#sendProgramData", 
        "#reportGameWorked", 
        "#reportGameFailed"
    ], "click");
    registerStateUpdate("#projectDownload", "dragenter");
    registerStateUpdate("#projectDownload", "dragover");
    registerStateUpdate("#projectDownload", "drop");

    get("#reportGameWorked").dispatchFunction = (bytes) => reportGameStatus(bytes, true);
    get("#reportGameFailed").dispatchFunction = (bytes) => reportGameStatus(bytes, false);
}

main();

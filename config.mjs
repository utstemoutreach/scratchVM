import {EspTerminal} from "./utils/esp.js";
import * as serial from "./utils/serialTools.js";

function get(DOMselector) {
    return document.querySelector(DOMselector);
}

async function select(widgets, ...elements) {
}

async function doConfig() {
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
    let terminal = new EspTerminal(serialObj);

    let widgetItems = {
        "startButton": null,
        "plainRed": null,
        "plainBlue": null,
        "plainBlack": null,
        "plainWhite": null,
        "splitHorizontal": null,
        "splitVertical": null,
    };

    for (let element of Object.keys(gameboyElements)) {
        widgetItems[element] = get("#" + element);
    }

    const widgets = get("#config-init .widgets");

    // clear `widgets`, put each element into it, then race for one to be clicked on
    while (true) {
        let screenStatus = await select("plainRed", "plainBlue", "plainBlack");
        // selected === plainBlack when the console either doesn't work completely, or the firmware is using the wrong pins
        // selected === plainWhite is very similar
        if (screenStatus === "plainBlack") {
        }
    }
}


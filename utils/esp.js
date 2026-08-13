import {sendInput} from "./serialTools.js";
import {toCodeLiteral} from "./opcode.js";

const ETX = 3;
const STX = 2;

const espStateNames = [
    "default",      // default no-contact
    "connected",    // connected
    "chatter",      // successfully chattering with device
    "protocol"      // successfully established protocol
];

const espStates = {};
for (let num in espStateNames) {
    let stateName = espStateNames[num];
    espStates[stateName] = Number(num);
}

console.log(espStates);

export class EspTerminal {
    ready = {"ready": true};
    waiting = {"ready": false};
    constructor(serialObj) {
        this.serialObj = serialObj;
        this.state = espStates.default;
        this.waitingState = this.ready;
    }
    async sendProgram(bytes) {
        let magic = bytes.slice(0, 8);
        let program = bytes.slice(8);
        sendInput(this.serialObj, magic);
        await new Promise((res, rej) => {
            setTimeout(()=>res(), 100);
        });
        sendInput(this.serialObj, program);
    }
}

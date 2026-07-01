import {sendInput} from "./serialTools.js";
import {toCodeLiteral} from "./opcode.js";

const ETX = 3;
const STX = 2;

export class EspTerminal {
    ready = {"ready": true};
    waiting = {"ready": false};
    constructor(serialObj) {
        this.serialObj = serialObj;
        this.waitingState = this.ready;
    }
    setMember(memberName, value) {
        if (typeof value === "number") value = toCodeLiteral(value, 8);
        if (typeof input !== "Uint8Array") input = new Uint8Array(input);
        sendInput(this.serialObj, ETX);
        sendInput(this.serialObj, "set ");
        sendInput(this.serialObj, memberName + " ");
        sendInput(this.serialObj, value);
        sendInput(this.serialObj, STX);
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
    switchApp(appName) {
        sendInput(this.serialObj, ETX);
        sendInput(this.serialObj, "switch ");
        sendInput(this.serialObj, appName);
        sendInput(this.serialObj, STX);
    }
    testColorOrder() {
        sendInput(this.serialObj, ETX);
        sendInput(this.serialObj, "color");
        sendInput(this.serialObj, STX);
    }
    testOrientation() {
        sendInput(this.serialObj, ETX);
        sendInput(this.serialObj, "orient");
        sendInput(this.serialObj, STX);
    }
}

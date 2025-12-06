import * as compile from "./compile.js";
import {reportGameStatus, updateStatus} from "./status.js"; 

// Global variables for ESP32 functionality
let serialPort = null;
let serialReader = null;
let currentProjectInfo = null;

// Connect to serial port
export async function connectSerial() {
    try {
        // Check if Web Serial API is available
        if (!("serial" in navigator)) {
            throw new Error("Web Serial API not supported in this browser");
        }
        
        updateStatus("Requesting serial port access...", "info");
        
        // Request port access
        serialPort = await navigator.serial.requestPort();
        
        // Open the port with appropriate baud rate for ESP32
        await serialPort.open({ baudRate: 115200 });
        
        updateStatus("✓ Serial port connected successfully", "success");
        
    } catch (error) {
        if (error.name === "NotFoundError") {
            updateStatus("No serial port selected", "warning");
        } else {
            updateStatus(`✗ Error connecting to serial: ${error.message}`, "error");
        }
        console.error("Serial connection error:", error);
        serialPort = null;
    }
}

// Read serial data (background task)
export async function readSerialData() {
    if (!serialReader) return;
    
    try {
        while (true) {
            const { value, done } = await serialReader.read();
            if (done) {
                break;
            }
            // Log received data (optional)
            console.log("Serial RX:", new TextDecoder().decode(value));
        }
    } catch (error) {
        console.error("Serial read error:", error);
    }
}

// Reset ESP32 using DTR/RTS signals if available, or send reset command
export async function resetESP32() {
    try {
        // Try to use setSignals if available (Web Serial API feature)
        if (serialPort && 'setSignals' in serialPort) {
            try {
                // Toggle DTR to reset ESP32 (DTR low = reset)
                await serialPort.setSignals({ dataTerminalReady: false });
                await new Promise(resolve => setTimeout(resolve, 100)); // Hold reset for 100ms
                await serialPort.setSignals({ dataTerminalReady: true });
                updateStatus("ESP32 reset via DTR signal", "info");
                return;
            } catch (error) {
                console.warn("setSignals not supported or failed, trying alternative method:", error);
            }
        }
        
        // Fallback: Send a reset command sequence
        // Some ESP32 firmwares listen for specific commands
        const writer = serialPort.writable.getWriter();
        try {
            // Send a break or reset sequence
            // Common ESP32 reset: send Ctrl+C (0x03) or specific reset command
            const resetCommand = new Uint8Array([0x03]); // Ctrl+C to interrupt
            await writer.write(resetCommand);
            await new Promise(resolve => setTimeout(resolve, 100));
            updateStatus("ESP32 reset via command", "info");
        } finally {
            writer.releaseLock();
        }
    } catch (error) {
        console.warn("Reset attempt failed, continuing anyway:", error);
        updateStatus("Reset attempt failed, continuing...", "warning");
    }
}

// Disconnect serial port
export async function disconnectSerial() {
    try {
        if (serialReader) {
            await serialReader.cancel();
            serialReader = null;
        }
        
        if (serialPort) {
            await serialPort.close();
            serialPort = null;
        }
        
        updateStatus("Serial port disconnected", "info");
        
    } catch (error) {
        updateStatus(`✗ Error disconnecting: ${error.message}`, "error");
        console.error("Disconnect error:", error);
    }
}

// Send program data via serial
export async function sendProgramDataViaSerial(bytes) {
    try {
        if (!serialPort) {
            throw new Error("Serial port not connected. Please connect first.");
        }
        
        // Get the program data from getProgramAsBlob
        
        if (!bytes || bytes.length === 0) {
            throw new Error("No program data to send");
        }
        
        // Convert bytes array to Uint8Array
        const dataToSend = new Uint8Array(bytes);
        
        // Get the writable stream
        const writer = serialPort.writable.getWriter();
        
        try {
            await writer.write(dataToSend);
            updateStatus(`✓ Successfully sent ${dataToSend.length} bytes via serial`, "success");
        } finally {
            // Always release the writer
            writer.releaseLock();
        }
        
    } catch (error) {
        updateStatus(`✗ Error sending data: ${error.message}`, "error");
        console.error("Serial send error:", error);
    }
}


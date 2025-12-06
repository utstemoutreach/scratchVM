function uint8ToBase64(uint8) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkSize) {
        const chunk = uint8.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

export async function reportGameStatus(bytes, worked, currentProjectInfo) {
    updateStatus("Preparing report data...", "info");
    const data = new Uint8Array(bytes);
    
    const payload = {
        status: worked ? "worked" : "failed",
        projectId: currentProjectInfo?.id || null,
        projectName: currentProjectInfo?.name || null,
        byteLength: data.length,
        programData: uint8ToBase64(data),
        timestamp: new Date().toISOString()
    };
    
    const response = await fetch("/api/game-status", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || "Server error while submitting report");
    }
    
    updateStatus(`Thanks for the feedback! Report ID: ${result.id}`, "success");
}

// Helper function to update status display with styling
export function updateStatus(message, type = "info") {
    const statusDiv = document.getElementById("status");
    if (statusDiv) {
        statusDiv.textContent = message;
        
        // Remove all status classes
        statusDiv.classList.remove("status-info", "status-success", "status-error", "status-warning");
        
        // Add appropriate class based on type
        if (type === "success") {
            statusDiv.classList.add("status-success");
        } else if (type === "error") {
            statusDiv.classList.add("status-error");
        } else if (type === "warning") {
            statusDiv.classList.add("status-warning");
        } else {
            statusDiv.classList.add("status-info");
        }
    }
    console.log("Status:", message);
}


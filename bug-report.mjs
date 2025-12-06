import {serverURL} from './utils/const.js';

// Helper function to update bug report status display
function updateBugStatus(message, type = "info") {
    const bugStatusDiv = document.getElementById("bugStatus");
    if (bugStatusDiv) {
        bugStatusDiv.textContent = message;
        
        // Remove all status classes
        bugStatusDiv.classList.remove("status-info", "status-success", "status-error", "status-warning");
        
        // Add appropriate class based on type
        if (type === "success") {
            bugStatusDiv.classList.add("status-success");
        } else if (type === "error") {
            bugStatusDiv.classList.add("status-error");
        } else if (type === "warning") {
            bugStatusDiv.classList.add("status-warning");
        } else {
            bugStatusDiv.classList.add("status-info");
        }
    }
    console.log("Bug Status:", message);
}

// Submit bug report
async function submitBugReport() {
    try {
        const projectLinkInput = document.getElementById("bugProjectLink");
        const descriptionInput = document.getElementById("bugDescription");
        const emailInput = document.getElementById("bugEmail");
        
        if (!projectLinkInput || !descriptionInput) {
            throw new Error("Bug report form fields not found");
        }
        
        const projectLink = projectLinkInput.value.trim();
        const description = descriptionInput.value.trim();
        const email = emailInput.value.trim();
        
        // Validate required fields
        if (!projectLink) {
            updateBugStatus("Please enter a project link", "warning");
            return;
        }
        
        if (!description) {
            updateBugStatus("Please describe the bug", "warning");
            return;
        }
        
        // Validate email format if provided
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            updateBugStatus("Please enter a valid email address", "warning");
            return;
        }
        
        updateBugStatus("Submitting bug report...", "info");
        
        // Prepare bug report data
        const bugReportData = {
            projectLink: projectLink,
            description: description,
            email: email || null
        };
        
        // Submit to server
        const response = await fetch(serverURL + "/api/bug-report", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bugReportData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to submit bug report');
        }
        
        // Success
        updateBugStatus(`✓ Bug report submitted successfully! (ID: ${result.id})`, "success");
        
        // Clear form after a short delay
        setTimeout(() => {
            projectLinkInput.value = "";
            descriptionInput.value = "";
            emailInput.value = "";
        }, 2000);
        
    } catch (error) {
        updateBugStatus(`✗ Error submitting bug report: ${error.message}`, "error");
        console.error("Bug report error:", error);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Wire up bug report submission
    const submitBugReportBtn = document.getElementById("submitBugReport");
    if (submitBugReportBtn) {
        submitBugReportBtn.onclick = submitBugReport;
    }
    
    // Allow Ctrl+Enter to submit bug report in textarea
    const bugDescriptionInput = document.getElementById("bugDescription");
    if (bugDescriptionInput) {
        bugDescriptionInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitBugReport();
            }
        });
    }
});



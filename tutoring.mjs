// Tutoring session request form handler

// Helper function to update tutoring status display
function updateTutoringStatus(message, type = "info") {
    const statusDiv = document.getElementById("tutoringStatus");
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
    console.log("Tutoring Status:", message);
}

// Submit tutoring request
async function submitTutoringRequest(event) {
    event.preventDefault();
    
    try {
        const nameInput = document.getElementById("tutoringName");
        const emailInput = document.getElementById("tutoringEmail");
        const featureInput = document.getElementById("tutoringFeature");
        const dateTimeInput = document.getElementById("tutoringDateTime");
        const notesInput = document.getElementById("tutoringNotes");
        
        if (!nameInput || !emailInput || !featureInput || !dateTimeInput) {
            throw new Error("Form fields not found");
        }
        
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const feature = featureInput.value;
        const dateTime = dateTimeInput.value;
        const notes = notesInput ? notesInput.value.trim() : "";
        
        // Validate required fields
        if (!name) {
            updateTutoringStatus("Please enter your name", "warning");
            return;
        }
        
        if (!email) {
            updateTutoringStatus("Please enter your email address", "warning");
            return;
        }
        
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            updateTutoringStatus("Please enter a valid email address", "warning");
            return;
        }
        
        if (!feature) {
            updateTutoringStatus("Please select a feature to add", "warning");
            return;
        }
        
        if (!dateTime) {
            updateTutoringStatus("Please select a preferred date and time", "warning");
            return;
        }
        
        // Validate that the selected date is in the future
        const selectedDate = new Date(dateTime);
        const now = new Date();
        if (selectedDate <= now) {
            updateTutoringStatus("Please select a date and time in the future", "warning");
            return;
        }
        
        updateTutoringStatus("Submitting tutoring request...", "info");
        
        // Prepare request data
        const requestData = {
            name: name,
            email: email,
            feature: feature,
            preferredDateTime: dateTime,
            notes: notes || null
        };
        
        // Submit to server
        const response = await fetch('/api/tutoring-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to submit tutoring request');
        }
        
        // Success
        updateTutoringStatus(`✓ Tutoring request submitted successfully! (ID: ${result.id}) We'll contact you soon to confirm your session.`, "success");
        
        // Clear form after a short delay
        setTimeout(() => {
            document.getElementById("tutoringForm").reset();
        }, 3000);
        
    } catch (error) {
        updateTutoringStatus(`✗ Error submitting request: ${error.message}`, "error");
        console.error("Tutoring request error:", error);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById("tutoringForm");
    if (form) {
        form.addEventListener("submit", submitTutoringRequest);
    }
    
    // Set minimum date/time to now for the datetime input
    const dateTimeInput = document.getElementById("tutoringDateTime");
    if (dateTimeInput) {
        const now = new Date();
        // Format as YYYY-MM-DDTHH:mm for datetime-local input
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        dateTimeInput.min = `${year}-${month}-${day}T${hours}:${minutes}`;
    }
});



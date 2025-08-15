/**
 * Firebase to ComfyUI Integration
 * This module handles the integration between Firebase database and ComfyUI image generation
 */

// Global variables
let isListening = false;
let pollingInterval = null;
let lastProcessedId = null;
let pollingDelay = 5000; // 5 seconds between polls
let statusElement = null;
let previousData = null; // Store previous data for comparison

// Initialize Firebase connection
async function initFirebase() {
    try {
        console.log("Initializing Firebase connection...");
        updateStatus('connected', 'Firebase connection initialized');
        
        // Get initial data snapshot
        const initialData = await fetchFirebaseData(true);
        if (initialData) {
            previousData = initialData;
            console.log("Initial data snapshot stored", Object.keys(initialData).length, "entries");
            updateStatus('connected', `Initial data loaded: ${Object.keys(initialData).length} entries`);
        }
        
        return true;
    } catch (error) {
        console.error("Error initializing Firebase:", error);
        updateStatus('error', 'Failed to initialize Firebase connection');
        return false;
    }
}

/**
 * Fetch data from the Firebase database via the PHP API
 * @param {boolean} isInitialLoad - Whether this is the initial data load
 * @returns {Promise<Object>} The data from Firebase
 */
async function fetchFirebaseData(isInitialLoad = false) {
    if (!isInitialLoad) {
        updateStatus('polling', 'Polling Firebase database...');
    }
    try {
        // Use the remote API endpoint
        const response = await fetch('https://jeyder.com.ar/tolch/ecos/api.php');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        // Get the response text first to check if it's valid JSON
        const responseText = await response.text();
        let data;
        
        try {
            // Try to parse the response as JSON
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse response as JSON:', responseText.substring(0, 100) + '...');
            throw new Error(`Invalid JSON response from API: ${parseError.message}`);
        }
        
        updateStatus('connected', 'Successfully fetched data from Firebase');
        return data;
    } catch (error) {
        console.error("Error fetching Firebase data:", error);
        updateStatus('error', `Error fetching data: ${error.message}`);
        return null;
    }
}

/**
 * Find the newest entry in the Firebase data that wasn't in the previous data
 * @param {Object} currentData - The current Firebase data
 * @returns {Object|null} The newest entry or null if none found
 */
function findNewestEntry(currentData) {
    console.log('Finding newest entry in data...');
    
    if (!currentData || Object.keys(currentData).length === 0) {
        console.log('No data or empty data object');
        return null;
    }

    // If we don't have previous data yet, store this as previous and return null
    if (!previousData) {
        console.log('No previous data to compare with, storing current data as baseline');
        previousData = currentData;
        return null;
    }

    let newestEntry = null;
    let newestTimestamp = null;
    let newEntries = [];

    // Find entries that are in currentData but not in previousData
    for (const id in currentData) {
        // Skip if this entry was in the previous data
        if (previousData[id]) {
            continue;
        }

        const entry = currentData[id];
        console.log(`Found new entry with ID: ${id}`);
        
        // Check if entry has a timestamp field (could be named differently)
        let timestamp = null;
        if (entry.timestamp) {
            timestamp = entry.timestamp;
        } else if (entry.createdAt) {
            timestamp = entry.createdAt;
        } else if (entry.date) {
            timestamp = entry.date;
        }
        
        if (timestamp) {
            try {
                const entryDate = parseTimestamp(timestamp);
                newEntries.push({ id, entry, date: entryDate });
                
                // Check if this entry is newer than our current newest
                if (!newestTimestamp || entryDate > newestTimestamp) {
                    newestTimestamp = entryDate;
                    newestEntry = { id, ...entry };
                    console.log(`New newest entry: ${id} with date ${entryDate}`);
                }
            } catch (error) {
                console.error(`Error parsing timestamp for entry ${id}:`, error);
            }
        } else {
            console.log(`No timestamp found for entry ${id}`);
        }
    }
    
    // Update previousData with the current data for next comparison
    previousData = { ...currentData };
    
    console.log(`Found ${newEntries.length} new entries`);
    if (newEntries.length > 0) {
        console.log('New entries:', newEntries);
    }

    return newestEntry;
}

/**
 * Parse a timestamp string into a Date object
 * @param {string} timestamp - The timestamp string in various possible formats
 * @returns {Date} The parsed date
 */
function parseTimestamp(timestamp) {
    console.log(`Parsing timestamp: ${timestamp}`);
    
    // Try to detect the format of the timestamp
    let date;
    
    // Check if it's an ISO string or Firebase Timestamp
    if (typeof timestamp === 'string' && timestamp.includes('T')) {
        // ISO format: "2025-08-15T14:43:40.000Z"
        try {
            date = new Date(timestamp);
            console.log(`Parsed as ISO date: ${date}`);
            return date;
        } catch (e) {
            console.error('Failed to parse as ISO date:', e);
        }
    }
    
    // Check if it's a Firebase timestamp object
    if (typeof timestamp === 'object' && timestamp.seconds) {
        // Firebase Timestamp format
        try {
            date = new Date(timestamp.seconds * 1000);
            console.log(`Parsed as Firebase timestamp: ${date}`);
            return date;
        } catch (e) {
            console.error('Failed to parse as Firebase timestamp:', e);
        }
    }
    
    // Try DD/MM/YYYY, HH:MM:SS format
    try {
        if (typeof timestamp === 'string' && timestamp.includes('/') && timestamp.includes(':')) {
            // Expected format: "15/8/2025, 14:43:40"
            const parts = timestamp.split(', ');
            if (parts.length === 2) {
                const [datePart, timePart] = parts;
                const [day, month, year] = datePart.split('/');
                const [hours, minutes, seconds] = timePart.split(':');
                
                date = new Date(year, month - 1, day, hours, minutes, seconds);
                console.log(`Parsed as DD/MM/YYYY, HH:MM:SS: ${date}`);
                return date;
            }
        }
    } catch (e) {
        console.error('Failed to parse as DD/MM/YYYY, HH:MM:SS:', e);
    }
    
    // If all else fails, try to create a date directly
    try {
        date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            console.log(`Parsed as generic date: ${date}`);
            return date;
        }
    } catch (e) {
        console.error('Failed to parse as generic date:', e);
    }
    
    console.error(`Could not parse timestamp: ${timestamp}`);
    throw new Error(`Invalid timestamp format: ${timestamp}`);
}

/**
 * Process a new entry from Firebase
 * @param {Object} entry - The entry to process
 */
function processNewEntry(entry) {
    console.log("Processing entry:", entry);
    
    if (!entry) {
        console.log("Entry is null or undefined");
        updateStatus('error', 'Invalid entry data');
        return;
    }
    
    // Try to find the image prompt field - it might be in different locations based on the API response
    let imagePrompt = null;
    
    if (entry.imagePrompt) {
        imagePrompt = entry.imagePrompt;
    } else if (entry.prompt) {
        imagePrompt = entry.prompt;
    } else if (entry.text) {
        imagePrompt = entry.text;
    } else if (entry.content) {
        imagePrompt = entry.content;
    } else if (entry.message) {
        imagePrompt = entry.message;
    }
    
    // If we still don't have a prompt, check if there's a nested data structure
    if (!imagePrompt && entry.data && typeof entry.data === 'object') {
        const data = entry.data;
        if (data.imagePrompt) imagePrompt = data.imagePrompt;
        else if (data.prompt) imagePrompt = data.prompt;
        else if (data.text) imagePrompt = data.text;
        else if (data.content) imagePrompt = data.content;
        else if (data.message) imagePrompt = data.message;
    }
    
    if (!imagePrompt) {
        console.log("No valid prompt found in the entry");
        console.log("Entry keys:", Object.keys(entry));
        updateStatus('error', 'No valid prompt found in the new entry');
        return;
    }

    console.log("Processing new entry:", entry.id);
    console.log("Image prompt:", imagePrompt);
    updateStatus('connected', `Processing new entry: ${entry.id.substring(0, 8)}...`);
    
    // Set the prompt in the text field
    const promptField = document.getElementById('prompt');
    if (promptField) {
        promptField.value = imagePrompt;
        
        // Trigger the generate button click
        const generateButton = document.getElementById('generateButton');
        if (generateButton) {
            generateButton.click();
            
            // Store this ID as the last processed one
            lastProcessedId = entry.id;
            updateStatus('connected', `Generated image for entry: ${entry.id.substring(0, 8)}...`);
        } else {
            console.error("Generate button not found");
            updateStatus('error', 'Generate button not found');
        }
    } else {
        console.error("Prompt field not found");
        updateStatus('error', 'Prompt field not found');
    }
}

/**
 * Start listening for new entries in the Firebase database
 */
function startListening() {
    if (isListening) return;
    
    isListening = true;
    updateListenButtonState();
    
    console.log("Started listening for new Firebase entries");
    updateStatus('polling', 'Started listening for new Firebase entries');
    
    // Set up polling interval
    pollingInterval = setInterval(async () => {
        const data = await fetchFirebaseData();
        if (data) {
            // Find newest entry that wasn't in the previous data
            const newestEntry = findNewestEntry(data);
            if (newestEntry) {
                // Process only the newest entry
                processNewEntry(newestEntry);
                updateStatus('connected', `Processed new entry: ${newestEntry.id.substring(0, 8)}...`);
            } else {
                updateStatus('connected', 'No new entries found');
            }
        }
    }, pollingDelay);
}

/**
 * Stop listening for new entries in the Firebase database
 */
function stopListening() {
    if (!isListening) return;
    
    isListening = false;
    updateListenButtonState();
    
    console.log("Stopped listening for Firebase entries");
    updateStatus('connected', 'Stopped listening for Firebase entries');
    
    // Clear polling interval
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

/**
 * Toggle the listening state
 */
function toggleListening() {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

/**
 * Update the listen button state based on current listening status
 */
function updateListenButtonState() {
    const listenButton = document.getElementById('listenButton');
    if (listenButton) {
        listenButton.textContent = isListening ? 'STOP LISTENING' : 'START LISTENING';
        listenButton.classList.toggle('active', isListening);
    }
}

/**
 * Update the status indicator
 * @param {string} status - The status type ('connected', 'error', 'polling')
 * @param {string} message - The status message to display
 */
function updateStatus(status, message) {
    if (!statusElement) {
        statusElement = document.getElementById('firebaseStatus');
    }
    
    if (statusElement) {
        // Remove all status classes
        statusElement.classList.remove('connected', 'error', 'polling');
        
        // Add the appropriate class
        statusElement.classList.add(status);
        
        // Update the message
        statusElement.textContent = message;
    }
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get status element
    statusElement = document.getElementById('firebaseStatus');
    
    // Initialize Firebase
    initFirebase();
    
    // Set up the listen button
    const listenButton = document.getElementById('listenButton');
    if (listenButton) {
        listenButton.addEventListener('click', toggleListening);
        updateListenButtonState();
    }
});

// Export functions for external use
window.firebaseToComfy = {
    startListening,
    stopListening,
    toggleListening,
    isListening: () => isListening
};

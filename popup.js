/**
 * CA/PCA Extractor Chrome Extension
 * Popup controller script
 */

// Add to both popup.js and contentScript.js - top of file
const logDebug = (msg, data) => {
  console.log(`[CA/PCA Extractor] ${msg}`, data || '');
};

const logError = (msg, error) => {
  console.error(`[CA/PCA Extractor ERROR] ${msg}`, error);
};

// Add retry configuration
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 5000,
  BACKOFF_FACTOR: 2
};

// Enhanced state management
const state = {
  isProcessing: false,
  lastInboxResults: [],
  activeView: 'current',
  status: 'idle',
  retryCount: 0,
  currentOperation: null,
  lastError: null
};

// Loading indicators configuration
const LOADING_INDICATORS = {
  EXTRACTION: {
    message: 'Extracting data...',
    icon: 'hourglass_empty'
  },
  REFRESH: {
    message: 'Refreshing data...',
    icon: 'refresh'
  },
  DOWNLOAD: {
    message: 'Preparing download...',
    icon: 'download'
  }
};

// DOM Elements cache
const elements = {
  get currentEmailResults() { return document.getElementById("currentEmailResults"); },
  get inboxResults() { return document.getElementById("inboxResults"); },
  get extractButton() { return document.getElementById("extractAllButton"); },
  get refreshButton() { return document.getElementById("refreshButton"); },
  get downloadButton() { return document.getElementById("downloadCSV"); },
  get currentTab() { return document.getElementById("currentTab"); },
  get inboxTab() { return document.getElementById("inboxTab"); },
  get currentEmailSection() { return document.getElementById("currentEmailSection"); },
  get inboxSection() { return document.getElementById("inboxSection"); },
  get toast() { return document.getElementById("toast"); },
  get toastMessage() { return document.getElementById("toastMessage"); },
  get statusDot() { return document.getElementById("statusDot"); },
  get statusText() { return document.getElementById("statusText"); }
};

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // First log that initialization started
  logDebug('Popup initialized, setting up event listeners');
  
  // Set up event listeners with explicit function and error logging
  elements.extractButton.addEventListener("click", function() {
    logDebug('Extract button clicked');
    try {
      extractAssessments(false);
    } catch(e) {
      logError('Extract button click handler error', e);
    }
  });
  
  elements.refreshButton.addEventListener("click", () => extractAssessments(true));
  elements.downloadButton.addEventListener("click", handleCSVDownload);
  
  // Set up tab event listeners
  elements.currentTab.addEventListener("click", () => switchView('current'));
  elements.inboxTab.addEventListener("click", () => switchView('inbox'));
  
  // Load cached results and restore last active view
  loadCachedResults();
  restoreLastActiveView();
  
  // Update status indicator
  updateStatusIndicator('idle', 'Ready');
});

/**
 * Updates the status indicator in the UI
 * @param {string} status - The status: 'idle', 'running', 'success', 'error'
 * @param {string} text - The status text to display
 */
const updateStatusIndicator = (status, text) => {
  try {
    state.status = status;
    
    // Update dot class
    elements.statusDot.className = 'dot ' + status;
    
    // Update status text
    elements.statusText.textContent = text;
    
    // Optional animation or transition
    elements.statusDot.animate([
      { transform: 'scale(1.2)', opacity: 0.7 },
      { transform: 'scale(1)', opacity: 1 }
    ], {
      duration: 300,
      easing: 'ease-out'
    });
  } catch (error) {
    console.error('Failed to update status indicator', error);
  }
};

/**
 * Switches between current email and inbox views
 * @param {string} view - The view to switch to ('current' or 'inbox')
 */
const switchView = (view) => {
  if (state.isProcessing) return; // Don't switch while processing
  
  state.activeView = view;
  saveActiveView();
  
  if (view === 'current') {
    elements.currentTab.classList.add('active');
    elements.inboxTab.classList.remove('active');
    elements.currentEmailSection.style.display = 'block';
    elements.inboxSection.style.display = 'none';
  } else {
    elements.inboxTab.classList.add('active');
    elements.currentTab.classList.remove('active');
    elements.currentEmailSection.style.display = 'none';
    elements.inboxSection.style.display = 'block';
  }
  
  // Add a subtle slide animation
  const activeSection = view === 'current' ? elements.currentEmailSection : elements.inboxSection;
  activeSection.animate([
    { transform: 'translateX(10px)', opacity: 0.8 },
    { transform: 'translateX(0)', opacity: 1 }
  ], {
    duration: 250,
    easing: 'ease-out'
  });
};

/**
 * Saves the current active view to storage
 */
const saveActiveView = async () => {
  try {
    await chrome.storage.local.set({ activeView: state.activeView });
  } catch (error) {
    console.error('Failed to save active view', error);
  }
};

/**
 * Restores the last active view from storage
 */
const restoreLastActiveView = async () => {
  try {
    const { activeView } = await chrome.storage.local.get("activeView");
    if (activeView) {
      switchView(activeView);
    }
  } catch (error) {
    console.error('Failed to restore active view', error);
  }
};

/**
 * Loads previously cached extraction results
 */
const loadCachedResults = async () => {
  try {
    const { lastAssessmentExtract } = await chrome.storage.local.get("lastAssessmentExtract");
    if (lastAssessmentExtract) {
      state.lastInboxResults = lastAssessmentExtract.inbox || [];
      updateUI(lastAssessmentExtract);
      toggleDownloadButton();
      
      if (lastAssessmentExtract.timestamp) {
        const lastUpdateTime = new Date(lastAssessmentExtract.timestamp).toLocaleTimeString();
        updateStatusIndicator('success', `Last updated: ${lastUpdateTime}`);
      }
    }
  } catch (error) {
    handleError('Failed to load cached results', error);
    updateStatusIndicator('error', 'Failed to load cache');
  }
};

/**
 * Shows a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast: 'success', 'error', or 'info'
 * @param {number} duration - Duration in ms
 */
const showToast = (message, type = 'info', duration = 3000) => {
  try {
    const toast = elements.toast;
    const toastMessage = elements.toastMessage;
    
    // Set toast content
    toastMessage.textContent = message;
    
    // Set toast icon based on type
    const iconElement = toast.querySelector('.material-icons-round');
    if (iconElement) {
      switch (type) {
        case 'success':
          iconElement.textContent = 'check_circle';
          break;
        case 'error':
          iconElement.textContent = 'error';
          break;
        default:
          iconElement.textContent = 'info';
      }
    }
    
    // Reset classes and add appropriate type
    toast.className = 'toast';
    toast.classList.add(type);
    
    // Show the toast
    setTimeout(() => toast.classList.add('visible'), 10);
    
    // Hide the toast after duration
    setTimeout(() => {
      toast.classList.remove('visible');
    }, duration);
  } catch (error) {
    console.error('Failed to show toast notification', error);
  }
};

/**
 * Retry wrapper for async operations
 * @param {Function} operation - Async function to retry
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} - Result of the operation
 */
const withRetry = async (operation, operationName) => {
  let attempt = 0;
  let delay = RETRY_CONFIG.INITIAL_DELAY;
  
  while (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
    try {
      state.retryCount = attempt;
      state.currentOperation = operationName;
      return await operation();
    } catch (error) {
      attempt++;
      state.lastError = error;
      
      if (attempt === RETRY_CONFIG.MAX_ATTEMPTS) {
        throw error;
      }
      
      // Calculate next delay with exponential backoff
      delay = Math.min(delay * RETRY_CONFIG.BACKOFF_FACTOR, RETRY_CONFIG.MAX_DELAY);
      
      // Show retry status
      updateStatusIndicator('running', `Retrying ${operationName} (${attempt}/${RETRY_CONFIG.MAX_ATTEMPTS})...`);
      showToast(`Retrying ${operationName}...`, 'info', delay);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Enhanced extraction function with retry logic
 * @param {boolean} forceRefresh - Whether to force refresh data from Gmail
 */
const extractAssessments = async (forceRefresh = false) => {
  if (state.isProcessing) return;
  
  setProcessingState(true);
  const operationType = forceRefresh ? 'REFRESH' : 'EXTRACTION';
  updateStatusIndicator('running', LOADING_INDICATORS[operationType].message);
  
  try {
    const tab = await withRetry(() => getActiveGmailTab(), 'getActiveGmailTab');
    
    if (forceRefresh) {
      await withRetry(() => reinjectContentScript(tab.id), 'reinjectContentScript');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const response = await withRetry(
      () => requestExtraction(tab.id, forceRefresh),
      'requestExtraction'
    );
    
    // Process and update UI
    await processExtractionResponse(response);
    
  } catch (error) {
    handleError('Extraction failed', error);
    updateStatusIndicator('error', 'Extraction failed');
  } finally {
    setProcessingState(false);
    state.retryCount = 0;
    state.currentOperation = null;
  }
};

/**
 * Process extraction response and update UI
 * @param {Object} response - The extraction response
 */
const processExtractionResponse = async (response) => {
  try {
    logDebug('Processing extraction response', response);
    
    if (!response) {
      throw new Error('Invalid response: Empty response received');
    }
    
    if (!response.data && !response.success) {
      throw new Error('Invalid response: Missing data and success status');
    }
    
    // Handle different response formats (for backward compatibility)
    const responseData = response.data || response;
    
    // Validate that we have the expected structure
    if (!responseData.inbox && !responseData.currentEmail) {
      logError('Invalid response data structure', responseData);
      throw new Error('Invalid response format: Missing inbox and currentEmail properties');
    }
    
    // Ensure we have default empty arrays for missing properties
    const normalizedData = {
      currentEmail: responseData.currentEmail || { 
        caSentences: [], 
        pcaSentences: [], 
        recipients: [] 
      },
      inbox: responseData.inbox || []
    };
    
    // Check if inbox data is empty but should have content
    if (normalizedData.inbox.length === 0) {
      logDebug('No inbox results found, this could be normal or indicate an issue');
    } else {
      logDebug(`Found ${normalizedData.inbox.length} inbox results`);
    }
    
    // Store the results for later use
    state.lastInboxResults = normalizedData.inbox || [];
    
    // Cache the results
    await chrome.storage.local.set({
      lastAssessmentExtract: {
        ...normalizedData,
        timestamp: Date.now()
      }
    });
    
    // Update UI with new data
    updateUI(normalizedData);
    toggleDownloadButton();
    
    // Show success message with appropriate details
    if (normalizedData.inbox.length > 0) {
      showToast(`Found ${normalizedData.inbox.length} emails with assessments`, 'success');
      updateStatusIndicator('success', `Found ${normalizedData.inbox.length} emails`);
    } else if (normalizedData.currentEmail.caSentences.length > 0 || 
               normalizedData.currentEmail.pcaSentences.length > 0) {
      const totalMatches = normalizedData.currentEmail.caSentences.length + 
                          normalizedData.currentEmail.pcaSentences.length;
      showToast(`Found ${totalMatches} assessment matches in current email`, 'success');
      updateStatusIndicator('success', `Found ${totalMatches} matches`);
    } else {
      showToast('No assessment matches found', 'info');
      updateStatusIndicator('success', 'No matches found');
    }
    
  } catch (error) {
    logError('Failed to process extraction response', error);
    
    // Show toast with appropriate error message
    showToast(`Error: ${error.message}`, 'error');
    updateStatusIndicator('error', 'Processing failed');
    
    // Rethrow the error for higher-level handling
    throw error;
  }
};

/**
 * Gets the active Gmail tab
 * @returns {Promise<chrome.tabs.Tab>}
 */
const getActiveGmailTab = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error("No active tab found.");
    }
    
    if (!tab.url?.includes("mail.google.com")) {
      throw new Error("Please open Gmail to use this extension.");
    }
    
    return tab;
  } catch (error) {
    throw new Error(`Tab access error: ${error.message}`);
  }
};

/**
 * Reinjects the content script
 * @param {number} tabId - Chrome tab ID
 */
const reinjectContentScript = async (tabId) => {
  try {
    logDebug('Reinjecting content script');
    
    // First try to ping existing content script
    try {
      const pingResponse = await chrome.tabs.sendMessage(tabId, { type: "ping" });
      logDebug('Content script responded to ping', pingResponse);
      // If we get here, script exists and is responding, no need to reinject
      return;
    } catch (pingError) {
      logDebug('Content script not responding, will reinject', pingError);
      // Continue with injection
    }
    
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js'],
      injectImmediately: true
    });
    
    // Increased delay to ensure DOM is ready
    return new Promise(resolve => setTimeout(resolve, 800));
  } catch (error) {
    logError('Failed to reinject script', error);
    throw new Error(`Failed to reinject script: ${error.message}`);
  }
};

/**
 * Sends extraction request to content script
 * @param {number} tabId - Chrome tab ID
 * @param {boolean} forceRefresh - Whether to force refresh
 */
const requestExtraction = async (tabId, forceRefresh) => {
  try {
    logDebug(`Sending extraction request to tab ${tabId}, forceRefresh: ${forceRefresh}`);
    
    // Add timeout for response
    const timeoutMs = 30000; // 30 seconds timeout
    
    // Create a promise that will reject after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs/1000} seconds`)), timeoutMs);
    });
    
    // Create the request promise
    const requestPromise = new Promise(async (resolve, reject) => {
      try {
        chrome.tabs.sendMessage(
          tabId, 
          { 
            type: "extractPCAFromAll",
            forceRefresh 
          },
          response => {
            const error = chrome.runtime.lastError;
            if (error) {
              logError('Chrome runtime error during extraction request', error);
              return reject(new Error(error.message));
            }
            
            logDebug('Received response from content script', response);
            resolve(response);
          }
        );
      } catch (error) {
        logError('Error sending message to tab', error);
        reject(error);
      }
    });
    
    // Race between request and timeout
    const response = await Promise.race([requestPromise, timeoutPromise]);
    
    // Add validation of response data structure
    if (!response) {
      throw new Error("No response received from Gmail");
    }
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    if (!response.success) {
      throw new Error("Failed to extract data from Gmail");
    }
    
    // If response doesn't have data property, wrap it in data property
    if (!response.data && (response.currentEmail || response.inbox)) {
      return {
        success: true,
        data: {
          currentEmail: response.currentEmail || { caSentences: [], pcaSentences: [], recipients: [] },
          inbox: response.inbox || []
        }
      };
    }
    
    return response;
  } catch (error) {
    logError("Extraction request failed", error);
    
    // More specific error handling with helpful user messages
    if (error.message?.includes('receiving end does not exist')) {
      throw new Error('Gmail page may be loading or extension needs to be reloaded. Try refreshing the page.');
    }
    
    if (error.message?.includes('timed out')) {
      throw new Error('Request took too long. Gmail may be busy or not fully loaded. Try again in a moment.');
    }
    
    throw new Error(`Communication failed: ${error.message}. Try reloading the page.`);
  }
};

/**
 * Formats a date string for better readability
 * @param {string} dateStr - Date string from Gmail
 * @returns {string} - Formatted date
 */
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  
  try {
    // Handle Gmail relative date formats
    const relativeDateMap = {
      'today': new Date(),
      'yesterday': new Date(Date.now() - 86400000)
    };
    
    const lowerDateStr = dateStr.toLowerCase();
    if (relativeDateMap[lowerDateStr]) {
      return relativeDateMap[lowerDateStr].toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    
    // If it's just a time (like "3:45 PM"), add today's date
    if (/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(dateStr)) {
      const today = new Date();
      return `${today.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })} ${dateStr}`;
    }
    
    // If it's just a date without year (like "Jan 15"), add current year
    if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/i.test(dateStr)) {
      return `${dateStr}, ${new Date().getFullYear()}`;
    }
    
    // Try to parse as a regular date
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    // Return the original if no patterns match
    return dateStr; 
  } catch (error) {
    console.warn("Date formatting error:", error);
    return dateStr; // Fallback to original
  }
};

/**
 * Format recipient emails for display
 * @param {string|Array} recipients - Recipient email(s)
 * @returns {string} - Formatted recipient display
 */
const formatRecipients = (recipients) => {
  if (!recipients) return "N/A";
  
  // If it's already a string, return it or "N/A" if empty
  if (typeof recipients === 'string') {
    return recipients.trim() || "N/A";
  }
  
  // If it's an array, join with commas (up to 3 recipients)
  if (Array.isArray(recipients)) {
    if (recipients.length === 0) return "N/A";
    
    if (recipients.length <= 3) {
      return recipients.join(", ");
    } else {
      // If more than 3 recipients, show first 2 and count of others
      return `${recipients.slice(0, 2).join(", ")} +${recipients.length - 2} more`;
    }
  }
  
  return "N/A";
};

/**
 * Handles CSV download
 */
const handleCSVDownload = () => {
  if (!state.lastInboxResults.length) {
    showToast('No results to download.', 'error');
    return;
  }

  try {
    updateStatusIndicator('running', 'Preparing CSV...');
    
    // Create BOM for proper UTF-8 encoding
    const BOM = '\uFEFF';
    
    // Create CSV header with all fields
    const csvHeader = [
      "Index",
      "Sender",
      "Recipient",
      "Subject",
      "Date",
      "CA Matches",
      "PCA Matches",
      "Snippet"
    ].join(",");
    
    // Create CSV rows with proper escaping
    const csvRows = state.lastInboxResults.map(item => {
      return [
        item.index || '',
        escapeCsvField(item.sender || ''),
        escapeCsvField(item.recipient || 'N/A'),
        escapeCsvField(item.subject || ''),
        escapeCsvField(item.date || ''),
        escapeCsvField((item.caMatches || []).length.toString()),
        escapeCsvField((item.pcaMatches || []).length.toString()),
        escapeCsvField(item.snippet || '')
      ].join(",");
    });
    
    // Combine header and rows
    const csvContent = BOM + [csvHeader, ...csvRows].join("\r\n");

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `assessment_inbox_results_${timestamp}.csv`;
    
    // Create and download the file
    downloadFile(filename, csvContent);
    
    showToast(`CSV file '${filename}' downloaded successfully`, 'success');
    updateStatusIndicator('success', 'CSV exported');
  } catch (error) {
    showToast(`Download failed: ${error.message}`, 'error');
    console.error('CSV download error:', error);
    updateStatusIndicator('error', 'CSV export failed');
  }
};

/**
 * Properly escapes fields for CSV format
 * Handles commas, quotes, and newlines
 * @param {string} field - Field to escape
 * @returns {string} - Escaped field ready for CSV
 */
const escapeCsvField = (field) => {
  if (field === null || field === undefined) return '""';
  
  // Convert to string and handle empty values
  let str = String(field).trim();
  if (!str) return '""';
  
  // Replace newlines with spaces (important for snippet fields)
  str = str.replace(/\n/g, ' ').replace(/\r/g, ' ');
  
  // Escape double quotes with double quotes and wrap in quotes regardless
  // Always wrap in quotes to avoid issues with commas or special characters
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Creates and triggers download of a file
 * @param {string} filename - Name of file to download
 * @param {string} text - Content of file
 */
const downloadFile = (filename, text) => {
  try {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('File download error:', error);
    showToast('Download failed. Please try again.', 'error');
  }
};

/**
 * Updates UI with extraction results
 * @param {Object} data - Extraction results
 */
const updateUI = ({ currentEmail = { caSentences: [], pcaSentences: [], recipients: [] }, inbox = [] }) => {
  try {
    // Update current email section with CA and PCA matches and recipients
    const hasCAMatches = currentEmail.caSentences && currentEmail.caSentences.length > 0;
    const hasPCAMatches = currentEmail.pcaSentences && currentEmail.pcaSentences.length > 0;
    
    if (hasCAMatches || hasPCAMatches) {
      // Start with recipient information
      let recipientContent = '';
      if (currentEmail.recipients && currentEmail.recipients.length > 0) {
        recipientContent = `
          <div class="recipient-info">
            <p><span class="label">To:</span> <span class="date-value">${formatRecipients(currentEmail.recipients)}</span></p>
          </div>
        `;
      }
      
      // Create content for CA matches
      let caContent = '';
      if (hasCAMatches) {
        caContent = `
          <div class="assessment-section">
            <h3 class="assessment-title" title="Class Assessment">
              <span class="assessment-type">CA (Class Assessment)</span>
            </h3>
            ${currentEmail.caSentences.map((t, i) => `
              <div class="result-item">
                <p>Match ${i + 1}: ${t}</p>
              </div>
            `).join("")}
          </div>
        `;
      }
      
      // Create content for PCA matches
      let pcaContent = '';
      if (hasPCAMatches) {
        pcaContent = `
          <div class="assessment-section">
            <h3 class="assessment-title" title="Practical Class Assessment">
              <span class="assessment-type">PCA (Practical Class Assessment)</span>
            </h3>
            ${currentEmail.pcaSentences.map((t, i) => `
              <div class="result-item">
                <p>Match ${i + 1}: ${t}</p>
              </div>
            `).join("")}
          </div>
        `;
      }
      
      // Display results
      elements.currentEmailResults.innerHTML = recipientContent + caContent + pcaContent;
    } else {
      elements.currentEmailResults.innerHTML = `
        <div class="no-results">
          <span class="material-icons-round">search_off</span>
          <p>No assessments found in this email.</p>
        </div>
      `;
    }

    // Update inbox section with dates and assessment information
    if (inbox.length > 0) {
      elements.inboxResults.innerHTML = inbox.map(item => {
        const caCount = item.caMatches?.length || 0;
        const pcaCount = item.pcaMatches?.length || 0;
        
        return `
          <div class="result-item">
            <p><span>#${item.index || ''}:</span> ${item.subject || 'No Subject'}</p>
            <div class="email-metadata">
              <p>From: <span class="sender-value">${item.sender || 'Unknown Sender'}</span></p>
              <p>To: <span class="recipient-value">${item.recipient || 'N/A'}</span></p>
              ${item.date ? `<p>Date: <span class="date-value">${formatDate(item.date)}</span></p>` : ''}
            </div>
            <div class="assessment-counts">
              ${caCount > 0 ? `<span class="count-badge ca-badge" title="Class Assessment">CA: ${caCount}</span>` : ''}
              ${pcaCount > 0 ? `<span class="count-badge pca-badge" title="Practical Class Assessment">PCA: ${pcaCount}</span>` : ''}
            </div>
            <p class="snippet-text">Snippet: ${item.snippet || 'No preview available'}</p>
          </div>
        `;
      }).join("");
      
      // Add result count badge
      elements.inboxTab.innerHTML = `
        Inbox Search <span class="badge">${inbox.length}</span>
      `;
    } else {
      elements.inboxResults.innerHTML = `
        <div class="no-results">
          <span class="material-icons-round">inbox</span>
          <p>No assessments found in inbox.</p>
        </div>
      `;
      
      // Reset tab text
      elements.inboxTab.textContent = "Inbox Search";
    }
      
    toggleDownloadButton();
    
    // Animate new results
    animateNewResults();
  } catch (error) {
    console.error('UI update error:', error);
    handleError('Failed to update UI', error);
  }
};

/**
 * Animates new results when they are added
 */
const animateNewResults = () => {
  const items = document.querySelectorAll('.result-item');
  
  // Stagger animation for each result item
  items.forEach((item, index) => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
      item.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], {
        duration: 300,
        easing: 'ease-out',
        fill: 'forwards'
      });
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    }, 50 * index);
  });
};

/**
 * Sets the processing state
 * @param {boolean} isLoading - Whether the app is in a loading state
 */
const setProcessingState = (isLoading) => {
  state.isProcessing = isLoading;
  
  try {
    elements.extractButton.textContent = isLoading ? "⏳ Scanning..." : "Extract Assessments from Email & Inbox";
    elements.refreshButton.textContent = isLoading ? "⏳" : "↻";
    
    elements.extractButton.disabled = isLoading;
    elements.refreshButton.disabled = isLoading;
    elements.downloadButton.disabled = isLoading || state.lastInboxResults.length === 0;
    elements.currentTab.style.pointerEvents = isLoading ? 'none' : 'auto';
    elements.inboxTab.style.pointerEvents = isLoading ? 'none' : 'auto';
    
    // Add loading indicator to the active section
    const activeSection = state.activeView === 'current' ? elements.currentEmailResults : elements.inboxResults;
    if (isLoading) {
      activeSection.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <p>Scanning Gmail for CA and PCA info...</p>
          <div class="progress-container">
            <div class="progress-bar"></div>
          </div>
        </div>
      `;
      document.body.classList.add('loading');
      
      // Add pulsing effect to buttons
      if (elements.extractButton) {
        elements.extractButton.classList.add('pulsing');
      }
    } else {
      document.body.classList.remove('loading');
      
      // Remove pulsing effect
      if (elements.extractButton) {
        elements.extractButton.classList.remove('pulsing');
      }
    }
  } catch (error) {
    console.error('Error setting processing state:', error);
  }
};

/**
 * Toggles download button state based on results
 */
const toggleDownloadButton = () => {
  elements.downloadButton.disabled = state.isProcessing || state.lastInboxResults.length === 0;
  
  // Add a visual indicator if there are results available for download
  if (state.lastInboxResults.length > 0) {
    elements.downloadButton.classList.add('has-data');
    
    // Add tooltip with count
    elements.downloadButton.setAttribute('data-tooltip', 
      `Export ${state.lastInboxResults.length} results to CSV`);
  } else {
    elements.downloadButton.classList.remove('has-data');
    elements.downloadButton.setAttribute('data-tooltip', 'No data to export');
  }
};

/**
 * Handles errors and displays them to the user
 * @param {string} context - Context of the error
 * @param {Error} error - Error object
 */
const handleError = (context, error) => {
  console.error(`Assessment Extractor Error (${context}):`, error);
  const errorMessage = error.message || 'Unknown error occurred';
  
  // Only update the active view to prevent hiding content in the inactive tab
  const targetElement = state.activeView === 'current' ? elements.currentEmailResults : elements.inboxResults;
  
  targetElement.innerHTML = `
    <div class="error">
      <span class="material-icons-round">error_outline</span>
      <p><strong>Error:</strong> ${errorMessage}</p>
      <p class="error-help">Try refreshing Gmail or reloading the extension.</p>
    </div>
  `;
};

/**
 * Gets inbox rows from Gmail with robust error handling and logging
 * @returns {Array} Array of inbox row elements
 */
const getInboxRows = () => {
  try {
    logDebug('Starting inbox row extraction');
    
    // More comprehensive selectors for modern Gmail
    const selectors = [
      'tr.zA', // Standard inbox row 
      'tr[role="row"]', // Alternative row format
      '.Cp tbody tr', // Another common format
      'div[role="main"] .zA', // For some custom views
      '.zt .zA', // Alternate view format
      'table.F tbody tr', // Additional potential selector
      '.AO table tbody tr', // Another Gmail layout
      '[role="grid"] [role="row"]', // New Gmail interface
      '.zE', // Additional selector for some views
      '.yW', // For conversation view
      '.xW', // For search results
      '.y6', // For custom labels
      '.yP', // For starred emails
      '.yO'  // For important emails
    ];

    let rows = [];
    let selectorUsed = '';

    // Try each selector until we find rows
    for (const selector of selectors) {
      try {
        const foundRows = document.querySelectorAll(selector);
        if (foundRows.length > 0) {
          logDebug(`Found ${foundRows.length} rows using selector: ${selector}`);
          rows = Array.from(foundRows);
          selectorUsed = selector;
          break;
        }
      } catch (selectorError) {
        logError(`Error with selector ${selector}`, selectorError);
      }
    }

    if (rows.length === 0) {
      logError('No inbox rows found with any selector');
      return [];
    }

    // Filter out any non-email rows (like labels, dividers, etc.)
    rows = rows.filter(row => {
      try {
        // Check if row has email-specific elements
        const hasEmailElements = row.querySelector('.yW, .xW, .y6, .yP, .yO, [role="gridcell"]');
        return hasEmailElements !== null;
      } catch (filterError) {
        logError('Error filtering row', filterError);
        return false;
      }
    });

    logDebug(`Found ${rows.length} valid email rows using selector: ${selectorUsed}`);
    return rows;
  } catch (error) {
    logError('Critical error in getInboxRows', error);
    return [];
  }
};
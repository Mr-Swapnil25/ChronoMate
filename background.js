// Service worker for Manifest V3
// Keep track of active connections
const connections = new Map();

// Extension installation and update handling
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    console.log(`PCA Extractor ${details.reason}:`, details);
    
    // Perform any necessary setup actions based on installation reason
    if (details.reason === 'install') {
      // First-time installation actions
      await setupExtension();
    } else if (details.reason === 'update') {
      // Update-specific actions
      const currentVersion = chrome.runtime.getManifest().version;
      console.log(`Updated to version ${currentVersion}`);
    }
  } catch (error) {
    console.error('Error during installation:', error);
  }
});

// Service worker activation
self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
  // Claim clients to ensure the service worker takes control immediately
  event.waitUntil(clients.claim());
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('Received message:', message, 'from:', sender);
    
    // Return true to indicate you'll respond asynchronously
    if (message.type === 'asyncOperation') {
      handleAsyncOperation(message.data)
        .then(result => sendResponse(result))
        .catch(error => {
          console.error('Async operation error:', error);
          sendResponse({ error: error.message });
        });
      return true; // Keep the messaging channel open for async response
    }
    
    // Handle synchronous operations directly
    if (message.type === 'getData') {
      return handleGetData(message.data);
    }
    
    // Default response for unknown message types
    sendResponse({ status: 'unknown_message_type' });
  } catch (error) {
    console.error('Error processing message:', error);
    sendResponse({ error: error.message });
  }
  
  return false; // For synchronous responses
});

// Content script connection handling
chrome.runtime.onConnect.addListener((port) => {
  const connectionId = port.name || Date.now().toString();
  console.log(`New connection established: ${connectionId}`);
  
  // Store the connection
  connections.set(connectionId, port);
  
  // Listen for messages on this connection
  port.onMessage.addListener(async (message) => {
    try {
      console.log(`Message from ${connectionId}:`, message);
      
      // Process message and respond
      if (message.action) {
        const result = await processAction(message.action, message.data);
        port.postMessage({ result });
      }
    } catch (error) {
      console.error(`Error handling message from ${connectionId}:`, error);
      port.postMessage({ error: error.message });
    }
  });
  
  // Clean up when connection closes
  port.onDisconnect.addListener(() => {
    console.log(`Connection closed: ${connectionId}`);
    connections.delete(connectionId);
    
    if (chrome.runtime.lastError) {
      console.error('Connection error:', chrome.runtime.lastError);
    }
  });
});

// Handle extension update or browser update
chrome.runtime.onUpdateAvailable.addListener((details) => {
  console.log('Update available:', details);
  // Perform cleanup before update
  cleanupBeforeUpdate()
    .then(() => chrome.runtime.reload())
    .catch(error => console.error('Error during update cleanup:', error));
});

// Unload handling - cleanup resources
self.addEventListener('unload', async () => {
  try {
    console.log('Service worker unloading');
    await cleanupResources();
  } catch (error) {
    console.error('Error during unload cleanup:', error);
  }
});

/**
 * Handle async operations
 * @param {Object} data - The data for the operation
 * @returns {Promise<Object>} - Result of the operation
 */
async function handleAsyncOperation(data) {
  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format');
    }
    
    // Example async operation - replace with actual implementation
    const result = await new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'success',
          timestamp: Date.now(),
          processedData: data
        });
      }, 100);
    });
    
    return result;
  } catch (error) {
    console.error('Async operation failed:', error);
    throw error;
  }
}

/**
 * Handle data retrieval
 * @param {Object} params - Parameters for the data retrieval
 * @returns {Object} - The requested data
 */
function handleGetData(params) {
  try {
    if (!params || typeof params !== 'object') {
      throw new Error('Invalid parameters');
    }
    
    // Example data retrieval - replace with actual implementation
    return {
      status: 'success',
      data: {
        timestamp: Date.now(),
        params: params
      }
    };
  } catch (error) {
    console.error('Data retrieval failed:', error);
    throw error;
  }
}

/**
 * Process actions from content scripts
 * @param {string} action - The action to perform
 * @param {Object} data - Data for the action
 * @returns {Promise<Object>} - Result of the action
 */
async function processAction(action, data) {
  switch (action) {
    case 'extract':
      return await extractData(data);
    case 'analyze':
      return await analyzeData(data);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Extract data based on provided parameters
 * @param {Object} params - Extraction parameters
 * @returns {Promise<Object>} - Extracted data
 */
async function extractData(params) {
  // Implement extraction logic
  return { extracted: true, data: params };
}

/**
 * Analyze provided data
 * @param {Object} data - Data to analyze
 * @returns {Promise<Object>} - Analysis results
 */
async function analyzeData(data) {
  // Implement analysis logic
  return { analyzed: true, results: data };
}

/**
 * Initial extension setup
 * @returns {Promise<void>}
 */
async function setupExtension() {
  try {
    console.log('Setting up extension for first use');
    
    // Initialize storage with default values
    await chrome.storage.local.set({
      lastUpdate: Date.now(),
      settings: {
        enabled: true,
        autoExtract: true,
        notificationEnabled: true
      }
    });
    
    // Set up initial permissions
    await chrome.permissions.request({
      permissions: ['storage'],
      origins: ['https://mail.google.com/*']
    });
    
    console.log('Extension setup completed successfully');
  } catch (error) {
    console.error('Extension setup failed:', error);
    throw error;
  }
}

/**
 * Clean up resources before unloading
 * @returns {Promise<void>}
 */
async function cleanupResources() {
  // Close all open connections
  for (const [id, port] of connections.entries()) {
    try {
      console.log(`Closing connection: ${id}`);
      port.disconnect();
    } catch (error) {
      console.error(`Error closing connection ${id}:`, error);
    }
  }
  connections.clear();
}

/**
 * Perform cleanup actions before update
 * @returns {Promise<void>}
 */
async function cleanupBeforeUpdate() {
  return cleanupResources();
}
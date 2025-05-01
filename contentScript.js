/**
 * Gmail CA/PCA Email Scanner
 * Modern content script that extracts CA and PCA-related information from Gmail
 */

// Utility functions
const getText = (el) => el?.textContent?.trim() || "";

/**
 * Check if an email is currently open in Gmail
 * @returns {boolean} Whether an email is open for viewing
 */
const isEmailOpen = () => {
  try {
    // Look for common email container elements in Gmail
    const emailViewSelectors = [
      // Modern Gmail email container
      '.a3s',
      // Email body container
      '.gs .ii',
      // Legacy view email container
      '.adP',
      // Message container
      '[role="main"] [data-message-id], [role="main"] [data-legacy-message-id]'
    ];
    
    // Check if any email view selector is present and visible
    for (const selector of emailViewSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // Check if element is visible and in the DOM
        if (el && el.isConnected && !el.closest('[aria-hidden="true"]') && el.offsetParent !== null) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if email is open:', error);
    return false;
  }
};

/**
 * Gets element by selector with null safety
 * @param {Element} root - Root element to search within
 * @param {string} selector - CSS selector
 * @returns {Element|null} Found element or null
 */
const safeQuerySelector = (root, selector) => {
  try {
    return root?.querySelector(selector) || null;
  } catch (error) {
    console.error(`Selector error for "${selector}":`, error);
    return null;
  }
};

// DOM query cache to improve performance
const queryCache = new Map();
const cachedQuery = (selector, root = document) => {
  const cacheKey = `${root === document ? 'doc' : 'custom'}:${selector}`;
  if (!queryCache.has(cacheKey)) {
    try {
      queryCache.set(cacheKey, root.querySelectorAll(selector));
    } catch (error) {
      console.error(`DOM query failed for: ${selector}`, error);
      queryCache.set(cacheKey, []);
    }
  }
  return queryCache.get(cacheKey);
};

// Clear cache on page changes
const clearCache = () => queryCache.clear();

// Row data cache for inbox rows
const rowCache = new Map();
const ROW_CACHE_LIFETIME_MS = 30000; // 30 seconds cache for rows

/**
 * Check row cache for existing data
 * @param {string} rowId - Unique row identifier
 * @returns {Object|null} Cached row data or null
 */
const checkRowCache = (rowId) => {
  if (!rowId) return null;
  
  try {
    const cachedData = rowCache.get(rowId);
    if (!cachedData) return null;
    
    const now = Date.now();
    // Check if cache is still valid (not expired)
    if (now - cachedData.timestamp < ROW_CACHE_LIFETIME_MS) {
      console.log(`Using cached data for row ${rowId}`);
      return cachedData.data;
    }
    
    // Cache expired, remove it
    rowCache.delete(rowId);
    return null;
  } catch (error) {
    console.error('Error checking row cache:', error);
    return null;
  }
};

/**
 * Cache row data for future use
 * @param {string} rowId - Unique row identifier
 * @param {Object} data - Row data to cache
 */
const cacheRowData = (rowId, data) => {
  if (!rowId || !data) return;
  
  try {
    rowCache.set(rowId, {
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error caching row data:', error);
  }
};

/**
 * Validate if the context contains relevant keywords for CA or PCA
 * @param {string} text - The text to validate
 * @param {string} type - Either 'ca' or 'pca' to specify which context to check
 * @returns {boolean} Whether the context is valid
 */
const validateContext = (text, type) => {
  if (!text || typeof text !== 'string') return false;
  
  try {
    const normalizedText = text.toLowerCase();
    
    if (type === 'ca') {
      // Check if CA appears near assessment-related terms
      const caContextKeywords = ['exam', 'test', 'assessment', 'submission', 'grading', 'score', 'mark', 'grade', 'assignment', 'due', 'deadline', 'class assessment'];
      
      // Use a regex to check if CA is within 20 characters of a context keyword
      for (const keyword of caContextKeywords) {
        // Look for "CA" near context keywords (within ~20 chars before or after)
        const caPatternNearKeyword = new RegExp(`(${keyword}.{0,20}\\bCA\\b|\\bCA\\b.{0,20}${keyword})`, 'i');
        if (caPatternNearKeyword.test(normalizedText)) {
          return true;
        }
      }
      
      // Also validate if "Class Assessment" is explicitly mentioned
      if (/\bclass\s+assessment\b/i.test(normalizedText)) {
        return true;
      }
      
      return false;
    } else if (type === 'pca') {
      // Check if PCA appears near practical-related terms
      const pcaContextKeywords = ['practical', 'lab', 'workshop', 'hands-on', 'session', 'exercise', 'project', 'experiment', 'demonstration', 'practical class assessment'];
      
      // Use a regex to check if PCA is within 20 characters of a context keyword
      for (const keyword of pcaContextKeywords) {
        // Look for "PCA" near context keywords (within ~20 chars before or after)
        const pcaPatternNearKeyword = new RegExp(`(${keyword}.{0,20}\\bPCA\\b|\\bPCA\\b.{0,20}${keyword})`, 'i');
        if (pcaPatternNearKeyword.test(normalizedText)) {
          return true;
        }
      }
      
      // Also validate if "Practical Class Assessment" is explicitly mentioned
      if (/\bpractical\s+class\s+assessment\b/i.test(normalizedText)) {
        return true;
      }
      
      return false;
    }
    
    return false;
  } catch (error) {
    console.error(`Error validating ${type} context:`, error);
    return false;
  }
};

/**
 * Extract sentences containing CA references with context validation
 * @param {string} text - Text to search within
 * @returns {string[]} Array of matching sentences
 */
const extractSentencesWithCA = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  try {
    // Split text into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    // Find sentences with CA references and validate context
    return sentences.filter(sentence => {
      // Match CA with appropriate word boundaries
      const caRegex = /\b(CA|Class Assessment)\b/i;
      
      // First check if sentence contains CA
      if (!caRegex.test(sentence)) {
        return false;
      }
      
      // Then validate the context is appropriate
      return validateContext(sentence, 'ca');
    });
  } catch (error) {
    console.error('Error extracting CA sentences:', error);
    return [];
  }
};

/**
 * Extract sentences containing PCA references with context validation
 * @param {string} text - Text to search within
 * @returns {string[]} Array of matching sentences
 */
const extractSentencesWithPCA = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  try {
    // Split text into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    // Find sentences with PCA references and validate context
    return sentences.filter(sentence => {
      // Match PCA with appropriate word boundaries
      const pcaRegex = /\b(PCA|Practical Class Assessment)\b/i;
      
      // First check if sentence contains PCA
      if (!pcaRegex.test(sentence)) {
        return false;
      }
      
      // Then validate the context is appropriate
      return validateContext(sentence, 'pca');
    });
  } catch (error) {
    console.error('Error extracting PCA sentences:', error);
    return [];
  }
};

/**
 * Extract email addresses from text
 * @param {string} text - Text to search within
 * @returns {string[]} Array of email addresses
 */
const extractEmailAddresses = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  try {
    // Match email addresses with standard pattern
    const regex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
    return [...new Set(text.match(regex) || [])].filter(Boolean);
  } catch (error) {
    console.error('Error extracting email addresses:', error);
    return [];
  }
};

// Add rate limiting configuration
const RATE_LIMIT = {
  DOM_QUERIES: {
    MAX_PER_SECOND: 50,
    WINDOW_MS: 1000
  },
  CACHE: {
    MAX_SIZE: 1000,
    CLEANUP_INTERVAL_MS: 30000
  }
};

// Rate limiting implementation
const queryTimestamps = [];
const isRateLimited = () => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.DOM_QUERIES.WINDOW_MS;
  
  // Remove old timestamps
  while (queryTimestamps.length > 0 && queryTimestamps[0] < windowStart) {
    queryTimestamps.shift();
  }
  
  // Check if we've exceeded the rate limit
  return queryTimestamps.length >= RATE_LIMIT.DOM_QUERIES.MAX_PER_SECOND;
};

// Enhanced DOM query with rate limiting
const rateLimitedQuery = (selector, root = document) => {
  if (isRateLimited()) {
    console.warn('Rate limit exceeded for DOM queries');
    return [];
  }
  
  queryTimestamps.push(Date.now());
  return cachedQuery(selector, root);
};

// Memory management for caches
const cleanupCaches = () => {
  try {
    // Clean up query cache if it's too large
    if (queryCache.size > RATE_LIMIT.CACHE.MAX_SIZE) {
      const entriesToRemove = queryCache.size - RATE_LIMIT.CACHE.MAX_SIZE;
      const keysToRemove = Array.from(queryCache.keys()).slice(0, entriesToRemove);
      keysToRemove.forEach(key => queryCache.delete(key));
    }
    
    // Clean up row cache
    const now = Date.now();
    for (const [key, value] of rowCache.entries()) {
      if (now - value.timestamp > ROW_CACHE_LIFETIME_MS) {
        rowCache.delete(key);
      }
    }
  } catch (error) {
    console.error('Error cleaning up caches:', error);
  }
};

// Set up periodic cache cleanup
setInterval(cleanupCaches, RATE_LIMIT.CACHE.CLEANUP_INTERVAL_MS);

/**
 * Extract recipient email addresses from currently open email
 * @returns {string[]} Array of recipient email addresses
 */
const extractRecipientsFromOpenEmail = () => {
  try {
    const recipients = new Set();
    
    // Try multiple selectors to target the recipients section in different Gmail layouts
    const selectors = [
      // Primary modern Gmail selectors for recipients
      '[data-message-id] [email], [data-legacy-message-id] [email]',
      '[data-message-id] span[data-hovercard-id], [data-legacy-message-id] span[data-hovercard-id]',
      '[role="main"] [role="presentation"] span[email]',
      // Additional recipient indicators
      '.az2 span[email]', // Common recipient class
      '.hb span[email]',  // Another recipient container
      '[aria-label="Recipients"] span',
      // Field labels that may contain recipient information
      'tr:contains("To:") td:last-child',
      '[aria-label*="to"] span',
      // HTML attribute selectors for email data
      '[data-email]',
      '[data-hovercard-id]',
      // Legacy Gmail selectors
      '.gD',
      '.gE',
      '.gF'
    ];
    
    // Use rate-limited query for each selector
    for (const selector of selectors) {
      const elements = rateLimitedQuery(selector);
      for (const element of elements) {
        const email = element.getAttribute('email') || 
                     element.getAttribute('data-email') ||
                     element.getAttribute('data-hovercard-id') ||
                     element.textContent.trim();
        
        if (email && email.includes('@')) {
          recipients.add(email);
        }
      }
    }
    
    return Array.from(recipients);
  } catch (error) {
    console.error('Error extracting recipients:', error);
    return [];
  }
};

/**
 * Extract recipient email from snippet or row
 * @param {string} snippet - Text snippet or row text to analyze
 * @returns {string} First found recipient email or empty string
 */
const extractRecipientFromSnippet = (snippet) => {
  if (!snippet || typeof snippet !== 'string') return "";
  
  try {
    // First, look for indicators of recipient in the text
    const toPatterns = [
      /to:\s*([^,;]+@[^,;\s]+)/i,
      /sent to\s+([^,;]+@[^,;\s]+)/i,
      /mailto:([^"'\s]+@[^"'\s]+)/i
    ];
    
    for (const pattern of toPatterns) {
      const match = snippet.match(pattern);
      if (match && match[1]) {
        // Validate that it contains an @ symbol
        if (match[1].includes('@')) {
          return match[1].trim();
        }
      }
    }
    
    // If no specific recipient pattern found, extract the first email address
    const emails = extractEmailAddresses(snippet);
    if (emails.length > 0) {
      return emails[0]; // Return the first email found
    }
  } catch (error) {
    console.error('Error extracting recipient from snippet:', error);
  }
  
  return "";
};

/**
 * Extract date from Gmail UI element
 * @param {Element} row - Gmail message row element
 * @returns {string} Extracted date as displayed in Gmail UI
 */
const extractDateFromRow = (row) => {
  if (!row) return "";
  
  try {
    // Gmail uses different date selectors depending on the view
    // Modern Gmail inbox date element (primary selector)
    const dateEl = safeQuerySelector(row, 'td[role="gridcell"]:last-child');
    if (dateEl && dateEl.textContent.trim()) {
      return dateEl.textContent.trim();
    }
    
    // Alternate date selectors for different inbox layouts
    const altDateElements = [
      safeQuerySelector(row, '.xW'),     // Common date element class
      safeQuerySelector(row, 'td.time'), // Alternative date format
      safeQuerySelector(row, '[title*="date"]'), // Elements with date in title
      safeQuerySelector(row, '[aria-label*="date"]') // Elements with date in aria-label
    ];
    
    for (const el of altDateElements) {
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
  } catch (error) {
    console.error('Error extracting date from row:', error);
  }
  
  // Fallback to text-based date extraction if UI extraction fails
  try {
    const rowText = row.textContent || "";
    return extractDateFromText(rowText) || "";
  } catch (error) {
    console.error('Error in date fallback extraction:', error);
    return "";
  }
};

/**
 * Extract date from text with comprehensive pattern matching
 * @param {string} text - Text to extract date from
 * @returns {string} Extracted date or empty string
 */
const extractDateFromText = (text) => {
  if (!text || typeof text !== 'string') return "";
  
  try {
    // Date patterns from most to least specific
    const datePatterns = [
      // ISO format: YYYY-MM-DD
      /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
      
      // US/UK formats: MM/DD/YYYY or DD/MM/YYYY
      /\b(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})\b/,
      
      // Written month formats
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i,
      /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4})\b/i,
      
      // Month and day only (current year implied)
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?)\b/i,
      /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b/i,
      
      // Gmail short formats (e.g., "Feb 5", "3:42 PM", "Yesterday")
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})\b/i,
      /\b(\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/i,
      /\b(Yesterday|Today)\b/i
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
  } catch (error) {
    console.error('Error extracting date from text:', error);
  }
  
  return "";
};

/**
 * Advanced snippet analysis for improved date extraction
 * @param {string} snippet - Text snippet to analyze
 * @returns {Object} Analysis results with words and extracted date
 */
const analyzeSnippet = (snippet) => {
  if (!snippet || typeof snippet !== 'string') {
    return { words: [], extractedDate: "" };
  }
  
  try {
    const words = snippet.split(/\s+/).filter(Boolean);
    
    // First try to extract date from the full snippet
    let extractedDate = extractDateFromText(snippet);
    if (extractedDate) {
      return { words, extractedDate };
    }
    
    // Check progressively smaller word groups for date patterns
    for (let windowSize = 3; windowSize > 0; windowSize--) {
      for (let i = 0; i <= words.length - windowSize; i++) {
        const wordGroup = words.slice(i, i + windowSize).join(' ');
        const dateFromGroup = extractDateFromText(wordGroup);
        if (dateFromGroup) {
          return { words, extractedDate: dateFromGroup };
        }
      }
    }
    
    return { words, extractedDate: "" };
  } catch (error) {
    console.error('Error analyzing snippet:', error);
    return { words: [], extractedDate: "" };
  }
};

// Data extraction state
let lastScanTime = 0;
let cachedResults = null;
const CACHE_LIFETIME_MS = 5000; // 5 seconds cache

/**
 * Extract CA and PCA information from currently open email
 * @returns {Object} Object containing CA/PCA sentences and recipient emails
 */
const extractAssessmentsFromOpenEmail = () => {
  try {
    // Target visible email bodies only
    const emailBodies = Array.from(document.querySelectorAll(".a3s"))
      .filter(el => !el.closest("[aria-hidden='true']") && el.isConnected && el.textContent?.trim().length > 0);
    
    const caSentences = emailBodies.flatMap(el => extractSentencesWithCA(el.textContent));
    const pcaSentences = emailBodies.flatMap(el => extractSentencesWithPCA(el.textContent));
    const recipients = extractRecipientsFromOpenEmail();
    
    return {
      caSentences,
      pcaSentences,
      recipients
    };
  } catch (error) {
    console.error('Error extracting assessments from open email:', error);
    return {
      caSentences: [],
      pcaSentences: [],
      recipients: []
    };
  }
};

/**
 * Get all inbox rows from various Gmail views (inbox, custom labels, search results)
 * @returns {Element[]} Array of row elements representing emails
 */
const getInboxRows = () => {
  try {
    console.log('Starting inbox row extraction with enhanced selectors...');
    
    // Comprehensive list of selectors for different Gmail layouts
    const rowSelectors = [
      // Modern Gmail layouts (2023-2024)
      'tr[role="row"]',
      'tr.zA',
      '.a7Y table tr',
      'div[role="main"] tr.zA',
      'div.ae4 tbody.F tr',
      // Additional selectors for various Gmail views
      '.PI table.F tbody tr',
      '.UI table.F tbody tr',
      '.nH.a7Y .zA', 
      // Inbox-specific selectors
      'div[aria-label="Inbox"] tr',
      // Search results selectors
      '.Cp table.F tbody tr',
      // Thread view selectors
      '.zt .zA',
      // Classic Gmail
      'table.Bu tbody tr',
      'table.Bs tbody tr',
      // Mobile/Tablet view
      '[role="grid"] [role="row"]',
      // Gmail with reading pane
      'div[gh="tl"] .zA',
      // Match all elements that have common Gmail row classes
      '*[class*="zA"]',
      '*[role="row"]'
    ];

    let allRows = [];
    
    // Try each selector and log results
    for (const selector of rowSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements && elements.length > 0) {
          console.log(`Found ${elements.length} potential rows using selector: ${selector}`);
          allRows.push(...Array.from(elements));
        }
      } catch (selectorError) {
        console.warn(`Error with selector ${selector}:`, selectorError);
      }
    }
    
    console.log(`Found ${allRows.length} total rows before filtering`);
    
    // Remove duplicates (same DOM element matched by multiple selectors)
    const uniqueRows = Array.from(new Set(allRows));
    console.log(`Found ${uniqueRows.length} unique rows after removing duplicates`);

    // Filter out non-email rows (like labels, dividers, etc.)
    const emailRows = uniqueRows.filter(row => {
      try {
        // Check for email characteristics - we need several checks to handle different layouts
        const hasEmailIndicators = (
          // Subject or snippet presence
          (row.querySelector('.y6') || row.querySelector('.xY') || row.querySelector('.xS') || 
           row.querySelector('[role="link"]') || row.querySelector('span[id^="m_"]')) &&
          // Elements typically containing sender info
          (row.querySelector('.yW') || row.querySelector('.zF') || 
           row.querySelector('*[email]') || row.querySelector('[data-hovercard-id]'))
        );
        
        // More general row validation - common email row patterns
        const isValidRow = (
          row.querySelectorAll('td').length > 1 || // Has multiple cells
          row.querySelectorAll('span').length > 4 || // Has multiple spans (typical for email rows)
          row.textContent.includes('@') // Contains email-like content
        );
        
        return hasEmailIndicators || isValidRow;
      } catch (error) {
        console.warn('Error filtering row:', error);
        return false;
      }
    });
    
    console.log(`Found ${emailRows.length} valid email rows after filtering`);
    
    // Add debugging info
    if (emailRows.length === 0) {
      console.warn('No rows matched email criteria. Adding detailed DOM info...');
      
      // Log more details about the Gmail DOM structure to help debugging
      const mainContainers = [
        document.querySelector('div[role="main"]'),
        document.querySelector('.UI'),
        document.querySelector('.nH.bkK'),
        document.querySelector('div[gh="tl"]'),
        document.querySelector('div.ae4')
      ].filter(Boolean);
      
      console.log('Main Gmail containers found:', mainContainers.length);
      mainContainers.forEach((container, i) => {
        console.log(`Container ${i+1} classes:`, container.className);
        console.log(`Container ${i+1} children:`, container.children.length);
        console.log(`Container ${i+1} contains tables:`, container.querySelectorAll('table').length);
      });
      
      // Try a last-resort approach - any element that might be an email row
      console.log('Attempting to find rows with last-resort approach...');
      const lastResortRows = Array.from(document.querySelectorAll('tr')).filter(row => 
        row.textContent.includes('@') || 
        row.innerHTML.includes('email') ||
        row.querySelectorAll('td').length >= 3
      );
      
      console.log(`Last resort found ${lastResortRows.length} potential email rows`);
      if (lastResortRows.length > 0) {
        return lastResortRows;
      }
    }

    return emailRows;
  } catch (error) {
    console.error('Critical error in getInboxRows:', error);
    // Return an empty array rather than null to avoid null reference errors
    return [];
  }
};

/**
 * Extract CA and PCA information from inbox list
 * @returns {Array<Object>} Array of email information objects
 */
const extractAssessmentsFromInbox = () => {
  try {
    console.log('Starting assessment extraction from inbox...');
    
    // Get all inbox rows from any Gmail view
    const inboxRows = getInboxRows();
    if (!inboxRows || inboxRows.length === 0) {
      console.warn('No inbox rows found to extract assessments from');
      return [];
    }

    console.log(`Found ${inboxRows.length} inbox rows, starting extraction...`);

    // Extract email information from each row
    const emailInfos = [];
    
    // Track extraction success rate
    let successCount = 0;
    let totalProcessed = 0;
    
    inboxRows.forEach((row, index) => {
      try {
        totalProcessed++;
        
        let emailInfo = {
          index: index + 1,
          sender: "",
          subject: "",
          snippet: "",
          date: "",
          recipient: "N/A", // Default value for recipient
          caMatches: [],
          pcaMatches: []
        };
        
        // Try to extract using row ID for caching if available
        const rowId = row.id || row.getAttribute('data-rowid') || `row-${index}`;
        
        // Check cache if we've processed this row before
        const cachedData = checkRowCache(rowId);
        if (cachedData) {
          console.log(`Using cached data for row ${rowId}`);
          emailInfos.push(cachedData);
          successCount++;
          return;
        }
        
        // Get sender (try multiple selector approaches)
        const senderSelectors = [
          '.yW span[email]', 
          '.zF span[email]', 
          '[role="cell"]:first-child span[email]',
          '.yP span[email]',
          'td:first-child span[email]',
          // Attribute selectors
          '[data-hovercard-id]',
          '[data-email]',
          // Generic selectors
          '.yW',
          '.zF',
          '[role="cell"]:first-child'
        ];
        
        for (const selector of senderSelectors) {
          const element = row.querySelector(selector);
          if (element) {
            // Try to get email from attributes first
            emailInfo.sender = element.getAttribute('email') || 
                              element.getAttribute('data-hovercard-id') || 
                              element.getAttribute('data-email') || 
                              element.textContent.trim();
            if (emailInfo.sender) break;
          }
        }
        
        // If still no sender, try text content of likely cells
        if (!emailInfo.sender) {
          const firstCell = row.querySelector('td:first-child, [role="cell"]:first-child');
          if (firstCell) {
            emailInfo.sender = firstCell.textContent.trim();
          }
        }
        
        // Get subject (try multiple selector approaches)
        const subjectSelectors = [
          '.y6', 
          '.bog', 
          '[role="link"]',
          'td:nth-child(2) .xS',
          'td:nth-child(2) .y6',
          'td .y6',
          // For newer Gmail layouts
          'span[data-thread-id]',
          '[data-legacy-thread-id]',
          // Generic selectors
          'td:nth-child(2) span',
          '[role="gridcell"]:nth-child(2) span'
        ];
        
        for (const selector of subjectSelectors) {
          const element = row.querySelector(selector);
          if (element) {
            emailInfo.subject = element.textContent.trim();
            if (emailInfo.subject) break;
          }
        }
        
        // Get snippet (try multiple selector approaches)
        const snippetSelectors = [
          '.y2', 
          '.xY', 
          '[role="cell"] .xY',
          '.xW + .y2',
          'td:nth-child(2) .xT .xY',
          // Generic selectors
          'td:nth-child(2) div:nth-child(2)',
          '[role="gridcell"]:nth-child(2) div:nth-child(2)'
        ];
        
        for (const selector of snippetSelectors) {
          const element = row.querySelector(selector);
          if (element) {
            emailInfo.snippet = element.textContent.trim();
            if (emailInfo.snippet) break;
          }
        }
        
        // If still no snippet, try to get from any visible text in the row
        if (!emailInfo.snippet) {
          // Get all text excluding the subject and sender
          const fullText = row.textContent.trim();
          if (fullText && emailInfo.subject && fullText.length > emailInfo.subject.length) {
            // Remove subject from the text to get a potential snippet
            const remainingText = fullText.replace(emailInfo.subject, '').trim();
            if (remainingText) {
              emailInfo.snippet = remainingText;
            }
          }
        }
          
        // Try to extract recipient from the snippet text if available
        if (emailInfo.snippet) {
          const recipientFromSnippet = extractRecipientFromSnippet(emailInfo.snippet);
          if (recipientFromSnippet) {
            emailInfo.recipient = recipientFromSnippet;
          }
          
          // Extract CA and PCA mentions from the snippet and subject
          const combinedText = `${emailInfo.subject} ${emailInfo.snippet}`;
          emailInfo.caMatches = extractSentencesWithCA(combinedText);
          emailInfo.pcaMatches = extractSentencesWithPCA(combinedText);
        }
        
        // Extract date from various possible elements
        emailInfo.date = extractDateFromRow(row);
        
        // Only include emails that mention CA or PCA
        if (emailInfo.caMatches.length > 0 || emailInfo.pcaMatches.length > 0) {
          // Cache the results for future use
          cacheRowData(rowId, emailInfo);
          emailInfos.push(emailInfo);
          successCount++;
        }
      } catch (error) {
        console.warn(`Error extracting email info for row ${index}:`, error);
      }
    });
    
    // Log extraction statistics
    console.log(`Inbox extraction stats: ${successCount}/${totalProcessed} rows successfully processed`);
    console.log(`Found ${emailInfos.length} emails with CA or PCA content`);
    
    return emailInfos;
  } catch (error) {
    console.error('Critical error extracting assessments from inbox:', error);
    return [];
  }
};

/**
 * Perform a full extraction of CA and PCA-related information
 * @param {boolean} forceRefresh - Whether to force a refresh
 * @returns {Object} Object containing current email and inbox extraction results
 */
const performFullScan = (forceRefresh = false) => {
  console.log("Starting full scan...");
  const results = [];
  let currentEmailData = null;

  // Process current open email if available
  if (isEmailOpen()) {
    currentEmailData = processCurrentOpenEmail();
    if (currentEmailData) {
      results.push(currentEmailData);
    }
  }

  // Process inbox rows
  const inboxData = processInboxRows(forceRefresh);
  results.push(...inboxData);

  console.log(`Full scan complete. Found ${results.length} matches.`);
  return results;
};

function processCurrentOpenEmail() {
  console.log("Processing current open email...");
  const subject = document.querySelector('.ha h2') ? document.querySelector('.ha h2').textContent.trim() : '';
  const sender = getEmailSender();
  const recipients = extractRecipientsFromOpenEmail();
  const date = getEmailDate();
  const bodyElement = document.querySelector('.a3s');
  
  if (!bodyElement) {
    console.log("No email body found.");
    return null;
  }
  
  const emailText = bodyElement.textContent;
  const caMatches = extractSentencesWithCA(emailText);
  const pcaMatches = extractSentencesWithPCA(emailText);
  
  if (caMatches.length === 0 && pcaMatches.length === 0) {
    console.log("No CA or PCA matches found in current email.");
    return null;
  }
  
  return {
    sender,
    recipients,
    subject,
    date,
    caMatches,
    pcaMatches,
    snippet: emailText.substring(0, 200).trim() + '...',
    source: 'open_email'
  };
}

function processInboxRows(forceRefresh = false) {
  console.log("Processing inbox rows...");
  const results = [];
  const rowElements = document.querySelectorAll('tr.zA');
  
  for (const row of rowElements) {
    try {
      const rowData = extractDataFromInboxRow(row, forceRefresh);
      if (rowData && (rowData.caMatches.length > 0 || rowData.pcaMatches.length > 0)) {
        results.push(rowData);
      }
    } catch (error) {
      console.error("Error processing inbox row:", error);
    }
  }
  
  console.log(`Processed ${rowElements.length} inbox rows, found ${results.length} with CA/PCA.`);
  return results;
}

function extractDataFromInboxRow(rowElement, forceRefresh = false) {
  const rowId = rowElement.getAttribute('id');
  
  // Check cache if not forcing refresh
  if (!forceRefresh) {
    const cachedData = checkRowCache(rowId);
    if (cachedData) {
      return cachedData;
    }
  }
  
  const subject = rowElement.querySelector('.y6')?.textContent.trim() || '';
  const snippet = rowElement.querySelector('.y2')?.textContent.trim() || '';
  const sender = rowElement.querySelector('.yW span[email], .yP span[email]')?.getAttribute('email') || 
                rowElement.querySelector('.yW')?.textContent.trim() || '';
  const date = rowElement.querySelector('.xW span')?.getAttribute('title') || 
              rowElement.querySelector('.xW')?.textContent.trim() || '';
  
  // Extract CA and PCA matches from snippet
  const caMatches = extractSentencesWithCA(snippet);
  const pcaMatches = extractSentencesWithPCA(snippet);
  
  if (caMatches.length === 0 && pcaMatches.length === 0) {
    return null;
  }
  
  const result = {
    sender,
    recipients: [], // Row view doesn't show recipients
    subject,
    date,
    caMatches,
    pcaMatches,
    snippet,
    source: 'inbox_row',
    rowId
  };
  
  // Cache results
  cacheRowData(rowId, result);
  
  return result;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid request format');
    }

    console.log('Content script received message:', request);

    switch (request.type || request.action) {
      case 'extractPCAFromAll':
        try {
          console.log('Extracting PCA data from all sources', request.forceRefresh);
          
          // Get current email data if available
          let currentEmailData = null;
          if (isEmailOpen()) {
            console.log('Email is open, extracting data');
            currentEmailData = extractAssessmentsFromOpenEmail();
            console.log('Current email data:', currentEmailData);
          } else {
            console.log('No email is currently open');
          }
          
          // Get inbox data
          console.log('Extracting inbox data');
          const inboxData = extractAssessmentsFromInbox();
          console.log(`Found ${inboxData.length} inbox items with CA/PCA content`);
          
          // Return combined data
          sendResponse({
            success: true,
            data: {
              currentEmail: currentEmailData || { caSentences: [], pcaSentences: [], recipients: [] },
              inbox: inboxData
            }
          });
        } catch (error) {
          console.error('Error extracting PCA data:', error);
          sendResponse({ 
            success: false, 
            error: error.message,
            data: {
              currentEmail: { caSentences: [], pcaSentences: [], recipients: [] },
              inbox: []
            }
          });
        }
        break;

      case 'ping':
        // Simple ping to check if content script is loaded
        sendResponse({ success: true, message: 'Content script is active' });
        break;

      case 'getInboxEmails':
        try {
          const rows = getInboxRows();
          if (!rows || !Array.isArray(rows)) {
            throw new Error('Failed to get inbox rows');
          }

          // Use a more reliable function instead of the undefined extractEmailFromRow
          const emails = rows
            .map(row => {
              try {
                // Extract basic email info from row
                const subject = row.querySelector('.y6')?.textContent.trim() || '';
                const sender = row.querySelector('.yW span[email]')?.getAttribute('email') || 
                              row.querySelector('.yW')?.textContent.trim() || '';
                
                return { subject, sender };
              } catch (error) {
                console.warn('Error processing row:', error);
                return null;
              }
            })
            .filter(email => email !== null);

          if (emails.length === 0) {
            console.warn('No valid emails found in inbox');
          }

          sendResponse({ success: true, emails });
        } catch (error) {
          console.error('Error processing inbox emails:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getOpenEmailRecipients':
        try {
          const recipients = extractRecipientsFromOpenEmail();
          if (!recipients || !Array.isArray(recipients)) {
            throw new Error('Failed to get recipients');
          }
          sendResponse({ success: true, recipients });
        } catch (error) {
          console.error('Error getting recipients:', error);
          sendResponse({ success: false, error: error.message });
        }
        break;

      default:
        console.warn('Unknown action or type:', request.action || request.type);
        sendResponse({ success: false, error: 'Unknown action or type' });
    }
  } catch (error) {
    console.error('Error in message handler:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  // Return true to indicate we'll send response asynchronously
  return true;
});

// Setup view change detection to clear cache on Gmail view changes
const setupViewChangeDetection = () => {
  // Observer to detect Gmail view changes
  const observer = new MutationObserver((mutations) => {
    let shouldClearCache = false;
    
    // Look for substantial DOM changes that indicate view change
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if significant view elements were added
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && 
              (node.classList?.contains('aeJ') || 
               node.classList?.contains('nH') || 
               node.getAttribute('role') === 'main')) {
            shouldClearCache = true;
            break;
          }
        }
      }
      
      if (shouldClearCache) break;
    }
    
    if (shouldClearCache) {
      console.log('Gmail view change detected, clearing cache.');
      clearCache();
      lastScanTime = 0;
      cachedResults = null;
    }
  });
  
  // Start observing with a broad scope to catch view changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also attach to URL changes which indicate navigation
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('Gmail URL change detected, clearing cache.');
      clearCache();
      lastScanTime = 0;
      cachedResults = null;
    }
  }, 1000);
};

// Initialize the extension
setupViewChangeDetection();

// Expose functions for testing if needed (will be stripped in production)
if (process.env.NODE_ENV === 'development') {
  window.__PCA_TEST_UTILS = {
    extractSentencesWithCA,
    extractSentencesWithPCA,
    validateContext,
    extractDateFromText,
    analyzeSnippet,
    getInboxRows,
    extractDateFromRow
  };
}

/**
 * Gets the sender email/name from the currently open email
 * @returns {string} Sender email or name
 */
const getEmailSender = () => {
  try {
    // Comprehensive list of selectors for different Gmail layouts
    const senderSelectors = [
      // Modern Gmail
      '.yW span[email]',
      '.yW span[data-hovercard-id]',
      '.yW span[data-hovercard-email-id]',
      '.yW span[data-email]',
      // Classic Gmail
      '.yW',
      '.xW',
      '.yX',
      // Mobile/Tablet view
      '.y6 span[email]',
      '.y6 span[data-hovercard-id]',
      // Alternative layouts
      'td[role="gridcell"] span[email]',
      'td[role="gridcell"] span[data-hovercard-id]',
      'td[role="gridcell"] .yW'
    ];

    let senderElement = null;
    for (const selector of senderSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          senderElement = element;
          break;
        }
      } catch (error) {
        console.warn(`Error with selector ${selector}:`, error);
      }
    }

    if (!senderElement) {
      console.warn('No sender element found in row');
      return null;
    }

    // Try to get email from various attributes
    const email = senderElement.getAttribute('email') ||
                 senderElement.getAttribute('data-hovercard-id') ||
                 senderElement.getAttribute('data-hovercard-email-id') ||
                 senderElement.getAttribute('data-email');

    if (!email) {
      // Fallback: Try to extract email from text content
      const text = senderElement.textContent.trim();
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        return emailMatch[0];
      }
      console.warn('No email found in sender element');
      return null;
    }

    return email;
  } catch (error) {
    console.error('Error extracting email from row:', error);
    return null;
  }
};

/**
 * Gets the date from the currently open email
 * @returns {string} Date string from email
 */
const getEmailDate = () => {
  try {
    // Different selectors for date in Gmail
    const dateSelectors = [
      '.g3', // Common date container
      '.adn .ads', // Date field in top header
      '.ha .aQy', // Alternative date field
      '[role="main"] .adf' // Date in main view
    ];
    
    for (const selector of dateSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    
    return "";
  } catch (error) {
    console.error('Error getting email date:', error);
    return "";
  }
};

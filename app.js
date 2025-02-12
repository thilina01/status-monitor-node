/** 
 * app.js
 *
 * Service Status Monitoring Application
 *
 * Features:
 *   - Reads expected services from a JSON file (services.json).
 *   - Executes a shell script to retrieve Docker service metrics.
 *   - Filters and marks services as "up" or "down" based on their status.
 *   - Aggregates CPU and Memory metrics across all expected services.
 *   - Exposes an API endpoint to retrieve the aggregated status.
 *   - Implements caching to optimize performance.
 */

const express = require('express');
const fs = require('fs');
const { spawn } = require('child_process');

//////////////////////////////////////////////////////////////////////
// CONFIGURATION
//////////////////////////////////////////////////////////////////////

// Path to services.json (can be overridden by the SERVICES_FILE environment variable)
const SERVICES_FILE = process.env.SERVICES_FILE || '/app/services.json';

// Cache Time-To-Live in milliseconds (default: 60,000 ms = 1 minute)
const CACHE_TTL = process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL) : 60000;

// Port for the Node.js server (default: 8076)
const PORT = process.env.PORT || 8076;

// Path to the shell script (can be modified as needed)
const SCRIPT_PATH = '/app/docker_stats.sh';

//////////////////////////////////////////////////////////////////////
// GLOBAL STATE
//////////////////////////////////////////////////////////////////////

// Cached data and timestamp for caching mechanism
let cachedData = null;
let lastFetchTimestamp = 0;

//////////////////////////////////////////////////////////////////////
// EXPRESS SETUP
//////////////////////////////////////////////////////////////////////

const app = express();

// Serve static files from the 'public' directory
app.use(express.static('public'));

//////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS
//////////////////////////////////////////////////////////////////////

/**
 * Converts a memory string with units to MiB.
 * Example inputs: "22.67MiB", "31.35GiB", "1.2GiB", "512KiB"
 * Returns the value in MiB as a floating-point number.
 *
 * @param {string} memStr - Memory string with unit.
 * @returns {number} - Memory in MiB.
 */
function convertToMiB(memStr) {
  const regex = /^([\d.]+)(KiB|MiB|GiB|TiB)$/i;
  const match = memStr.match(regex);
  if (!match) {
    console.warn(`[WARN] Unable to parse memory string: "${memStr}". Defaulting to 0 MiB.`);
    return 0;
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  switch (unit) {
    case 'KIB':
      return value / 1024;
    case 'MIB':
      return value;
    case 'GIB':
      return value * 1024;
    case 'TIB':
      return value * 1024 * 1024;
    default:
      console.warn(`[WARN] Unknown memory unit: "${unit}". Defaulting to 0 MiB.`);
      return 0;
  }
}

/**
 * Reads the expected services from services.json.
 * Returns a sorted, unique array of service names.
 *
 * @returns {string[]} - Array of expected service names.
 */
function loadExpectedServices() {
  try {
    const raw = fs.readFileSync(SERVICES_FILE, 'utf8');
    const arr = JSON.parse(raw);

    if (!Array.isArray(arr)) {
      console.warn('[WARN] services.json does not contain an array. Using an empty list.');
      return [];
    }

    // Remove duplicates and sort alphabetically
    const unique = [...new Set(arr)].sort();
    console.log('[INFO] Loaded expected services:', unique);
    return unique;
  } catch (err) {
    console.warn(`[WARN] Could not load or parse "${SERVICES_FILE}":`, err.message);
    return [];
  }
}

/**
 * Executes the shell script and captures its JSON output.
 *
 * @returns {Promise<string>} - Resolves with the JSON output as a string.
 */
function runStatusScript() {
  return new Promise((resolve, reject) => {
    // Spawn the shell script
    const script = spawn(SCRIPT_PATH);

    let output = '';
    let errorOutput = '';

    // Capture stdout
    script.stdout.on('data', (data) => {
      output += data;
    });

    // Capture stderr
    script.stderr.on('data', (data) => {
      errorOutput += data;
    });

    // Handle script completion
    script.on('close', (code) => {
      if (code === 0) {
        try {
          // Validate JSON
          JSON.parse(output.trim());
          resolve(output.trim());
        } catch (parseError) {
          reject(new Error(`Failed to parse JSON output from script: ${parseError.message}`));
        }
      } else {
        reject(new Error(`Script exited with code ${code}:\n${errorOutput}`));
      }
    });

    // Handle errors during script execution
    script.on('error', (err) => {
      reject(new Error(`Failed to start script: ${err.message}`));
    });
  });
}

/**
 * Processes the service data and calculates aggregate metrics.
 *
 * @param {Object[]} serviceArray - Array of service metrics from the script.
 * @param {string[]} expectedServices - Array of expected service names.
 * @returns {Object} - Aggregated metrics and service statuses.
 */
function processServiceData(serviceArray, expectedServices) {
  if (!Array.isArray(serviceArray)) {
    console.warn('[WARN] Script output is not an array. Using an empty list.');
    serviceArray = [];
  }

  // Map to store reported services for quick lookup
  const reportedMap = new Map();
  for (const svc of serviceArray) {
    if (svc.Name) { // Ensure the service has a Name property
      reportedMap.set(svc.Name.toLowerCase(), {
        status: svc.status.toLowerCase(),
        uptime: svc.uptime,
        CPUPerc: svc.CPUPerc,
        MemUsage: svc.MemUsage,
        MemPerc: svc.MemPerc,
        NetIO: svc.NetIO,
      });
    } else {
      console.warn('[WARN] A service entry is missing the "Name" property and will be skipped.');
    }
  }

  // Initialize aggregate variables
  let totalCPUPerc = 0; // in %
  let totalMemUsageMiB = 0; // in MiB
  let totalMemCapacityMiB = 0; // in MiB
  const memCapacitySet = new Set(); // To track unique total memory capacities

  // Build the final services list with metrics
  const finalServices = expectedServices.map((svcName) => {
    const normalizedSvcName = svcName.toLowerCase();
    const reportedService = reportedMap.get(normalizedSvcName);
    let serviceData = {
      name: svcName,
      status: 'down',
      uptime: 'N/A',
      CPUPerc: '0.00%',
      MemUsage: '0 / 0',
      MemPerc: '0.00%',
      NetIO: '0 / 0',
    };

    if (reportedService) {
      serviceData = {
        name: svcName,
        status: reportedService.status,
        uptime: reportedService.uptime,
        CPUPerc: reportedService.CPUPerc,
        MemUsage: reportedService.MemUsage,
        MemPerc: reportedService.MemPerc,
        NetIO: reportedService.NetIO,
      };

      // Parse and add to totalCPUPerc
      const cpuPerc = parseFloat(reportedService.CPUPerc.replace('%', ''));
      if (!isNaN(cpuPerc)) {
        totalCPUPerc += cpuPerc;
      } else {
        console.warn(`[WARN] Invalid CPUPerc value for service "${svcName}": "${reportedService.CPUPerc}". Skipping.`);
      }

      // Parse and add to totalMemUsage and track totalMemCapacity
      const memUsageParts = reportedService.MemUsage.split(' / ');
      if (memUsageParts.length === 2) {
        const usedMemMiB = convertToMiB(memUsageParts[0]);
        const totalMemMiB = convertToMiB(memUsageParts[1]);

        totalMemUsageMiB += usedMemMiB;
        memCapacitySet.add(totalMemMiB);
      } else {
        console.warn(`[WARN] Invalid MemUsage format for service "${svcName}": "${reportedService.MemUsage}". Skipping.`);
      }
    }

    return serviceData;
  });

  // Determine how to calculate totalMemCapacityMiB
  if (memCapacitySet.size === 1) {
    // System-wide memory allocation; take the single value
    totalMemCapacityMiB = Array.from(memCapacitySet)[0];
  } else {
    // Per-service memory allocation; sum all capacities
    totalMemCapacityMiB = Array.from(memCapacitySet).reduce((acc, val) => acc + val, 0);
  }

  // Count how many services are up or healthy
  const upHealthyCount = finalServices.reduce((count, svc) => {
    return count + ((svc.status === 'up' || svc.status === 'healthy') ? 1 : 0);
  }, 0);

  // Calculate totalMemPerc
  let totalMemPerc = 0;
  if (totalMemCapacityMiB > 0) {
    totalMemPerc = (totalMemUsageMiB / totalMemCapacityMiB) * 100;
    // Round to two decimal places
    totalMemPerc = Math.round(totalMemPerc * 100) / 100;
  } else {
    console.warn('[WARN] Total memory capacity is 0 MiB. Cannot calculate totalMemPerc.');
  }

  // Format totalMemUsage back to a readable format (e.g., MiB or GiB)
  let totalMemUsage = '';
  if (totalMemUsageMiB >= 1024) {
    totalMemUsage = `${(totalMemUsageMiB / 1024).toFixed(2)}GiB`;
  } else {
    totalMemUsage = `${totalMemUsageMiB.toFixed(2)}MiB`;
  }

  // Format totalMemCapacity back to a readable format (e.g., MiB or GiB)
  let totalMemCapacity = '';
  if (totalMemCapacityMiB >= 1024) {
    totalMemCapacity = `${(totalMemCapacityMiB / 1024).toFixed(2)}GiB`;
  } else {
    totalMemCapacity = `${totalMemCapacityMiB.toFixed(2)}MiB`;
  }

  // Prepare the final JSON structure
  const finalData = {
    services: finalServices,
    up_healthy_count: upHealthyCount,
    expected_services_count: finalServices.length,
    totalCPUPerc: `${totalCPUPerc.toFixed(2)}%`,
    totalMemUsage: totalMemUsage,
    totalMemPerc: `${totalMemPerc.toFixed(2)}%`,
    totalMemCapacity: totalMemCapacity,
  };

  return finalData;
}

/**
 * Retrieves the service status, utilizing caching to optimize performance.
 *
 * @param {boolean} forceRefresh - If true, bypasses the cache and fetches fresh data.
 * @returns {Promise<string>} - Resolves with the JSON data as a string.
 */
async function getServiceStatus(forceRefresh = false) {
  const now = Date.now();
  const isCacheValid = cachedData && (now - lastFetchTimestamp) < CACHE_TTL;

  if (!isCacheValid || forceRefresh) {
    try {
      // Load expected services
      const expectedServices = loadExpectedServices();

      // Run the shell script
      const scriptOutput = await runStatusScript();

      // Parse the script output
      const parsedArray = JSON.parse(scriptOutput);

      // Process the service data
      const processedData = processServiceData(parsedArray, expectedServices);

      // Cache the processed data
      cachedData = JSON.stringify(processedData);
      lastFetchTimestamp = now;

      return cachedData;
    } catch (err) {
      console.error('[ERROR] Failed to fetch service status:', err.message);
      throw err;
    }
  }

  // Return cached data
  return cachedData;
}

//////////////////////////////////////////////////////////////////////
// API ROUTES
//////////////////////////////////////////////////////////////////////

/**
 * GET /api/status
 *
 * Returns the aggregated service status and metrics.
 *
 * Query Parameters:
 *   - force (boolean): If true, bypasses the cache and fetches fresh data.
 *
 * Response:
 *   - services (array): List of services with their respective metrics.
 *   - up_healthy_count (number): Number of services that are up or healthy.
 *   - expected_services_count (number): Total number of expected services.
 *   - totalCPUPerc (string): Aggregate CPU percentage across all services.
 *   - totalMemUsage (string): Aggregate memory usage across all services.
 *   - totalMemPerc (string): Overall memory usage percentage.
 *   - totalMemCapacity (string): Total memory capacity across all services.
 */
app.get('/api/status', async (req, res) => {
  try {
    const forceRefresh = req.query.force === 'true';
    const dataStr = await getServiceStatus(forceRefresh);
    res.json(JSON.parse(dataStr));
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

//////////////////////////////////////////////////////////////////////
// START THE SERVER
//////////////////////////////////////////////////////////////////////

app.listen(PORT, () => {
  console.log(`[INFO] Server is running on port ${PORT}`);
});


// This is a simplified backend API that would be run separately from your Vite app
// You'd need to install express and googleapis with: npm install express googleapis
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// In a production environment, you'd store these securely (e.g., as environment variables)
// NEVER commit real credentials to your repository
const SHEET_ID = "1tXpIX3SJsRXexVd4xp83uPVTyVATiPvBjKLrltA4XUA";
const SHEET_NAME = "Booking_database";

// Authentication setup
async function getAuthClient() {
  try {
    // In production, you'd read these from environment variables
    // For development, you could read from a local file NOT committed to version control
    const credentials = JSON.parse(fs.readFileSync(
      path.join(__dirname, 'credentials.json'), 
      'utf8'
    ));

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    await auth.authorize();
    return auth;
  } catch (error) {
    console.error("Authentication error:", error);
    throw new Error(`Failed to authenticate with Google Sheets API: ${error.message}`);
  }
}

// Utility functions to map between Sheet rows and Ride objects
function mapRowToRide(row) {
  if (!row || row.length < 15) {
    return null;
  }
  
  // Map spreadsheet columns to Ride properties
  return {
    id: row[0]?.toString() || "",
    bookingId: row[1]?.toString() || "",
    name: row[2]?.toString() || "",
    email: row[3]?.toString() || "",
    phoneNumber: row[4]?.toString() || "",
    serviceType: row[5]?.toString() || "",
    date: row[6]?.toString() || "",
    time: row[7]?.toString() || "",
    pickup: row[8]?.toString() || "",
    dropoff: row[9]?.toString() || "",
    transmission: row[10]?.toString() || "",
    urgency: (row[11]?.toString() || "medium"),
    additionalNotes: row[12]?.toString() || "",
    status: (row[13]?.toString() || "new"),
    assignedTo: row[14]?.toString() || null,
    driver: row[15]?.toString() || null,
    assignmentStatus: row[16]?.toString() || "unassigned",
    assignedAt: row[17]?.toString() || null,
    completedAt: row[18]?.toString() || null,
    cost: row[19] ? Number(row[19]) : null,
  };
}

function mapRideToRow(ride) {
  return [
    ride.id,
    ride.bookingId,
    ride.name,
    ride.email,
    ride.phoneNumber,
    ride.serviceType,
    ride.date,
    ride.time,
    ride.pickup,
    ride.dropoff,
    ride.transmission,
    ride.urgency,
    ride.additionalNotes,
    ride.status,
    ride.assignedTo || "",
    ride.driver || "",
    ride.assignmentStatus || "",
    ride.assignedAt || "",
    ride.completedAt || "",
    ride.cost || ""
  ];
}

// Helper function to find ride row in the sheet
async function findRideRowIndex(auth, rideId) {
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    });
    
    const rows = response.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === rideId) {
        return i + 1; // Adding 1 because spreadsheet rows are 1-indexed
      }
    }
    
    throw new Error(`Ride with ID ${rideId} not found`);
  } catch (error) {
    console.error("Error finding ride row:", error);
    throw new Error(`Failed to find ride in sheet: ${error.message}`);
  }
}

// API Routes

// GET all rides
app.get('/sheets/rides', async (req, res) => {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:T`, // Assuming row 1 is headers
    });
    
    const rows = response.data.values || [];
    const rides = rows
      .map(mapRowToRide)
      .filter(ride => ride !== null);
    
    res.json(rides);
  } catch (error) {
    console.error("Error fetching rides:", error);
    res.status(500).json({ error: `Failed to fetch rides: ${error.message}` });
  }
});

// GET unassigned rides
app.get('/sheets/rides/unassigned', async (req, res) => {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:T`, // Assuming row 1 is headers
    });
    
    const rows = response.data.values || [];
    const rides = rows
      .map(mapRowToRide)
      .filter(ride => ride !== null)
      .filter(ride => ride.assignmentStatus === "unassigned" || ride.status === "new");
    
    res.json(rides);
  } catch (error) {
    console.error("Error fetching unassigned rides:", error);
    res.status(500).json({ error: `Failed to fetch unassigned rides: ${error.message}` });
  }
});

// POST assign ride to user
app.post('/sheets/rides/assign', async (req, res) => {
  try {
    const { rideId, userId } = req.body;
    if (!rideId || !userId) {
      return res.status(400).json({ error: "Both rideId and userId are required" });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Get current ride data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:T`,
    });
    
    const rows = response.data.values || [];
    const rides = rows
      .map(mapRowToRide)
      .filter(ride => ride !== null);
    
    const ride = rides.find(r => r.id === rideId);
    
    if (!ride) {
      return res.status(404).json({ error: `Ride with ID ${rideId} not found` });
    }
    
    // Update ride data
    const updatedRide = {
      ...ride,
      assignedTo: userId,
      assignmentStatus: "assigned",
      assignedAt: new Date().toISOString(),
      status: "pending"
    };
    
    // Find row index in sheet
    const rowIndex = await findRideRowIndex(auth, rideId);
    
    // Update sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${rowIndex}:T${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [mapRideToRow(updatedRide)]
      }
    });
    
    res.json(updatedRide);
  } catch (error) {
    console.error("Error assigning ride:", error);
    res.status(500).json({ error: `Failed to assign ride: ${error.message}` });
  }
});

// POST update ride status
app.post('/sheets/rides/status', async (req, res) => {
  try {
    const { rideId, status } = req.body;
    if (!rideId || !status) {
      return res.status(400).json({ error: "Both rideId and status are required" });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Get current ride data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:T`,
    });
    
    const rows = response.data.values || [];
    const rides = rows
      .map(mapRowToRide)
      .filter(ride => ride !== null);
    
    const ride = rides.find(r => r.id === rideId);
    
    if (!ride) {
      return res.status(404).json({ error: `Ride with ID ${rideId} not found` });
    }
    
    // Update ride data
    const updatedRide = {
      ...ride,
      status: status,
      completedAt: ["completed", "cancelled", "no-show"].includes(status) 
        ? new Date().toISOString() 
        : ride.completedAt
    };
    
    // Find row index in sheet
    const rowIndex = await findRideRowIndex(auth, rideId);
    
    // Update sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${rowIndex}:T${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [mapRideToRow(updatedRide)]
      }
    });
    
    res.json(updatedRide);
  } catch (error) {
    console.error("Error updating ride status:", error);
    res.status(500).json({ error: `Failed to update ride status: ${error.message}` });
  }
});

// POST update ride cost
app.post('/sheets/rides/cost', async (req, res) => {
  try {
    const { rideId, cost } = req.body;
    if (!rideId || cost === undefined) {
      return res.status(400).json({ error: "Both rideId and cost are required" });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Get current ride data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:T`,
    });
    
    const rows = response.data.values || [];
    const rides = rows
      .map(mapRowToRide)
      .filter(ride => ride !== null);
    
    const ride = rides.find(r => r.id === rideId);
    
    if (!ride) {
      return res.status(404).json({ error: `Ride with ID ${rideId} not found` });
    }
    
    // Update ride data
    const updatedRide = {
      ...ride,
      cost: cost
    };
    
    // Find row index in sheet
    const rowIndex = await findRideRowIndex(auth, rideId);
    
    // Update sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${rowIndex}:T${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [mapRideToRow(updatedRide)]
      }
    });
    
    res.json(updatedRide);
  } catch (error) {
    console.error("Error updating ride cost:", error);
    res.status(500).json({ error: `Failed to update ride cost: ${error.message}` });
  }
});

// GET test connection
app.get('/sheets/test', async (req, res) => {
  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Test read permissions
    let readSuccess = false;
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1:C3`,
      });
      readSuccess = !!response.data.values;
    } catch (error) {
      console.error("Read permission test failed:", error);
    }
    
    // Test write permissions by creating a test sheet
    let writeSuccess = false;
    let testSheetName = `test-sheet-${new Date().toISOString().split('T')[0]}`;
    
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: testSheetName
                }
              }
            }
          ]
        }
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${testSheetName}!A1:B2`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ["Test", "Data"],
            [new Date().toISOString(), "Connection Test"]
          ]
        }
      });
      
      writeSuccess = true;
    } catch (error) {
      console.error("Write permission test failed:", error);
    }
    
    res.json({
      success: readSuccess && writeSuccess,
      readSuccess,
      writeSuccess,
      testSheetName: writeSuccess ? testSheetName : undefined,
      message: `Connection to Google Sheets ${readSuccess && writeSuccess ? 'successful' : 'partially successful'}.
      Read: ${readSuccess ? 'Success' : 'Failed'}, Write: ${writeSuccess ? 'Success' : 'Failed'}`
    });
  } catch (error) {
    console.error("Sheet connection test failed:", error);
    res.status(500).json({
      success: false,
      readSuccess: false,
      writeSuccess: false,
      message: `Connection test failed: ${error.message}`
    });
  }
});

// POST delete test sheet
app.post('/sheets/test/delete', async (req, res) => {
  try {
    const { sheetName } = req.body;
    if (!sheetName) {
      return res.status(400).json({ error: "Sheet name is required" });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Get the sheet ID
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID
    });
    
    const sheetId = response.data.sheets?.find(
      s => s.properties?.title === sheetName
    )?.properties?.sheetId;
    
    if (!sheetId) {
      return res.status(404).json({ 
        success: false,
        message: `Sheet ${sheetName} not found for deletion` 
      });
    }
    
    // Delete the sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            deleteSheet: {
              sheetId
            }
          }
        ]
      }
    });
    
    res.json({ success: true, message: `Sheet ${sheetName} successfully deleted` });
  } catch (error) {
    console.error("Failed to delete test sheet:", error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to delete test sheet: ${error.message}` 
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});

// Export for serverless environments
module.exports = app;

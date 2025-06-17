// lib/googlesheets.js
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
});

export async function createNewGoogleSheet(clientName) {
  try {
    console.log(`Creating new Google Sheet for client: ${clientName}`);
    
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    
    // Create new spreadsheet
    const createResponse = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: `${clientName} - Deals Report`
        }
      }
    });
    
    const spreadsheetId = createResponse.data.spreadsheetId;
    console.log(`New spreadsheet created with ID: ${spreadsheetId}`);
    
    // Make the sheet public for reading and writing (to allow =IMAGE() functions)
    try {
      // Public read permission
      await drive.permissions.create({
        fileId: spreadsheetId,
        resource: {
          role: 'reader',
          type: 'anyone'
        }
      });
      
      // Additional permission for =IMAGE() functions to work
      await drive.permissions.create({
        fileId: spreadsheetId,
        resource: {
          role: 'writer',
          type: 'anyone'
        }
      });
      
      console.log('Sheet permissions set to public readable and writable');
    } catch (permError) {
      console.warn('Could not set public permissions:', permError.message);
    }
    
    // Generate sheet URL
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
    
    return {
      spreadsheetId,
      url: sheetUrl
    };
    
  } catch (error) {
    console.error('Error creating Google Sheet:', error);
    throw error;
  }
}

export async function updateGoogleSheet(clientData, spreadsheetId) {
  try {
    console.log('Updating Google Sheet...');
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    if (!spreadsheetId) {
      throw new Error('spreadsheetId is required');
    }
    
    // 1. Clear all content from the sheet
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'A:Z',
    });
    
    console.log('Sheet cleared');
    
    // 2. Prepare data structure
    const rows = [];
    
    // Row 1: Client logo
    if (clientData.client.logoUrl) {
      rows.push(['Logo:', `=IMAGE("${clientData.client.logoUrl}")`]);
    } else {
      rows.push(['Logo:', 'Not available']);
    }
    
    // Row 2: Client name
    rows.push(['Client:', clientData.client.name]);
    
    // Row 3: Empty separator
    rows.push(['']);
    
    // Row 4: Deals headers
    rows.push(['ASSOCIATED DEALS']);
    rows.push(['Deal Name', 'Stage', 'Amount', 'Close Date']);
    
    // Rows 6+: Deal data
    if (clientData.deals.length > 0) {
      clientData.deals.forEach(deal => {
        rows.push([
          deal.name,
          deal.stage,
          deal.amount,
          deal.closeDate ? new Date(deal.closeDate).toLocaleDateString() : ''
        ]);
      });
    } else {
      rows.push(['No associated deals', '', '', '']);
    }
    
    // 3. Write all data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED', // Important for =IMAGE() formulas to work
      resource: {
        values: rows
      }
    });
    
    // 4. Apply basic formatting
    await applyFormatting(sheets, spreadsheetId, rows.length);
    
    console.log(`Google Sheet updated with ${clientData.deals.length} deals`);
    
  } catch (error) {
    console.error('Error updating Google Sheet:', error);
    throw error;
  }
}

async function applyFormatting(sheets, spreadsheetId, totalRows) {
  try {
    const requests = [
      // Set row height for logo row (make it taller)
      {
        updateDimensionProperties: {
          range: {
            sheetId: 0,
            dimension: 'ROWS',
            startIndex: 0,
            endIndex: 1
          },
          properties: {
            pixelSize: 120  // Make logo row taller (default is ~21px)
          },
          fields: 'pixelSize'
        }
      },
      // Make headers bold
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true
              }
            }
          },
          fields: 'userEnteredFormat.textFormat.bold'
        }
      },
      // Deals header formatting
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 3,
            endRowIndex: 5,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true
              },
              backgroundColor: {
                red: 0.9,
                green: 0.9,
                blue: 0.9
              }
            }
          },
          fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor'
        }
      },
      // Adjust column widths
      {
        updateDimensionProperties: {
          range: {
            sheetId: 0,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 4
          },
          properties: {
            pixelSize: 200
          },
          fields: 'pixelSize'
        }
      }
    ];
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests
      }
    });
    
    console.log('Formatting applied');
    
  } catch (error) {
    console.error('Error applying formatting:', error);
    // Don't throw error, formatting is optional
  }
}

// api/hubspot-webhook.js
import { getClientAndDeals, updateReportUrl } from '../lib/hubspot.js';
import { createNewGoogleSheet, updateGoogleSheet } from '../lib/googlesheets.js';

export default async function handler(req, res) {
  // Verify it's a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    let webhookData = req.body;
    
    // HubSpot may send an array of events
    if (Array.isArray(webhookData) && webhookData.length > 0) {
      webhookData = webhookData[0]; // Take the first event
    }
    
    // Verify this is the webhook for Custom Object Client and "report" property
    if (webhookData.objectTypeId === '2-46236743' && 
        webhookData.propertyName === 'report' && 
        webhookData.propertyValue === 'true') {
      
      const clientId = webhookData.objectId;
      console.log(`Processing client ID: ${clientId}`);
      
      // Get client data and associated deals
      const clientData = await getClientAndDeals(clientId);
      
      let sheetUrl;
      let spreadsheetId;
      
      // Check if report_url already exists
      if (!clientData.client.reportUrl || clientData.client.reportUrl.trim() === '') {
        console.log('No report URL found, creating new Google Sheet');
        
        // Create new Google Sheet
        const newSheet = await createNewGoogleSheet(clientData.client.name);
        spreadsheetId = newSheet.spreadsheetId;
        sheetUrl = newSheet.url;
        
        // Update report_url in HubSpot
        await updateReportUrl(clientId, sheetUrl);
        
        console.log(`New sheet created: ${sheetUrl}`);
      } else {
        console.log('Existing report URL found, using existing sheet');
        
        // Extract spreadsheetId from existing URL
        sheetUrl = clientData.client.reportUrl;
        const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
          throw new Error('Invalid Google Sheets URL format');
        }
        spreadsheetId = match[1];
      }
      
      // Update the Google Sheet (new or existing)
      await updateGoogleSheet(clientData, spreadsheetId);
      
      console.log('Google Sheet updated successfully');
      
      return res.status(200).json({ 
        message: 'Webhook processed successfully',
        clientId: clientId,
        dealsCount: clientData.deals.length,
        sheetUrl: sheetUrl,
        isNewSheet: !clientData.client.reportUrl
      });
    }
    
    // If it's not the webhook we're expecting, respond OK but don't process
    return res.status(200).json({ message: 'Webhook received but not processed' });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

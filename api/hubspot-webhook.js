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

// lib/hubspot.js
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

export async function getClientAndDeals(clientId) {
  try {
    console.log(`Fetching client data for ID: ${clientId}`);
    
    // 1. Get client information (Custom Object)
    const clientResponse = await fetch(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/2-46236743/${clientId}?properties=name,logo_url,report_url`,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!clientResponse.ok) {
      throw new Error(`Error fetching client: ${clientResponse.status} ${clientResponse.statusText}`);
    }
    
    const clientData = await clientResponse.json();
    console.log('Client data:', clientData);
    
    // 2. Get deals associated with the client
    const associationsResponse = await fetch(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/2-46236743/${clientId}/associations/deals`,
      {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!associationsResponse.ok) {
      throw new Error(`Error fetching associations: ${associationsResponse.status} ${associationsResponse.statusText}`);
    }
    
    const associations = await associationsResponse.json();
    console.log(`Found ${associations.results?.length || 0} associated deals`);
    
    // 3. Get details for each deal
    let deals = [];
    if (associations.results && associations.results.length > 0) {
      const dealIds = associations.results.map(deal => deal.id);
      
      // Make batch request to get all deals
      const dealsResponse = await fetch(
        `${HUBSPOT_BASE_URL}/crm/v3/objects/deals/batch/read`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: dealIds.map(id => ({ id })),
            properties: ['dealname', 'dealstage', 'amount', 'closedate', 'createdate']
          })
        }
      );
      
      if (!dealsResponse.ok) {
        throw new Error(`Error fetching deals: ${dealsResponse.status} ${dealsResponse.statusText}`);
      }
      
      const dealsData = await dealsResponse.json();
      deals = dealsData.results || [];
    }
    
    console.log(`Retrieved ${deals.length} deals`);
    
    return {
      client: {
        id: clientId,
        name: clientData.properties?.name || 'Client without name',
        logoUrl: clientData.properties?.logo_url || '',
        reportUrl: clientData.properties?.report_url || ''
      },
      deals: deals.map(deal => ({
        id: deal.id,
        name: deal.properties?.dealname || 'Deal without name',
        stage: deal.properties?.dealstage || 'No stage',
        amount: formatAmount(deal.properties?.amount),
        closeDate: deal.properties?.closedate || '',
        createDate: deal.properties?.createdate || ''
      }))
    };
    
  } catch (error) {
    console.error('Error in getClientAndDeals:', error);
    throw error;
  }
}

function formatAmount(amount) {
  if (!amount) return '$0';
  
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) return '$0';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(numAmount);
}

export async function updateReportUrl(clientId, reportUrl) {
  try {
    console.log(`Updating report_url for client ${clientId}: ${reportUrl}`);
    
    const response = await fetch(
      `${HUBSPOT_BASE_URL}/crm/v3/objects/2-46236743/${clientId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            report_url: reportUrl
          }
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Error updating report_url: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Report URL updated successfully');
    return result;
    
  } catch (error) {
    console.error('Error updating report URL:', error);
    throw error;
  }
}

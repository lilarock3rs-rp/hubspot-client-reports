// api/hubspot-webhook.js
import { obtenerClienteYDeals, actualizarReportUrl } from '../lib/hubspot.js';
import { crearNuevoGoogleSheet, actualizarGoogleSheet } from '../lib/googlesheets.js';

export default async function handler(req, res) {
  // Verificar que sea POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    const webhookData = req.body;
    
    // Verificar que es el webhook del Custom Object Cliente y propiedad "report"
    if (webhookData.objectType === '2-46236743' && 
        webhookData.propertyName === 'report' && 
        webhookData.propertyValue === 'yes') {
      
      const clientId = webhookData.objectId;
      console.log(`Processing client ID: ${clientId}`);
      
      // Obtener datos del cliente y sus deals
      const clientData = await obtenerClienteYDeals(clientId);
      
      let sheetUrl;
      let spreadsheetId;
      
      // Verificar si ya existe un report_url
      if (!clientData.client.reportUrl || clientData.client.reportUrl.trim() === '') {
        console.log('No report URL found, creating new Google Sheet');
        
        // Crear nuevo Google Sheet
        const newSheet = await crearNuevoGoogleSheet(clientData.client.name);
        spreadsheetId = newSheet.spreadsheetId;
        sheetUrl = newSheet.url;
        
        // Actualizar el report_url en HubSpot
        await actualizarReportUrl(clientId, sheetUrl);
        
        console.log(`New sheet created: ${sheetUrl}`);
      } else {
        console.log('Existing report URL found, using existing sheet');
        
        // Extraer spreadsheetId de la URL existente
        sheetUrl = clientData.client.reportUrl;
        const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
          throw new Error('Invalid Google Sheets URL format');
        }
        spreadsheetId = match[1];
      }
      
      // Actualizar el Google Sheet (nuevo o existente)
      await actualizarGoogleSheet(clientData, spreadsheetId);
      
      console.log('Google Sheet updated successfully');
      
      return res.status(200).json({ 
        message: 'Webhook processed successfully',
        clientId: clientId,
        dealsCount: clientData.deals.length,
        sheetUrl: sheetUrl,
        isNewSheet: !clientData.client.reportUrl
      });
    }
    
    // Si no es el webhook que esperamos, responder OK pero no procesar
    return res.status(200).json({ message: 'Webhook received but not processed' });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
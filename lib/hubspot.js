// lib/hubspot.js
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

export async function obtenerClienteYDeals(clientId) {
  try {
    console.log(`Fetching client data for ID: ${clientId}`);
    
    // 1. Obtener información del cliente (Custom Object)
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
    
    // 2. Obtener deals asociados al cliente
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
    
    // 3. Obtener detalles de cada deal
    let deals = [];
    if (associations.results && associations.results.length > 0) {
      const dealIds = associations.results.map(deal => deal.id);
      
      // Hacer batch request para obtener todos los deals
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
        name: clientData.properties?.name || 'Cliente sin nombre',
        logoUrl: clientData.properties?.logo_url || '',
        reportUrl: clientData.properties?.report_url || ''
      },
      deals: deals.map(deal => ({
        id: deal.id,
        name: deal.properties?.dealname || 'Deal sin nombre',
        stage: deal.properties?.dealstage || 'Sin etapa',
        amount: formatAmount(deal.properties?.amount),
        closeDate: deal.properties?.closedate || '',
        createDate: deal.properties?.createdate || ''
      }))
    };
    
  } catch (error) {
    console.error('Error in obtenerClienteYDeals:', error);
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

export async function actualizarReportUrl(clientId, reportUrl) {
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

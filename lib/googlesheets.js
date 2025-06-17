// lib/googlesheets.js
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
});

export async function crearNuevoGoogleSheet(clientName) {
  try {
    console.log(`Creating new Google Sheet for client: ${clientName}`);
    
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    
    // Crear nuevo spreadsheet
    const createResponse = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: `${clientName} - Deals Report`
        }
      }
    });
    
    const spreadsheetId = createResponse.data.spreadsheetId;
    console.log(`New spreadsheet created with ID: ${spreadsheetId}`);
    
    // Hacer el sheet público para viewing (opcional)
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        resource: {
          role: 'reader',
          type: 'anyone'
        }
      });
      console.log('Sheet permissions set to public readable');
    } catch (permError) {
      console.warn('Could not set public permissions:', permError.message);
    }
    
    // Generar URL del sheet
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

export async function actualizarGoogleSheet(clientData, spreadsheetId) {
  try {
    console.log('Updating Google Sheet...');
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    if (!spreadsheetId) {
      throw new Error('spreadsheetId is required');
    }
    
    // 1. Limpiar todo el contenido del sheet
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'A:Z',
    });
    
    console.log('Sheet cleared');
    
    // 2. Preparar la estructura de datos
    const rows = [];
    
    // Fila 1: Logo del cliente
    if (clientData.client.logoUrl) {
      rows.push(['Logo:', `=IMAGE("${clientData.client.logoUrl}", 1)`]);
    } else {
      rows.push(['Logo:', 'No disponible']);
    }
    
    // Fila 2: Nombre del cliente
    rows.push(['Cliente:', clientData.client.name]);
    
    // Fila 3: Separador vacío
    rows.push(['']);
    
    // Fila 4: Headers de deals
    rows.push(['DEALS ASOCIADOS']);
    rows.push(['Nombre del Deal', 'Etapa', 'Monto', 'Fecha de Cierre']);
    
    // Filas 6+: Datos de deals
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
      rows.push(['No hay deals asociados', '', '', '']);
    }
    
    // 3. Escribir todos los datos
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED', // Para que funcionen las fórmulas =IMAGE()
      resource: {
        values: rows
      }
    });
    
    // 4. Aplicar formato básico
    await aplicarFormato(sheets, spreadsheetId, rows.length);
    
    console.log(`Google Sheet updated with ${clientData.deals.length} deals`);
    
  } catch (error) {
    console.error('Error updating Google Sheet:', error);
    throw error;
  }
}

async function aplicarFormato(sheets, spreadsheetId, totalRows) {
  try {
    const requests = [
      // Hacer bold las headers
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
      // Header de deals
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
      // Ajustar tamaño de columnas
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
    // No lanzar error, el formateo es opcional
  }
}
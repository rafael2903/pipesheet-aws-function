const { GoogleSpreadsheet } = require('google-spreadsheet')

async function fetchSpreadsheet(id) {
  const spreadsheet = new GoogleSpreadsheet(id)

  await spreadsheet.useServiceAccountAuth({
    client_email: process.env.CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
  })

  await spreadsheet.loadInfo()

  return spreadsheet
}

async function fetchDatabase() {
  const databaseSpreadsheetId = '1BradceGk7g9PDAUFlX_9tUyiZm4AYLz0LWx35DWNokg'
  return await fetchSpreadsheet(databaseSpreadsheetId)
}

module.exports = { fetchSpreadsheet, fetchDatabase }

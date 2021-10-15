'use strict'
require('dotenv').config()

const {
  getPhases,
  getAllCardsPageInfo,
  getAllCardsEdges,
} = require('./queries')
const { client } = require('./config/gql')
const { fetchSpreadsheet } = require('./config/spreadsheet')

function getFormattedCards(cards, dateFieldsLabels) {
  const SECONDS_IN_A_DAY = 86400

  return cards.map(({ node }) => ({
    ['Id']: node.id,
    ['Título']: node.title,
    ['Fase atual']: node.current_phase.name,
    ['Etiquetas']: node.labels.map((label) => label.name).join(','),
    ['Responsáveis']: node.assignees.map((assignee) => assignee.name).join(','),
    ['Criado em']: new Date(node.createdAt).toLocaleString('pt-BR'),
    ['Atualizado em']: new Date(node.updated_at).toLocaleString('pt-BR'),
    ['Data de vencimento do card']: new Date(node.due_date).toLocaleString(
      'pt-BR'
    ),
    ...node.fields.reduce((accumulator, currentItem) => {
      const fieldName = `${currentItem.name} (${currentItem.phase_field.phase.name})`
      return {
        ...accumulator,
        [fieldName]: dateFieldsLabels.includes(fieldName)
          ? currentItem.value
          : currentItem.report_value,
      }
    }, {}),
    ...node.phases_history.reduce(
      (accumulator, currentItem) => ({
        ...accumulator,
        [`Tempo total na fase ${currentItem.phase.name} (dias)`]: (
          currentItem.duration / SECONDS_IN_A_DAY
        )
          .toFixed(6)
          .replace('.', ','),
        [`Primeira vez que entrou na fase ${currentItem.phase.name}`]: new Date(
          currentItem.firstTimeIn
        ).toLocaleString('pt-BR'),
        [`Última vez que saiu da fase ${currentItem.phase.name}`]: new Date(
          currentItem.lastTimeOut
        ).toLocaleString('pt-BR'),
      }),
      {}
    ),
  }))
}

function getPipePhasesAndFields(pipe) {
  const phases = pipe.phases

  const phasesFields = phases
    .map((phase) =>
      phase.fields.map((field) => ({
        ...field,
        label: `${field.label} (${phase.name})`,
      }))
    )
    .flat()

  const startFormFields = pipe.start_form_fields.map((field) => ({
    ...field,
    label: `${field.label} (Start form)`,
  }))

  const fields = [...startFormFields, ...phasesFields]

  return { phases, fields }
}

function getDateFieldsLabels(fields) {
  return fields
    .filter(
      (field) =>
        field.type === 'date' ||
        field.type === 'datetime' ||
        field.type === 'due_date'
    )
    .map((field) => field.label)
}

function getHeaders(phases, fields) {
  const fieldsLabels = fields.map((field) => field.label)

  const phasesHeaders = phases
    .map((phase) => [
      `Tempo total na fase ${phase.name} (dias)`,
      `Primeira vez que entrou na fase ${phase.name}`,
      `Última vez que saiu da fase ${phase.name}`,
    ])
    .reduce((accumulator, currentItem) => [...accumulator, ...currentItem])

  const headers = [
    'Id',
    'Título',
    'Fase atual',
    'Etiquetas',
    'Responsáveis',
    'Criado em',
    'Atualizado em',
    'Data de vencimento do card',
    ...fieldsLabels,
    ...phasesHeaders,
  ]

  return headers
}

async function fetchAllCursors(pipeId) {
  let cursors = []
  let hasNextPage, endCursor

  do {
    const variables = endCursor ? { pipeId, after: endCursor } : { pipeId }
    const response = await client.request(getAllCardsPageInfo, variables)
    const { pageInfo } = response.allCards
    hasNextPage = pageInfo.hasNextPage
    endCursor = pageInfo.endCursor
    cursors.push(endCursor)
  } while (hasNextPage)

  cursors.pop()
  return cursors
}

async function fetchAllCards(cursors, pipeId) {
  let requests = cursors.map((cursor) =>
    client.request(getAllCardsEdges, { pipeId, after: cursor })
  )
  requests.push(client.request(getAllCardsEdges, { pipeId }))

  const response = await Promise.all(requests)

  const allCards = response.reduce(
    (accumulator, currentItem) => [
      ...accumulator,
      ...currentItem.allCards.edges,
    ],
    []
  )

  return { allCards }
}

async function synchronizeIntegration({ pipeId, spreadsheetId, sheetId }) {
  const cursors = await fetchAllCursors(pipeId)
  const { allCards } = await fetchAllCards(cursors, pipeId)

  const { pipe } = await client.request(getPhases, { pipeId })

  const { phases, fields } = getPipePhasesAndFields(pipe)
  const dateFieldsLabels = getDateFieldsLabels(fields)
  const headers = getHeaders(phases, fields)

  const cards = getFormattedCards(allCards, dateFieldsLabels)

  const spreadsheet = await fetchSpreadsheet(spreadsheetId)
  const sheet = spreadsheet.sheetsById[sheetId]

  if (sheet.columnCount < headers.length)
    await sheet.resize({
      rowCount: sheet.rowCount,
      columnCount: headers.length,
    })

  if (sheet.rowCount < cards.length)
    await sheet.resize({
      rowCount: cards.length + 500,
      columnCount: sheet.columnCount,
    })

  await sheet.clear()
  await sheet.setHeaderRow(headers)
  await sheet.addRows(cards)
}

module.exports.synchronize = async (event) => {
  const { integrations } = event

  try {
    const synchronizations = integrations.map((integration) =>
      synchronizeIntegration(integration)
    )
    await Promise.allSettled(synchronizations)

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Successfully synchronized' }),
    }
  } catch (error) {
    console.log(error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Error while synchronizing: ${error.message}`,
      }),
    }
  }
}

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

  function buildFields(node) {
    if (node.fields) {
      return node.fields.reduce((accumulator, currentItem) => {
        const fieldName = `${currentItem.name} (${currentItem.phase_field.phase.name})`
        return {
          ...accumulator,
          [fieldName]: dateFieldsLabels.includes(fieldName)
            ? currentItem.value
            : currentItem.report_value,
        }
      }, {})
    }
    return []
  }

  function buildPhasesHistory(node) {
    if (node.phases_history) {
      return node.phases_history.reduce(
        (accumulator, currentItem) => ({
          ...accumulator,
          [`Tempo total na fase ${currentItem.phase.name} (dias)`]: (
            currentItem.duration / SECONDS_IN_A_DAY
          )
            .toFixed(6)
            .replace('.', ','),
          [`Primeira vez que entrou na fase ${currentItem.phase.name}`]:
            new Date(currentItem.firstTimeIn).toLocaleString('pt-BR'),
          [`Última vez que saiu da fase ${currentItem.phase.name}`]: new Date(
            currentItem.lastTimeOut
          ).toLocaleString('pt-BR'),
        }),
        {}
      )
    }

    return []
  }

  return cards.map(({ node }) => ({
    ['Id']: node.id,
    ['Título']: node.title,
    ['Fase atual']: node.current_phase?.name,
    ['Etiquetas']: node.labels?.map((label) => label.name).join(','),
    ['Responsáveis']: node.assignees
      ?.map((assignee) => assignee.name)
      .join(','),
    ['Criado em']: new Date(node.createdAt).toLocaleString('pt-BR'),
    ['Atualizado em']: new Date(node.updated_at).toLocaleString('pt-BR'),
    ['Data de vencimento do card']: new Date(node.due_date).toLocaleString(
      'pt-BR'
    ),
    ...buildPhasesHistory(node),
    ...buildFields(node),
  }))
}

function getPipePhasesAndFields({ phases = [], start_form_fields = [] }) {
  const phasesFields = phases.flatMap(({ name: phaseName, fields = [] }) =>
    fields.map((field) => ({
      ...field,
      label: `${field.label} (${phaseName})`,
    }))
  )

  const startFormFields = start_form_fields.map((field) => ({
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

function getHeaders(phases, fields, columns) {
  const fieldsLabels = fields.map((field) => field.label)

  const phasesHeaders = phases.flatMap((phase) => [
    `Tempo total na fase ${phase.name} (dias)`,
    `Primeira vez que entrou na fase ${phase.name}`,
    `Última vez que saiu da fase ${phase.name}`,
  ])

  let headers = []

  columns.id && headers.push('Id')
  columns.title && headers.push('Título')
  columns.currentPhase && headers.push('Fase atual')
  columns.labels && headers.push('Etiquetas')
  columns.assignees && headers.push('Responsáveis')
  columns.createdAt && headers.push('Criado em')
  columns.updatedAt && headers.push('Atualizado em')
  columns.dueDate && headers.push('Data de vencimento do card')
  columns.dueDate && headers.push('Data de vencimento do card')
  columns.dueDate && headers.push('Data de vencimento do card')
  headers.push(...fieldsLabels)
  columns.phasesHistory && headers.push(...phasesHeaders)

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

async function fetchAllCards(cursors, pipeId, columns) {
  const fields = columns.startFormFields || columns.phasesFormsFields

  let requests = cursors.map((cursor) =>
    client.request(getAllCardsEdges, {
      pipeId,
      after: cursor,
      fields,
      ...columns,
    })
  )

  requests.push(
    client.request(getAllCardsEdges, { pipeId, fields, ...columns })
  )

  const response = await Promise.all(requests)

  const allCards = response.reduce(
    (accumulator, currentItem) => [
      ...accumulator,
      ...currentItem.allCards.edges,
    ],
    []
  )

  return allCards
}

async function synchronizeIntegration({
  pipeId,
  spreadsheetId,
  sheetId,
  columns,
}) {
  const cursors = await fetchAllCursors(pipeId)
  const allCards = await fetchAllCards(cursors, pipeId, columns)

  const { phasesFormsFields, phasesHistory, startFormFields } = columns
  const phasesData = phasesFormsFields || phasesHistory
  const { pipe } = await client.request(getPhases, {
    pipeId,
    phasesData,
    startFormFields,
    phasesFormsFields,
  })

  const { phases, fields } = getPipePhasesAndFields(pipe)

  const dateFieldsLabels = getDateFieldsLabels(fields)
  const headers = getHeaders(phases, fields, columns)

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

    const results = await Promise.allSettled(synchronizations)

    const rejectedResults = results
      .filter((result) => result.status === 'rejected')
      .map((result) => {
        const reason = result.reason
        console.error(reason)
        return reason.message
      })

    const message = rejectedResults.length
      ? 'Synchronized with some errors'
      : 'Successfully synchronized'
    const body = { message, errors: rejectedResults }

    return {
      statusCode: 200,
      body: JSON.stringify(body),
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

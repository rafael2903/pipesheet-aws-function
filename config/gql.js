const { GraphQLClient } = require('graphql-request')

const endpoint = 'https://api.pipefy.com/graphql'

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  authorization: 'Bearer ' + process.env.PIPEFY_PERSONAL_ACCESS_TOKEN,
}

const client = new GraphQLClient(endpoint, { headers })

module.exports = { client }

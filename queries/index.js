const { gql } = require('graphql-request')

const getAllCardsPageInfo = gql`
  query ($pipeId: ID!, $after: String) {
    allCards(pipeId: $pipeId, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const getAllCardsEdges = gql`
  query ($pipeId: ID!, $after: String) {
    allCards(pipeId: $pipeId, after: $after) {
      edges {
        node {
          title
          id

          current_phase {
            name
          }

          labels {
            name
          }

          due_date

          updated_at

          assignees {
            name
          }

          createdAt

          fields {
            name
            value
            report_value
          }

          phases_history {
            phase {
              name
            }
            duration
            firstTimeIn
            lastTimeOut
          }
        }
      }
    }
  }
`

const getPhases = gql`
  query ($pipeId: ID!) {
    pipe(id: $pipeId) {
      start_form_fields {
        label
        type
      }
      phases {
        name
        fields {
          label
          type
        }
      }
    }
  }
`
module.exports = { getAllCardsPageInfo, getAllCardsEdges, getPhases }
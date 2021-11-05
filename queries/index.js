const { gql } = require("graphql-request");

const getAllCardsPageInfo = gql`
  query ($pipeId: ID!, $after: String) {
    allCards(pipeId: $pipeId, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const getAllCardsEdges = gql`
  query (
    $pipeId: ID!
    $after: String
    $id: Boolean = true
    $title: Boolean = true
    $currentPhase: Boolean = true
    $labels: Boolean = true
    $assignees: Boolean = true
    $createdAt: Boolean = true
    $updatedAt: Boolean = true
    $dueDate: Boolean = true
    $fields: Boolean = true
    $phasesHistory: Boolean = true
  ) {
    allCards(pipeId: $pipeId, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id @include(if: $id)
          title @include(if: $title)

          current_phase @include(if: $currentPhase) {
            name
          }

          labels @include(if: $labels) {
            name
          }

          assignees @include(if: $assignees) {
            name
          }

          updated_at @include(if: $updatedAt)
          createdAt @include(if: $createdAt)
          due_date @include(if: $dueDate)

          fields @include(if: $fields) {
            name
            value
            report_value
          }

          phases_history @include(if: $phasesHistory) {
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
`;

const getPhases = gql`
  query (
    $pipeId: ID!
    $startFormFields: Boolean!
    $phasesData: Boolean!
    $phasesFormsFields: Boolean!
  ) {
    pipe(id: $pipeId) {
      start_form_fields @include(if: $startFormFields) {
        label
        type
      }
      phases @include(if: $phasesData) {
        name
        fields @include(if: $phasesFormsFields) {
          label
          type
        }
      }
    }
  }
`;
module.exports = { getAllCardsPageInfo, getAllCardsEdges, getPhases };

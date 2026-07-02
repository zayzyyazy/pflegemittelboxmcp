# Create agent

<!-- source: Create agent - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Introduction Create agent snapshot
Powered by
Agents
Create agent
Create a New Agent
This endpoint allows you to create a new conversational agent. Agents are the core
building blocks of Leaping AI that handle conversations with users across various
channels.
About Agents
An agent consists of:
Request Body
The request accepts a JSON object with the following properties:
Response
On success, the endpoint returns:
Important Notes
Common Errors
Example
Name: A unique identifier for the agent
Fields: Data fields that store information during conversations
Stages: Different phases of the conversation flow
Functions: Capabilities the agent can use during conversations
name (string, required): The name of the agent
frontend_nodes (array, optional): Node data for frontend visualization
frontend_edges (array, optional): Edge data for frontend visualization
deprecated_nodes_data (any, required): Legacy nodes data
fields (array, optional): Custom fields for the agent, in addition to the default
reserved fields
summary_config (object, optional): Configuration for conversation summarization
Status code: 201 Created
Body: JSON object containing the complete agent configuration, including system-
generated fields
Once created, you’ll need to create snapshots of the agent to deploy them
Fields prefixed with leaping_ are reserved for system use
The created agent will be associated with your user account
422 Unprocessable Entity: If the request body contains invalid data
403 Forbidden: If you lack permissions to create agents
curl -X POST "https://api.leaping.ai/v1/agents/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Customer Service Agent",
    "deprecated_nodes_data": {},
    "fields": []
  }'
Ask a question...
⌘I


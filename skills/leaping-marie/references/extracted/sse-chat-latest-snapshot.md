# SSE Chat (Latest Snapshot)

<!-- source: SSE Chat (Latest Snapshot) - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

SSE Chat Evaluate call
Powered by
Chat
Start a Server-Sent Events (SSE) chat session with the latest snapshot of an agent
SSE Chat (Latest Snapshot)
Overview
This endpoint initiates a Server-Sent Events (SSE) streaming chat session with the latest snapshot of a
specified agent. It automatically uses the most recent snapshot of the agent, ensuring you’re always chatting
with the up-to-date configuration without needing to specify a specific snapshot ID.
Path Parameters
The unique identifier of the agent whose latest snapshot you want to chat with
Query Parameters
Identifier for the end user initiating the chat session
Optional chat ID to resume an existing chat session. If not provided, a new chat will be created.
Message to pass to the agent
Authentication
This endpoint requires OAuth2 Bearer token authentication. Include the token in the Authorization header:
Response
The endpoint returns a Server-Sent Events stream with the same format as the snapshot-specific endpoint.
Each event contains a JSON-serialized LeapingResponse object sent as data-only SSE events.
Response Format
Each SSE event contains a JSON-serialized LeapingResponse with the following structure:
Discriminator field indicating the response type. Common values include:
Unix timestamp when the response was generated
For detailed field descriptions of each response type, see the  documentation.
Usage Examples
JavaScript/Browser
Python with httpx-sse
cURL
Advantages of Latest Snapshot
Using the latest snapshot endpoint provides several benefits:
Caching Behavior
The system implements intelligent caching for performance:
1. Redis Cache: Latest snapshots are cached in Redis for fast retrieval
2. Cache Miss Handling: Falls back to Supabase database when cache is unavailable
3. Automatic Updates: Cache is updated when new snapshots are created
Resuming Chats
When resuming a chat with a latest snapshot endpoint, the system validates that the chat was originally
created with the same agent:
Important: You can only resume chats that were originally started with the same agent ID.
Error Handling
Common error scenarios specific to this endpoint:
Example error response:
Best Practices
Comparison with Snapshot Endpoint
Feature Latest Snapshot Specific Snapshot
Version Control Always latest Specific version
Consistency May change between calls Guaranteed consistent
Development Ideal for testing Better for production
Use Case Dynamic environments Stable, versioned deployments
agent_idstring required
end_user_idstring required
chat_idstring
user_messagestring
typestring required
chat_message: Agent or human messages
turn: Turn management (whose turn to speak)
error: Error messages
transition: Stage transitions in conversation flow
start: Conversation initialization
end: Conversation completion with summary and results
function: Function call execution
kb: Knowledge base lookup results
timestampnumber required
See all 41 lines
See all 270 lines
Always Current: Automatically uses the most recent agent configuration
Simplified Integration: No need to track or manage snapshot IDs
Development Friendly: Ideal for development and testing environments
Automatic Updates: Agent improvements are immediately available
404: Agent not found or no snapshots available
400: Cannot resume chat with different agent (when using chat_id)
401: Invalid or missing authentication token
403: Insufficient permissions to access the agent
Use this endpoint in production when you want the latest agent behavior
Implement proper error handling for agent compatibility issues
Consider using specific snapshot endpoints for version-controlled environments
Monitor agent updates that might affect existing chat sessions
Store both agent_id and the actual snapshot_id used for audit purposes
Authorization: Bearer your_access_token
const eventSource = new EventSource(
  '/chat/agent/your-agent-id/latest?end_user_id=user123&user_message=Hello',
  {
    headers: {
      'Authorization': 'Bearer your_access_token'
    }
  }
1
2
3
4
5
6
7
import httpx
import json
import asyncio
from httpx_sse import aconnect_sse
from typing import Optional, Dict, Any
from datetime import datetime
1
2
3
4
5
6
7
curl -X POST \
  "https://api.leaping.ai/v1/chat/agent/your-agent-id/latest?end_user_id=user123" \
  -H "Authorization: Bearer your_access_token" \
  -H "Accept: text/event-stream"
// Resume existing chat
const eventSource = new EventSource(
  '/chat/agent/your-agent-id/latest?end_user_id=user123&chat_id=existing-chat-id'
);
{
  "type": "error", 
  "message": "Cannot resume chat with different agent.",
  "timestamp": 1704067200.123
}
Chat with Snapshot (SSE)
Ask a question...
⌘I
Chat SSE Chat (Latest Snapshot)


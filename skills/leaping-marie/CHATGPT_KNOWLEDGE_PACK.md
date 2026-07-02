# Leaping AI + Marie — knowledge pack
<!-- Generated from official Leaping PDF exports. Upload to ChatGPT Custom GPT knowledge. -->

---

---
name: leaping-marie
description: >-
  Official Leaping AI voice agent platform (Studio, nodes, stages, transitions,
  fields, MCP servers, telephony, API) and Marie Pflegemittelbox clone integration.
  Use when building, prompting, debugging, or wiring Leaping agents, Function nodes,
  MCP tools, phone deployment, outbound, get/export calls, SSE chat, or Marie
  Kundenidentifizierung with pmb_verification_* brains.
---

# Leaping AI + Marie

Knowledge source: **16 official Leaping PDF exports** in `references/extracted/`.
Do not invent Leaping UI labels, API paths, or MCP behavior — read the matching extracted doc first.

## When to use this skill

- Leaping Studio: Agent Setup, Dialogue, Scripted, Function, Junction, Switch, Field setter, End
- MCP servers tab: discover tools, stage exposure, Function node = one MCP tool
- Prompting Marie clones (agent vs stage layers, pronunciation, transitions)
- Telephony, snapshots, publish/deploy phone numbers
- Leaping REST API: login, agents, calls, export, outbound SMS, SSE chat
- Pflegemittelbox MCP (`pmb_verification_*`) + Marie native functions

## Official doc index

| Topic | File |
|-------|------|
| Studio / node types | `references/extracted/agent-builder-studio.md` |
| Agent settings, fields, functions | `references/extracted/details.md` |
| MCP servers (critical) | `references/extracted/mcp-servers.md` |
| Prompting | `references/extracted/prompting-best-practices.md` |
| Telephony | `references/extracted/phone-numbers-telephony.md` |
| Create agent API | `references/extracted/create-agent.md` |
| Login API | `references/extracted/login.md` |
| Get calls API | `references/extracted/get-calls.md` |
| Export calls | `references/extracted/export-calls.md` |
| Outbound | `references/extracted/outbound.md` |
| Send outbound SMS | `references/extracted/send-outbound-sms.md` |
| SSE Chat | `references/extracted/sse-chat.md` |
| SSE Chat snapshot | `references/extracted/sse-chat-latest-snapshot.md` |
| Calls UI | `references/extracted/calls.md` |
| Home / dashboard | `references/extracted/home-area.md` |
| Phone deployment | `references/extracted/create-phone-deployment.md` |

Marie/MCP project overlay: `references/project-marie-mcp.md`

---

## Leaping Studio essentials

### Conversation model

- Conversations = **steps** (nodes) connected by **transitions** (plain-language conditions).
- **Fields** = typed variables (Real, Integer, Boolean, Text) with defaults; persist across the call.
- **Save** persists to DB; **Publish** makes changes testable (voice/text chat on the right).
- **Phone button** deploys published snapshot to an assigned number.
- Reserved fields use `leaping_` prefix (e.g. `leaping_conversation_id`, `leaping_conversation_id_hex`).

### Node types (when to use which)

| Node | Behavior |
|------|----------|
| **Agent Setup** | System message — loaded **every turn**. Keep short (<2k tokens). Role + tone only; not full scripts. |
| **Scripted** | Verbatim TTS — exact words spoken. Good for intro/outro/transfer preamble. |
| **Dialogue** | Plain-language job description; LLM decides wording. Native + MCP tools selectable. |
| **Function** | **Deterministic** — runs 100% of the time when reached. Native function **or** exactly **one** MCP tool (not both). |
| **Field setter** | Manually set field values (intent flags, voicemail `leaping_call_voicemail_detected`, etc.). |
| **Junction / Switch** | Route by field value; Switch has default case. |
| **Call Transfer** | Phone (+E.164) or SIP (INVITE/REFER). |
| **End** | Marks Completed; generates summary. |
| **Post conversation** | Runs after call ends (e.g. CRM summary). |

### Functions (native)

- Configure under **Configure → Functions** (API Call, Summarizer, Template, Wait, Send DTMF).
- In **Dialogue**: optional capability — agent decides when to call (referenced in prompt).
- In **Function node**: automatic execution — use for deterministic gates (MCP brains, lookups).

**Marie rule:** For verification, use **Function nodes** for MCP brain calls. Do not leave all CRM natives enabled on a large Dialogue stage — Marie will call them out of order.

---

## MCP servers (Leaping v1)

Source: `references/extracted/mcp-servers.md`

### Setup

1. Agent → **MCP Servers** tab → Add server
2. **Server URL** = remote **Streamable HTTP** endpoint (e.g. `https://mcp.example.com/mcp`)
3. Optional: **Tool Prefix**, **Bearer** or **Custom Header** auth (secrets encrypted at rest)
4. Click **Discover** → lists **Tools** and **Prompts** (resources not supported in v1)
5. Discovery cached on agent save; live tools at call time come from server

### Stage exposure

| Node type | MCP behavior |
|-----------|--------------|
| **Dialogue / Response** | Toggle which MCP tools agent **may** call (like native functions) |
| **Function** | Select **exactly one** MCP tool; bind args to fields/literals; unbound args filled by agent |

### MCP prompts as messages

- System message, stage message, or Scripted node can use **Use MCP prompt**
- Fallback chain: live server render → saved preview with `{{field}}` filled → hand-authored static text
- **Must** keep non-empty plain message as last-resort fallback (publish blocked otherwise)
- Field-bound args sent as literal `{{field_name}}` — server must passthrough-interpolate
- System message: resolved once at call start; field args re-evaluated each turn; **no LLM-extracted args** for system prompt

### Security / limits

- SSRF guard (no private/loopback/metadata IPs)
- Timeouts on connect/read/tool/prompt
- 256 KiB response cap
- Remote HTTP only (no stdio/local)
- Static auth only (no OAuth in v1)

### Pflegemittelbox MCP

- Leaping discovers via `POST /mcp/sse` → `tools/list` (Streamable HTTP)
- After deploy: disconnect/reconnect MCP in Leaping to refresh tools
- Brain tools return legacy controller JSON — see `references/project-marie-mcp.md`

---

## Prompting best practices (Leaping)

Source: `references/extracted/prompting-best-practices.md`

1. **Agent Setup < ~2,000 tokens** — loaded every step; long system prompts add latency.
2. **Pronunciation rules with examples** — PLZ digit-by-digit, emails comma-separated, birthdays spoken slowly.
3. **Name transitions/functions in prompt** — e.g. “call `call transfer` if customer wants human”.
4. **Steps + examples** — tell the model exactly what to do.
5. **CAPS for hard rules** — e.g. “DO NOT repeat the customer answer”.
6. **No LLM math/text-compare** — use functions for exact operations.
7. **Iterate continuously** after go-live.

### Marie prompt layering

| Layer | Content |
|-------|---------|
| **Agent Setup** | Personality, product overview, transfer rules, pronunciation — **not** verification logic |
| **Kundenident stage** | MCP executor only — see `references/project-marie-mcp.md` |
| **Other stages** | Anliegen, delivery, box change — after `transition_to: weiter` |

**Kundenident executor rules (Marie clone):**

- Do not verify yourself — only execute MCP output
- `allowed_to_call_function=true` → exact `function_to_call` + `function_arguments`
- `allowed_to_transition=true` → exact `transition_to`
- Else → exact `say` only (**empty = silence**, no filler)
- After native function → same brain again with result field; **omit stale `latest_customer_input`**
- Router phase: after method answer → `pmb_verification_method_router` again before brain

---

## API quick reference

Base: `https://api.leaping.ai/v1/`

| Endpoint | Purpose |
|----------|---------|
| `POST /login` | Form auth → `access_token` (Bearer on subsequent calls) |
| `POST /agents/` | Create agent (`name`, `deprecated_nodes_data`, `fields`, …) |
| `GET /calls/` | List calls (`agent_id`, filters, pagination) — see extracted doc |
| Export / outbound SMS / SSE chat | See respective `references/extracted/*.md` |

Always use `Authorization: Bearer YOUR_ACCESS_TOKEN`. Never commit credentials.

---

## Marie verification flow (Pflegemittelbox)

Full detail: `references/project-marie-mcp.md`

```
get_customer_by_phone
→ pmb_debug_echo_session_only (optional)
→ pmb_verification_method_router
→ phone | address | vnr brain
→ native ONLY when allowed_to_call_function=true
→ same brain + native result field
→ transition ONLY when allowed_to_transition=true
```

### Bindings

| MCP arg | Leaping field |
|---------|---------------|
| `session_id` | `leaping_conversation_id_hex` |
| `latest_customer_input` | current verification answer only |
| `id_phone` | after phone lookup |

### MCP response shape (stabilization branch)

`ok`, `method`, `next_action`, `allowed_to_call_function`, `function_to_call`,
`allowed_to_transition`, `transition_to`, `say`, `reason`, `missing_fields`, `safety_flags`

### Preflight

```bash
cd server && node --import tsx src/tools/verification-deployment-preflight.ts
```

---

## How to work as an agent

1. For Leaping platform questions → open the matching `references/extracted/*.md` first.
2. For Marie/MCP wiring → `references/project-marie-mcp.md` + repo `server/src/routes/mcp-http.ts`.
3. Prefer **Function nodes** over Dialogue tool freedom for deterministic flows.
4. When debugging “Marie disobeyed MCP” → check: slim MCP response?, wrong node type?, stale field bindings?, all natives enabled on stage?
5. Do not guess Leaping UI — cite extracted doc or say what’s missing.

## Install / regenerate

```bash
python3 scripts/ingest-leaping-pdfs.py      # after PDF updates
python3 scripts/build-leaping-marie-skill.py  # sync to .cursor / .codex
```

ChatGPT: upload `CHATGPT_KNOWLEDGE_PACK.md` — see `INSTALL.md`.

---

# Extracted PDF source documents

---

# Agent builder (Studio)

<!-- source: Agent builder (Studio) - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Home area Details
Powered by
Essentials
Drag and drop builder
Agent builder (Studio)
In general, we model a conversation as a series of conversation steps. Each conversation step has its own
box or AI mini agent to instruct it in plain language.
General usage
Nodes (white boxes) can be added into the conversation canvas by dragging and dropping them from the left
side into the canvas. They can be edited by clicking on the pencil button.
Transitions (purple boxes within nodes) are used to connect different nodes with lines. Simply connect a
transition box with another node. Transitions are conditions described in plain language upon the triggering
of which the AI will go to some other part of the conversation tree. The description of a transition could be:
“customer wants to speak to a human”.
History shows past versions of the voice AI agent. If you want to restore a prior version, simply click on
history and select a prior agent version.
Fields are containers of information that can be referenced throughout the conversation. They have default
values and can be read / written to throughout the conversation.
Save button can be used to persist changes into the database.
Publish button is used make those saved changes testable. On the right side, one can press the “voice chat”
or “text chat” button to test the published voice AI agent. Before pressing Publish, make sure that all nodes
and transitions are connected.
Phone button allows deploying the changes to a phone number that was assigned to your organisation / that
you added from Twilio. If you call that phone number, you can speak to your newly created voice AI agent.
Different node types
Agent Setup
This node uses plain language to describe the overall goal of the AI agent. It should contain the role and the
task of the agent. Furthermore, general instructions on how to speak or behave can be included here. Note
that the content of this node will be loaded at every turn of the conversation.
Tip: do not include too many details of the script in this node. These details are best placed in the other
nodes coming after the start node.
Scripted
The words typed into the Scripted node will be spoken at verbatim, meaning exactly as they are typed into
the node. Scripted nodes are especially suitable for the following situations:
Dialogue
A dialogue node differs from a scripted node in that you tell the AI what its job is and not which words to say.
Plain language is used to give instructions to the AI agent in the stage message. Functions can be selected to
give the AI agent abilities to read / write data from external systems.
Transitions can be added to navigate the conversation to another conversation step.
Field setter
The field setter node can be used to set the value for certain variables manually.
Use cases:
Junction
A junction node can check the value of a certain field and depending on its value, route the conversation to
one part of the conversation tree or another.
One example is detecting at the beginning of the conversation if the call is an inbound or outbound call.
Function
Generally, functions can be used to read / write from an external data system. They can be executed within a
dialogue box or executed as part of a separate stage / node. The advantage of the latter is that the function
is executed deterministically 100% of the time.
Call Transfer
This node will initiate a call transfer to a third party. There are two options: transfer by phone number of
transfer by SIP.
In the former, you have to enter the target phone number. Note that the phone number has to have ’+(country
code)’ format before the actual phone number.
In the case of transfer by SIP, you have to enter the SIP URI and if relevant, any SIP headers, such as
conversation ids. SIP can be either SIP Invite or SIP REFER. Please talk to kevin(dot)wu(at)leapingai(dot)com
to evaluate the best possible option for your business.
End
Calls that reach the End node will be marked as Completed in the frontend. A summary will be generated for
every call, irrespective of if the call completes or gets dropped. The prompt for the summary is inside the End
node.
Post conversation
A post conversation node is the same as a function node, but it is executed after the conversation completes,
irrespective of the status of the call. An especially good use case is sending a call summary to a CRM.
Switch
Overview
The Switch node directs the conversation flow based on the value of a specific Field. It allows you to define
multiple cases for different values and route the caller accordingly.
Use Cases
For example, you can use the Switch node to route callers based on their country code. Cases might be
configured for values such as DE, US, or AU, directing the caller to the appropriate node for their country.
Default Case
If the Field value doesn’t match any of the defined cases, the Switch node will automatically use its default
case, ensuring a fallback path for any unexpected or undefined input.
Intro: Saying the same greeting to every customer at the start of the conversation
Outro: Saying the same goodbye message to every customer at the end of the conversation
Before a call transfer: Saying a standardised message before transferring the call to a human
Storing certain information that should be accessed further downstream in the conversation. Example
could be storing the intent of a customer.
Making it easier to filter exported calls. In the example in the screenshot below, we determine if a
customer is a qualified customer in a previous step and transition to a field setter node that sets the
value of the qualified field to true. As every field is its own column in the calls export, this allows for easy
filtering of qualified customers.
Detecting voicemail. Setting the field leaping_call_voicemail_detected to true will mark the status of the
call to No Answer.
Ask a question...
⌘I
Essentials Agent builder (Studio)



---

# Calls

<!-- source: Calls - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Do Not Call Prompting best practices
Powered by
Essentials
View calls that happened
Calls
In the calls tab, you can view all the calls that happened. It will show the transcript and also give you the
option to listen to the call. The Transcript has a toggle that when activated will also show the transitions and
functions that were called throughout the conversation.
Calls can be filtered by Status, Date, Phone number and conversation id. They can be exported as well.
Different call statuses:
Completed: AI completed the call and got to the end node
Dropped: The customer hung up before the end node was rached
Failed: Technical problem
No answer: Customer did not pick up / voicemail detected
In progress: Call is still happening
Ask a question...
⌘I
Essentials Calls



---

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



---

# Create phone deployment

<!-- source: Create phone deployment - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Send outbound sms Get regions
Powered by
Deployments
Create phone deployment
Create Phone Deployment
This endpoint creates a new phone deployment, linking an agent snapshot to a phone number within a
specific region. This is how you make your conversational agents available to handle phone calls.
Request Body
The request accepts a JSON object with the following properties:
Traffic Distribution
The traffic_proportion values in the snapshot_traffic_distribution array must sum to 1.0. This
allows for:
Response
On success, the endpoint returns an array of PhoneDeployment objects, each containing:
Available Regions
Leaping AI currently supports two regions for phone deployments:
Choose the region closest to your callers to minimize latency and improve call quality.
Example
Example: A/B Testing
To deploy two different agent snapshots with a 90/10 split:
snapshot_traffic_distribution (array, required): An array of objects defining the agent snapshots to
deploy and their traffic distribution
agent_snapshot_id (UUID, required): The ID of the agent snapshot to deploy
traffic_proportion (number, required): The proportion of traffic this snapshot should receive
(between 0 and 1)
phone_id (UUID, required): The ID of the phone number to use for this deployment
region (string, required): The region where this deployment should be created (either “eastus” or
“sweden”)
A/B testing different agent versions
Gradual rollout of new agent versions
Canary deployments to test changes with a small percentage of traffic
agent_snapshot_id (UUID): The ID of the deployed agent snapshot
traffic_proportion (number): The proportion of traffic routed to this snapshot
phone_id (UUID): The ID of the phone number
inbound_call_url (string): The URL that handles inbound calls
eastus: Deployed in Azure East US 2 (Virginia), optimized for North American callers
sweden: Deployed in Azure Sweden Central, optimized for European callers
curl -X POST "https://api.leaping.ai/v1/deployments/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_traffic_distribution": [
      {
        "agent_snapshot_id": "550e8400-e29b-41d4-a716-446655440000",
        "traffic_proportion": 1.0
      }
    ],
    "phone_id": "a385a208-7b1a-4d27-8c08-a35d7e1f72c2",
    "region": "eastus"
  }'
curl -X POST "https://api.leaping.ai/v1/deployments/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_traffic_distribution": [
      {
        "agent_snapshot_id": "550e8400-e29b-41d4-a716-446655440000",
        "traffic_proportion": 0.9
      },
      {
        "agent_snapshot_id": "550e8400-e29b-41d4-a716-446655440001",
        "traffic_proportion": 0.1
      }
    ],
    "phone_id": "a385a208-7b1a-4d27-8c08-a35d7e1f72c2",
    "region": "sweden"
  }'
Ask a question...
⌘I



---

# Details

<!-- source: Details - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Agent builder (Studio) Knowledge bases
Powered by
Essentials
Configure certain settings for the agent
Details
General
Here, you can give the AI agent a name and description. Other settings:
Language
Here you can choose between different text to speech and speech to text providers. We offer many
languages and voices per language. There is also the possibility to clone a voice. If this is interesting to you,
reach out to kevin(dot)wu(at)leapingai(dot)com.
If you choose Deepgram as the speech to text provider, you can configure a delay parameter. The Delay
value specifies an artificial number of milliseconds that the AI agent will wait before replying to a user input.
Best practice is 200 ms. The Speed manager option will adjust the talking speed of the voice AI agent to the
talking speed of the user. It is worth experimenting with this option.
If you choose Elevenlabs at the text to speech provider, you can configure two parameters: Stability and
Similarity. They help control the consistency of the voice. Best practice is to put both values at 0.8.
Knowledge base
You can upload CSV files with question-answer pairs that the AI agent will refer to throughout the
conversation. All files need to have two columns (one column for the question and one column for the
answer).
In general, please talk to the Leaping AI team before using knowledge bases. Currently, we recommend all
our customers putting FAQ information into the prompts / context window.
Fields
Overview
Fields are variables that store information throughout a conversation. They have a defined name,
a type (Real, Integer, Boolean, or Text), and an optional default value used when no value is assigned. They
can be set automatically (like phone number) or set explicitly within the call with a field setter node.
Why Use Fields?
Fields help maintain context across a conversation, ensuring the LLM doesn’t “forget” or misinterpret data.
They enable the agent to:
Best Practices
Functions
Overview
The Functions tab allows you to configure API calls and other custom capabilities for your agent, extending
its ability to interact with external systems and process data.
Note: The UI for this section is currently being reworked.
If your deployment uses API calls, please contact  .
Creating and Managing Functions
Go to Configure → Functions to create and manage Functions.
Each function allows your agent to read, write, or process information from external or internal services.
Function Types
Best Practices
Integrating Functions into Agent Flows
Once created, Functions can be added to any dialogue node:
Results
Here you can specify key pieces of data that you want the AI to pull out of each conversation at scale.
These can be:
Possible data types:
You have the possibility to configure an enum structure. This forces the output to be one of the possible
values in the enum.
Now in the Calls tab, every call will have a separate section listing all the results. Furthermore, the call export
will have a separate column for every result.
On Idle Message: What should the voice AI agent say if the customer is not responsive
Timeout: After how many seconds of the customer not being responsive should the On Idle Message be
delivered
Threshold: How many times should the On Idle Message be delivered until the voice AI agent hangs up.
Best practice is 3
Termination Message: What should the voice AI say before it hangs up the call
Interruption Sensitivity: Should the voice AI agent be easily interrupted or not. Choose Low if the AI
agent should ignore background noise. Choose High in cases where background noise is not a problem
and you want the AI agent to be interrupted by a single word.
Word count threshold: How many words have to be spoken by the user before the AI agent is
interrupted.
Store user inputs and relevant information.
Route conversations with junction or switch nodes.
Maintain metadata, such as conversation type (inbound/outbound) or the caller’s phone number.
Save inputs and outputs from Functions for later use.
Use descriptive names for Fields.
Choose a data type that best suits the information being stored.
Assign a sensible default value to avoid undefined behavior.
Leverage Fields for any data the agent needs to recall or utilize later in the conversation.
API Call – Perform requests to external APIs (similar to Postman).
Summarizer – Summarize conversation context (e.g., to quickly review the call topic for handovers).
Template – Format data using strings (e.g., prepend Bearer to a retrieved token).
Wait – Pause execution for a defined period (e.g., wait until the caller speaks).
Send DTMF – Transmit touch-tone signals (e.g., navigate phone queues).
Use descriptive names for Functions to clearly indicate their purpose.
Add detailed descriptions so the agent understands when and how to use them.
Always secure your API calls with appropriate authentication methods.
Extract only relevant fields from API responses for use in the conversation.
As a capability in the node (and referenced in its prompt), e.g.:
“If the caller states their birthday, call the check_birthday function to validate it”.
As a standalone node that triggers automatically when activated in the flow.
Key pieces of information, such as the email address that the user specified during the conversation
Reasons somebody is not interested in your product (if he specified why during the conversation)
If the person is going to buy your product or not.
text: output will be a string
boolean: output will be True or False
kevin.wu@leapingai.com
Ask a question...
⌘I
Essentials Details



---

# Export calls

<!-- source: Export calls - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Quick schedule calls Send outbound sms
Powered by
Calls
Export calls
Export Call Data
This endpoint exports call data for a specific agent within a given date range, including call metadata, field values, and
extracted results. The data is returned as a CSV file suitable for analysis and reporting.
Request Body
The request accepts a JSON object with the following properties:
Response
On success, the endpoint returns:
CSV Format
The CSV file includes the following types of columns:
Excluded Data
To keep the export manageable, the following data is excluded:
Common Errors
Example
Usage with Scheduled Calls
This endpoint is particularly useful for analyzing outcomes of scheduled call campaigns. After scheduling calls with the
/calls/schedule endpoint, you can use this endpoint to export the results and track performance.
agent_id (UUID, required): The ID of the agent to export calls for
filters (object, required): Filtering criteria for the calls to export
start_datetime (string, required): Start of the date range (ISO8601 format)
end_datetime (string, required): End of the date range (ISO8601 format)
id (UUID, optional): Filter by specific call ID
status (string, optional): Filter by call status (e.g., “completed”, “failed”, “in_progress”)
customer_phone_number (string, optional): Filter by customer phone number
Status code: 200 OK
Content-Type: text/csv
Body: CSV data with call records
Base call data: Prefixed with uppercase column names (e.g., ID, DIRECTION, CREATED_AT)
Field values: Prefixed with FIELD_ and the field name (e.g., FIELD_CUSTOMER_NAME)
Result values: Prefixed with RESULT_ and the result name (e.g., RESULT_APPOINTMENT_CONFIRMED)
Complete transcript content (too large)
Internal system fields
Empty or null values
Private configuration fields
400 Bad Request: If the start date is after the end date
403 Forbidden: If you lack permissions to access the requested call data
404 Not Found: If no calls match the specified criteria
curl -X POST "https://api.leaping.ai/v1/calls/export" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "filters": {
      "start_datetime": "2025-04-01T00:00:00Z",
      "end_datetime": "2025-04-30T23:59:59Z",
      "status": "completed"
    }
  }'
Ask a question...
⌘I



---

# Get calls

<!-- source: Get calls - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Login Schedule calls
Powered by
Calls
Get calls
Get Agent Calls
This endpoint retrieves a list of agent calls with optional filtering and pagination. Use this endpoint to query call records for a
specific agent and analyze call history, performance, and outcomes.
Query Parameters
Response
On success, the endpoint returns:
Pagination
Use the offset and limit parameters to paginate through large result sets:
Filtering by Date Range
When filtering by date range, both start_date and end_date accept ISO8601 formatted datetime strings:
Common Errors
Example
Usage with Call Analytics
This endpoint is essential for building call analytics dashboards and monitoring agent performance. Combine it with date range
filtering to analyze call volume trends, success rates, and other key metrics over time.
agent_id (UUID, required): The ID of the agent to retrieve calls for
in_progress_only (boolean, optional): Filter to only return calls that are currently in progress
id (string, optional): Filter by specific call ID
phone_number (string, optional): Filter by customer phone number. Matches a substring of the customer’s phone number
after stripping all non-digit characters from both sides, so (555) 123-4567, 5551234567, and +1 555 123 4567 all
match the stored E.164 form +15551234567.
status (string, optional): Filter by call status (e.g., “completed”, “failed”, “in_progress”)
start_date (datetime, optional): Filter calls created after this date (ISO8601 format)
end_date (datetime, optional): Filter calls created before this date (ISO8601 format)
tag (string, optional): Filter by call tag
order_by (string, optional): Order results by field. Options: “created_at”, “ended_at” (default: “created_at”)
offset (integer, optional): Number of records to skip for pagination (default: 0)
limit (integer, optional): Maximum number of records to return (default: 100)
snapshot_ids (array of UUIDs, optional): Filter by specific agent snapshot IDs
select (array of strings, optional): Specify which fields to include in the response
results (string, optional): Filter by call results
Status code: 200 OK
Body: JSON object containing:
calls: Array of call records matching the specified criteria
total_count: Total number of calls matching the filters (useful for pagination)
offset: Skip this many records
limit: Return at most this many records
total_count: Use this to calculate total pages
start_date: Include calls created on or after this date
end_date: Include calls created on or before this date
422 Unprocessable Entity: If query parameters contain invalid data
403 Forbidden: If you lack permissions to access the requested call data
404 Not Found: If the specified agent doesn’t exist
curl -X GET "https://api.leaping.ai/v1/calls/?agent_id=550e8400-e29b-41d4-a716-446655440000&status=completed&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
Ask a question...
⌘I



---

# Home area

<!-- source: Home area - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Agent builder (Studio)
Powered by
Essentials
Overview of all AI agents
Home area
Home tab
You can make a new voice AI agent by clicking on the “Create Agent” button. It will ask you to specify the
name, description and group of the agent. Under group, either select your company or leave it blank.
You also have the option of cloning an existing template agent to modify it. Alternatively, you can export and
import an existing template agent. These options can be accessed by clicking on three dots next to an agent
and choosing the respective option.
Telephony tab
Here you see an overview of all the phone numbers in your account and to which voice AI agent they are
respectively assigned.
We allow you to bring your own Twilio phone number. For this, press the “Add Phone Number” button and
enter the respective details of the phone number you bought on Twilio.
We currently do not support phone numbers from other sources outside of Twilio.
Usage tab
Here, you can monitor the number of minutes of conversation with the voice AI agent. Make sure to select
the correct group if relevant.
Total duration = number of conversation minutes by Leaping AI bot + number of conversation minutes after
Leaping AI bot handed off the conversation to an human
Leaping duration = number of conversation minutes by Leaping AI bot
IAM tab
In this tab, you can see the users of the Leaping platform within your organisation.
Editor = can view agents and modify them
Viewer = can view agents but not modify them
If you would like to add additional users, please reach out to kevin(dot)wu(at)leapingai(dot)com
Settings tab
In this tab, you can configure two-factor authentication and a password change.
Two-factor authentication
Enabling this feature necessitates the usage of an authenticator app (e.g., Google Authenticator)
Next to username and password, the login process involves entering a code specified in the authenticator
app.
Ask a question...
⌘I
Essentials Home area



---

# Login

<!-- source: Login - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Validate snapshot Get calls
Powered by
Authentication
Login
Authentication
This endpoint allows you to authenticate with the Leaping AI API and obtain an access token.
Request Format
The endpoint accepts form data with the following parameters:
Response
On successful authentication, the endpoint returns a JSON object containing:
Usage
Include the access token in the Authorization header of subsequent requests:
Common Errors
Example
Always keep your credentials and tokens secure. Do not expose them in client-side code or public repositories.
username (string, required): Your Leaping AI username
password (string, required): Your Leaping AI password
grant_type (string, optional): The OAuth grant type, defaults to “password”
scope (string, optional): The requested scope, defaults to an empty string
client_id (string, optional): The client ID, if required
client_secret (string, optional): The client secret, if required
access_token: The token to use for API authentication
token_type: The type of token (usually “bearer”)
expires_in: Token validity period in seconds
refresh_token: Token that can be used to obtain a new access token when the current one expires
400 Bad Request: If the request format is invalid
401 Unauthorized: If the credentials are incorrect
422 Unprocessable Entity: If the request body contains invalid data
Authorization: Bearer YOUR_ACCESS_TOKEN
curl -X POST "https://api.leaping.ai/v1/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=your_username&password=your_password"
Ask a question...
⌘I



---

# MCP servers

<!-- source: MCP servers - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Knowledge bases Phone numbers (Telephony)
Powered by
Essentials
Connect your agent to your own tools and prompts using the Model Context Protocol (MCP).
MCP servers
What is MCP?
The  is an open standard for exposing tools (callable actions) and prompts
(reusable instructions) over a well-defined protocol. Any MCP client can connect to a server, discover what it
offers, and use it.
In Leaping, you can point an agent at your own MCP server(s) so it can call your tools and use your prompts
— without us hand-building a custom integration for you. If your team already runs (or can stand up) an
MCP server, you self-serve the whole setup from Studio:
MCP tools behave just like native functions inside a conversation. Once a tool is exposed on a stage, the agent
decides when to call it, executes it, and uses the result — exactly as it does with built-in functions.
Connecting a server
Open your agent and go to the MCP Servers tab (currently in beta). Click Add server and fill in:
Field Required Purpose
Server Name
 How the server appears in Studio.
Server URL
 The remote Streamable HTTP endpoint (e.g.
https://mcp.example.com/mcp).
Tool Prefix
 Optional. Prefixes every tool name from this server (e.g. crm →
crm_lookup_order) so tools never collide with native functions or tools from
other servers.
Authentication
 Optional. Toggle on to send credentials with every request.
Authentication
Two auth types are supported:
Secrets (the bearer token / header value) are encrypted at rest — they are stored as ciphertext, never in plaintext,
and are never returned to the browser after saving. Whenever you enter a new value and save, it is re-encrypted,
so rotating a secret always takes effect.
Discovering tools and prompts
Once the URL (and auth, if any) is set, click Discover. Leaping connects to the server and lists everything it
exposes under two tabs:
Discovery results are cached on the agent when you save, so the builder and validation can work without re-
contacting your server.
v1 supports tools and prompts only — MCP resources are not yet supported. The agent always uses the tools
your server reports live at call time, so tools you add after publishing become available without re-publishing. The
cached discovery is what powers the builder UI and publish-time validation.
Testing a tool
In the Tools tab, click the play (▶) icon on any tool to open a small test panel, fill in its arguments, and Run
Test. The raw result (or error) is shown inline — the same content the agent would receive during a real
conversation.
Previewing a prompt
In the Prompts tab, click the play (▶) icon on any prompt, fill in its arguments, and Render Preview to see
exactly what the server returns.
Exposing tools to a stage
MCP tools are opt-in per stage, just like native functions. Open a node’s editor and find the MCP Tools
section (available on Dialogue, Response, and Function nodes):
Under the hood, each stage stores which server and which tools it may use. A stage can also be configured to
expose all of a server’s tools (including ones added after publishing) rather than a fixed list — useful when you
want a stage to automatically pick up new tools as your server grows.
Using an MCP prompt as a message
When at least one connected server exposes prompts, a Use MCP prompt option appears wherever you
author a message:
Pick a server and a prompt, bind its arguments (to fields or literals), then click Preview & save fallback.
On a Scripted node the MCP prompt is resolved to text and emitted as the node’s message, using the same
fallback chain below. With no MCP prompt set, the node plays its fixed script unchanged.
What-you-preview-is-what-you-get
When the agent runs, an MCP-sourced message is rendered live by your server using the real argument
values. But servers can be slow or unreachable, so Leaping also keeps a fallback:
1. The text you see in the preview is captured and stored as the fallback (byte-for-byte).
2. Any argument bound to a field is sent during preview as a {{field}} marker instead of a real value,
so the dynamic slot survives into the fallback.
3. At call time, those {{field}} markers are filled in with the live field values.
So the previewed text is the fallback: you review and approve the exact string that will be used if your server
is unavailable, with {{field}} shown in place of values that get filled in at runtime.
Fallback order at runtime: live render from your server → the saved preview (with {{field}} markers filled in) →
the message you typed by hand. Because of this chain, you must still author a non-empty plain message — it’s the
last-resort fallback, and the agent will refuse to publish without it.
If a preview fails (for example, your server validates or transforms the marker argument and rejects it), nothing is
cached and the fallback degrades to your hand-authored message. The preview surfaces this immediately, so
there are no surprises at call time.
Marker arguments need passthrough interpolation
A field-bound prompt argument is sent to your server as the literal string {{field_name}} (the marker), both
at preview time and when an MCP prompt drives the system message at the start of a call. This only works if
your server interpolates the argument value verbatim into the prompt text.
If your server instead validates, coerces, or branches on that argument (for example it expects an enum, a
number, or a date, or its templating errors on an unknown token), it may reject or mangle the
{{field_name}} marker. When that happens the render fails, nothing is cached, and the message falls back
to your hand-authored static text — safe, but without the dynamic field value.
Guidance: bind an argument to a field only when the server passes that argument straight through into the
text. Otherwise use a literal value, or rely on the static fallback.
System message specifics
The system message is resolved once at the start of the call, before the conversation begins. Because of
that timing:
Changes to the system MCP prompt in the Agent Setup editor follow the same Save / Cancel rules as the rest of
that dialog: they only take effect when you Save, and Cancel discards them.
Security model
MCP servers are external, customer-supplied endpoints, so Leaping applies several protections to every
connection — both from the builder and at call time:
Limitations (v1)
Register one or more MCP servers on an agent (URL + auth).
Discover the server’s tools and prompts.
Test a tool and preview a prompt before publishing.
Expose selected tools to specific conversation stages.
Source a system or stage message from an MCP prompt.
Bearer Token — sent as an Authorization: Bearer <token> header.
Custom Header — a header name (e.g. X-API-Key) and its value.
Tools — each shows its (prefixed) name, description, and input parameters. Required parameters are
marked with *.
Prompts — each shows its name, description, and any arguments it accepts.
Dialogue / Response nodes — click the tool tags to toggle which tools the agent may call in that stage.
You can select tools from multiple servers.
Function nodes — select exactly one MCP tool to run deterministically. A function node is either a native
function or a single MCP tool, not both. You can bind the tool’s arguments to fields or literal values;
anything left unbound is filled in by the agent at call time.
The system message (Agent Setup).
A stage message on Dialogue / Response nodes.
The script on Scripted nodes (the resolved prompt text is emitted as the script).
Field arguments are re-evaluated every turn. The system message keeps the {{field}} markers and
fills them with the current field values on each turn, so a field updated early in the call (for example by a
pre-conversation step) is reflected automatically — your server is only contacted once.
LLM-extracted arguments are not allowed for the system message. There’s no conversation to extract
from yet, so the LLM argument option is hidden for the system prompt — bind its arguments to fields or
literals only. (Stage messages, which resolve once you’re in the stage, do support LLM-extracted
arguments.)
Encrypted secrets — bearer tokens and header values are stored as ciphertext, never plaintext, and
never sent back to the browser.
SSRF egress guard — outbound connections are blocked if the URL resolves to a private, reserved,
loopback, link-local, or cloud-metadata address (e.g. 127.0.0.1, 10.x, 192.168.x,
169.254.169.254). This is enforced, and also closes DNS-rebinding and redirect-to-internal tricks.
Timeouts — connect, read, tool-call, and prompt-render operations each have a strict time budget, so a
slow or hung server can’t stall a live conversation.
Response-size cap — tool and prompt responses are capped (256 KiB) so a server can’t exhaust
memory or flood the model’s context.
Remote-only — only remote Streamable HTTP servers are supported. Local/stdio servers are not
allowed.
Multi-tenancy — MCP configuration lives on your agent and inherits its existing access controls; it is
never shared across organizations.
Tools and prompts only — MCP resources are not yet supported.
Static auth only — bearer token or custom header. OAuth flows are not supported.
Remote servers only — no local/stdio transport.
Servers are part of the published agent config — they’re registered in Studio, not added dynamically per
call.
Model Context Protocol (MCP)
Ask a question...
⌘I
Essentials MCP servers



---

# Outbound

<!-- source: Outbound - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Phone numbers (Telephony) Do Not Call
Powered by
Essentials
Schedule outbound calls
Outbound
Uploading leads
The Leaping AI system can be used to schedule outbound calls. To do this, simply upload a list of numbers in
a CSV. Note that the phone numbers need to be in column 1 of the CSV. Also they need to follow this format:
’+(country code)(number)’, e.g., ‘+14157916601’.
It is also possible to “inject” dynamic information, such as name of the person, address or other information.
Step 1: Create fields in the agent builder (studio) that contain the variable information. Best example is
“name” to hold the customer name.
Step 2: Reference those fields in the prompts (stage messages) using double curly brackets. Example: “Greet
the customer as {{name}}”.
Step 3: After you have uploaded your CSV, you can “map” certain columns of the CSV to their respective
fields.
Scheduling calls
All the phone numbers uploaded will appear in the Staged section. Some or all of them can be selected to be
“scheduled”. To schedule a call, you have to configure a time period in which the calls will happen. The
scheduler will then equally distribute the calls in the specified time period. We recommend specifying a large
enough time window (at most 500 calls per hour).
When scheduling, you can choose a single caller number or toggle on Use multiple phone numbers to select
several. If multiple numbers are selected, calls are distributed across them at random.
Note: currently only 500 calls maximum can be scheduled at once. Thus, if you have 1,000 leads, you have to
schedule 500 calls at a time. We are working to remove the limitation.
Daily call limit
Each agent has a Max Daily Outbound Calls setting (in the agent’s Details tab, defaults to 3). This is the
maximum number of times the same customer phone number will be called in one day. Once a phone
reaches the limit, further calls to it that day are filtered out. The day is the customer’s local calendar day, not
UTC, so the cap rolls over at the customer’s local midnight.
If a call is blocked by the cap but your schedule covers multiple days, it’s automatically retried on the next
day within your scheduled window. Calls that can’t be retried (no remaining days in the schedule, or no
schedule at all) show as Failed in the calls table.
Before scheduling, you can use the preview feature (available in the API) to see how many calls would be
filtered without actually scheduling anything.
Do Not Call filtering
Numbers on your group’s  are automatically blocked from being staged and filtered out at
scheduling time. When uploading a CSV or scheduling calls, you will see a warning showing how many
numbers were filtered by the DNC list, displayed separately from daily limit filtering.
After calls are placed
After all the calls are placed, they will either appear in the Done or Failed section. All calls in the Failed
section either were not placed due to technical reasons or landed in voicemail. One can “re-stage” all the
failed calls. Those calls will appear again in the Staged section.
Do Not Call list
Ask a question...
⌘I
Essentials Outbound



---

# Phone numbers (Telephony)

<!-- source: Phone numbers (Telephony) - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

MCP servers Outbound
Powered by
Essentials
Learn how to view, purchase, import and manage your phone numbers inside Leaping.
Phone numbers (Telephony)
Telephony Overview
The Telephony section lets you manage your phone numbers.
Open Dashboard → Telephony to see a list of all numbers you own or have imported.
Phone numbers are shared per group. Only group admins can purchase or delete numbers that live in Leaping’s
Twilio account.
Phone-number table
Column What it tells you
Phone number The E.164 formatted number (+1 415…). A small “External” badge means it lives in your Twilio
account, not Leaping’s.
Label A nickname you can click to edit inline (e.g. “Support Line FR”).
Region The Leaping deployment region (e.g. eastus, sweden) that routes calls for this number.
Status • Available – not deployed yet
• Deployed – currently deployed to an agent snapshot
Deployed The snapshot label that answers this number, or “–”.
Added at Date the number was linked to your workspace.
Delete Trash icon → deletion flow (with dependency checks).
Adding a phone number
Click “Add Phone Number” to open a two-option picker:
1. Purchase new number (Leaping buys & hosts it)
2. Import existing number (you keep it in your own Twilio account)
Purchasing a new number
1. Choose Purchase new number.
2. In the modal:
Field Required Notes
Country
 Determines available inventory and compliance rules.
Group
 Number ownership. You must be an admin of that group.
3. Click Purchase Phone Number.
Leaping contacts Twilio’s API and assigns a fresh number to your workspace.
You’ll see a success toast with the exact number purchased.
Many countries (e.g. 
 France, 
 Germany, 
 South Korea) require regulatory bundles before a number can
be used. If you need numbers in a regulated market, reach out to us so we can register the necessary
documentation with Twilio on your behalf.
Importing a number from your own Twilio account
Choose Import existing number and provide:
Field Required Why we need it
Phone number SID
 Identifier starting with PN…
Label
 Friendly display name
Region
 Leaping deployment region that will handle calls
Group
 Ownership group (optional)
Account SID + Auth Token
 Credentials of the external Twilio account
Press Import Phone Number – the number appears instantly with an “External” badge.
You’re still billed by Twilio directly; Leaping only references the number.
Managing numbers
When you delete a phone number, Leaping first checks that it’s not currently deployed to an agent and has no
scheduled outbound calls. If dependencies exist, you’ll see a warning with the option to force-delete, which will
also remove any associated deployments and scheduled calls.
Connecting Calls to Our Platform
You can connect calls to our platform in two main ways:
1. Standard Telephony Forwarding
2. Direct SIP Integration (INVITE or REFER)
Option 1: Standard Telephony Forwarding
Forward calls from your telephony system to the phone number assigned in our platform.
How It Works
Restrictions
This is the simplest integration method but not the most flexible.
Option 2: SIP Integration
SIP lets you bypass the PSTN entirely and connect directly to our platform.
This reduces latency, improves reliability, and gives you more control over call flows.
SIP Advantages
SIP URI
All SIP calls (INVITE or REFER) use the same addressing format:
<your_agent’s_phone_number>@<our_domain>
Deployment Domains
Choose the domain closest to your location for lower latency. Use TLS (Port 5061) when full encryption (including
signaling, headers) is required, otherwise UDP (Port 5060) is sufficient.
Example: sip:
SIP Transport and Ports
SIP INVITE
SIP REFER (Recommended)
Custom SIP Headers
When using SIP, you can pass along additional headers to identify or tag calls.
This is useful for matching a SIP call to an API request, CRM record, or internal system.
Example:
INVITE sip:  SIP/2.0 X-Call-Identifier: abc123-session X-
Customer-ID: 98765
These headers are forwarded into our platform and can be used to correlate voice interactions with external
systems or reroute calls in your own infrastructure.
Setup Steps
1. Deploy your agent to a phone number in our platform.
2. Choose your connection method:
3. Configure your telephony system with the SIP URI, domain, and (optionally) custom headers.
4. Test the call to confirm connectivity.
FAQ
What happens to call history after deleting a number?
Call logs remain available for analytics, but the number itself disappears from every deployment.
Your telephony setup is now ready—buy, import, and assign numbers to create production-ready voice
agents in minutes!
Edit label – click the label cell, type a new name, press Enter or click elsewhere.
Deploy / change agent – open Agent Studio → Phone deploy, select the number and snapshot.
Delete – click the trash icon, follow the safety steps (number must be undeployed first).
Configure your telephony system to forward calls to the number assigned in our system.
The agent answers these calls as a regular PSTN call.
No SIP Features – Works like a normal phone call, without SIP control.
Carrier Costs – Calls traverse the PSTN, which may introduce additional per-minute charges.
Less Efficient – Adds a PSTN hop, which can increase latency compared to SIP.
Limited Flexibility – No direct call handovers (e.g., REFER), no custom headers, no direct SIP addressing.
No PSTN Hop – Calls route directly via SIP, avoiding unnecessary network transitions.
Lower Latency – Faster call setup and media paths.
Scalable – Easily handles large call volumes.
Flexible Call Control – Use SIP REFER for seamless handovers.
Secure – TLS transport available for encrypted signaling.
Custom Identifiers – Add custom SIP headers to track and match calls with API sessions.
Standards-Based – Works with most SIP trunks, SBCs, and PBX systems.
Europe (UDP): leaping-eu-udp.sip.twilio.com
Europe (TLS): leaping-eu-tls.sip.twilio.com
US (UDP): leaping-us-udp.sip.twilio.com
US (TLS): leaping-us-tls.sip.twilio.com
UDP → Port 5060
TLS → Port 5061
Send a direct INVITE to the SIP URI of the deployed agent.
Suitable for SIP trunks, SBCs, or softphones that originate calls directly.
Transfer an active call to the agent using SIP REFER.
Ideal for PBX/IVR scenarios where you want to hand over the caller mid-flow.
Establishes a direct media stream with our platform, keeping the setup clean.
Recommended for enterprise and contact-center deployments.
Standard telephony forwarding, or
SIP integration (INVITE or REFER, with REFER recommended).
+4915123456789@leaping-eu-tls.sip.twilio.com
+4915123456789@leaping-eu-tls.sip.twilio.com
Ask a question...
⌘I
Essentials Phone numbers (Telephony)



---

# Prompting best practices

<!-- source: Prompting best practices - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Calls
Powered by
Essentials
Tips and tricks
Prompting best practices
Prompt engineering is an art instead of a science. Even though prompts look like plain language (English,
German, Spanish, etc.), there is definitely a different way to prompting an AI agent than talking to a human. 
Find below a couple of prompt engineering tips and tricks that we at Leaping AI have learnt in the last 2
years:
Keep the agent setup prompt (system message) short and ideally to under 2,000 tokens. This is
important because it gets loaded at every step of the conversation. Making it too large could add latency
to the conversation.
To make the conversation more human, you can include a prompt telling the AI to add filler words
regularly, such as “umm, uhh, ok”.
Specify explicitly how certain numbers should be pronounced, giving examples as well. For example, say
“convert post codes to words, eg. 94107 # nine, four, one, zero, seven”. Not doing this will make the AI
pronounce this specific number as ninety four thousand, one hundred and seven.
Refer to transitions (aka functions) in the prompt. E.g., “call the function ‘call transfer’ if the customer
would like to speak to a human”.
Try to use steps and examples in the prompt. This will tell the AI exactly what you would like it to do.
Emphasise things using capitalisation that you want the AI agent to do. Example: “DO NOT repeat the
customer answer back to the customer and ALWAYS go to the next question”.
Be very specific about how certain things should be spelled in order for them to be spoken clearly and
slowly, e.g.,
“Convert email addresses into words and separate them by commas, e.g., ‘ ’ to
‘john, dot, doe, at, gmail, dot, com’
“Convert customer numbers into words and separate the words by commas, e.g., ‘324124’ to ‘three,
two, four, one, two, four’”
“Convert birthdays into words and separate them by commas, e.g., ‘01/04/1992’ to ‘january fourth,
nineteen ninetytwo’”
Do not rely on prompts to compare two pieces of text or to do math. LLMs are next token predictors and
give probabilistic (non-exact) output. Always leverage extra functions to do math operations.
If you have a knowledge base or Q&A that you want the agent to refer to, you can include them directly in
the prompts, assuming it doesn’t exceed the acceptable context window of the large language model.
Be ready to continuously iterate on the prompts. It is an ongoing activity even after going live that never
ends.
john.doe@gmail.com
Ask a question...
⌘I
Essentials Prompting best practices



---

# Send outbound sms

<!-- source: Send outbound sms - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Export calls Create phone deployment
Powered by
SMS
Send outbound sms
Send Outbound SMS
Send one or more outbound SMS messages from an agent. Each recipient is validated, screened against your
Do Not Call list and per-recipient daily limits, and queued for delivery. Messages are sent asynchronously —
this endpoint accepts and schedules them, it does not block until delivery.
The response is 1:1 with the input: results has exactly one entry per recipient, in the same order, so you
can map each outcome (pending, conflict, dnc_filtered, daily_limit_filtered, failed) back to
the number you submitted.
This API is the only way to send outbound SMS today — there is no dashboard UI for it yet.
How Message Bodies Are Built
For each recipient, the effective template is the recipient’s message_template if set, otherwise the top-level
message_template. Template variables are resolved from the union of the agent snapshot’s fields and the
merged field_overrides (top-level values overridden by per-recipient values). If a template references a
variable that can’t be resolved, that recipient fails with unresolvable_template_vars and the offending
names are listed in error_metadata.unresolvable_vars.
If no template is provided and the agent is configured to speak first (its first conversation stage begins on a
user turn), the agent itself generates the opening message.
Do Not Call & Daily Limits
Before queuing, every recipient is screened individually — the rest of the batch still proceeds:
Validation Rules
Idempotency
To make retries safe, pass an optional Idempotency-Key header (Stripe-equivalent semantics). The value is
an opaque string up to 255 characters. Use one key per logical operation and reuse it across retries —
generating a fresh key per attempt defeats the purpose.
Common Errors
Example
Do Not Call: recipients on your group’s Do Not Call list are not messaged and are returned with status
dnc_filtered.
Per-recipient daily limit: recipients who have reached the configured per-day SMS cap are not
messaged and are returned with status daily_limit_filtered.
Either agent_id or agent_snapshot_id must be provided. If both are given, agent_snapshot_id
takes precedence.
from_phone_id and from_phone_number are mutually exclusive. If both are omitted, an SMS-deployed
phone for the agent is selected automatically.
recipient_phone_numbers must contain between 1 and 1000 entries, each a valid E.164 number.
scheduled_for (top-level or per-recipient) must be timezone-aware — a naive datetime is rejected —
and must be in the future.
Replay-safe. Within the TTL (default 24 hours, configurable via IDEMPOTENCY_TTL_SECONDS), an identical
retry from the same authenticated user with the same body returns the cached response without re-
queuing.
Body fingerprint. A retry that reuses the key with a different body returns 422 Unprocessable Entity
instead of silently replaying.
In-flight conflict. A retry that arrives while a sibling request with the same key is still processing returns
409 Conflict.
Failures are not cached. If the original request fails, the response is not stored — retry with the same key
and it will execute.
Per-user scope. Keys are scoped to the authenticated user.
Optional. Omit the header (or send a whitespace-only value) to fall back to the non-idempotent
behaviour.
400 Bad Request: The agent snapshot was not found, the agent has no group, the sending phone is not
found or not SMS-deployed to this agent, the phone’s region is not configured for SMS, the phone uses
external (BYO) Twilio credentials, or scheduled_for is in the past.
409 Conflict: An Idempotency-Key was supplied while a sibling request with the same key is still
being processed.
422 Unprocessable Entity: The request body failed validation, or an Idempotency-Key was reused
with a different body.
curl -X POST "https://api.leaping.ai/v1/sms/outbound" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: 7f3c1b2e-9a4d-4b8e-bc51-1d2e3f4a5b6c" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "from_phone_number": "+15551234567",
    "message_template": "Hi {{ customer_name }}, your appointment is at {{ appointment_time }}.",
    "recipient_phone_numbers": [
      {
        "phone_number": "+15557654321",
        "field_overrides": { "customer_name": "John Doe", "appointment_time": "3:00 PM" }
      },
      {
        "phone_number": "+15559876543",
        "field_overrides": { "customer_name": "Jane Smith", "appointment_time": "4:30 PM" }
      }
    ],
    "scheduled_for": "2026-06-01T15:00:00+00:00"
  }'
{
  "scheduled_count": 1,
  "sent_count": 0,
  "failed_count": 0,
  "conflict_count": 1,
  "dnc_filtered_count": 0,
  "daily_limit_filtered_count": 0,
  "results": [
    {
      "status": "pending",
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "phone_number": "+15557654321",
      "scheduled_for": "2026-06-01T15:00:00+00:00"
    },
    {
      "status": "conflict",
      "phone_number": "+15559876543",
      "error": "duplicate_pending_row",
      "existing_id": "1f0c2a44-9d2a-4e6b-8b1a-2c3d4e5f6a7b"
    }
  ]
}
Ask a question...
⌘I



---

# SSE Chat

<!-- source: SSE Chat - Leaping AI docs.pdf | pages: 1 | auto-extracted -->

## Page 1

Health check SSE Chat (Latest Snapshot)
Powered by
Chat
Start a Server-Sent Events (SSE) chat session with a specific agent snapshot
SSE Chat
Overview
This endpoint initiates a Server-Sent Events (SSE) streaming chat session with a specific agent snapshot.
The SSE protocol provides real-time, unidirectional communication from the server to the client.
Path Parameters
The unique identifier of the agent snapshot to chat with
Query Parameters
Identifier for the end user initiating the chat session
Optional chat ID to resume an existing chat session. If not provided, a new chat will be created.
Message to pass to the agent
Authentication
This endpoint requires OAuth2 Bearer token authentication. Include the token in the Authorization header:
Response
The endpoint returns a Server-Sent Events stream. Each event contains JSON data representing a
LeapingResponse object. The responses are sent as data-only SSE events (no custom SSE event types).
Response Format
Each SSE event contains a JSON-serialized LeapingResponse with the following structure:
Discriminator field indicating the response type. Common values include:
Unix timestamp when the response was generated
Chat Message Response
For type: "chat_message":
Message sender: "human" or "bot"
The message content
Turn Response
For type: "turn":
Current turn indicator: "AGENT", "USER", or "END"
Conversation End Response
For type: "end":
UUID of the conversation
AI-generated conversation summary
Structured results extracted from the conversation
Final field values collected during the conversation
Error Response
For type: "error":
Error description
Usage Examples
JavaScript/Browser
Python with httpx-sse
cURL
Chat Flow
1. Initialization: The chat session starts with the specified agent snapshot
2. Pre-conversation: If the agent has pre-conversation stages, they execute first
3. Turn Management: The system manages turns between the agent and user
4. Streaming Responses: Agent responses are streamed in real-time via SSE
5. Conversation End: When the conversation concludes, final results are sent
Resuming Chats
To resume an existing chat session, include the chat_id parameter:
Error Handling
Errors are sent as SSE events with type: "error" and include a timestamp:
Common error scenarios:
Best Practices
agent_snapshot_idstringrequired
end_user_idstringrequired
chat_idstring
user_messagestring
typestringrequired
chat_message: Agent or human messages
turn: Turn management (whose turn to speak)
error: Error messages
transition: Stage transitions in conversation flow
start: Conversation initialization
end: Conversation completion with summary and results
function: Function call execution
kb: Knowledge base lookup results
timestampnumberrequired
senderstring
textstring
turnstring
conversation_idstring
summarystring | null
resultsobject
fieldsobject
messagestring
See all 46 lines
See all 182 lines
404: Agent snapshot not found
401: Invalid or missing authentication token
403: Insufficient permissions to access the agent
422: Invalid parameters or chat state conflicts
Always handle connection errors and implement reconnection logic
Process different event types appropriately in your client
Store the chat_id for the session resumption
Implement proper authentication token refresh mechanisms
Handle network interruptions gracefully
Authorization: Bearer your_access_token
const eventSource = new EventSource(
  '/chat/snapshot/your-snapshot-id?end_user_id=user123&user_message=Hello',
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
from typing import Optional
class AgentSSEClient:
1
2
3
4
5
6
7
curl -X POST \
  "https://api.leaping.ai/v1/chat/snapshot/your-snapshot-id?end_user_id=user123" \
  -H "Authorization: Bearer your_access_token" \
  -H "Accept: text/event-stream"
const eventSource = new EventSource(
  '/chat/snapshot/your-snapshot-id?end_user_id=user123&chat_id=existing-chat-id&user_message=Okay'
);
{
  "type": "error",
  "message": "Agent not found",
  "timestamp": 1704067200.123
}
Ask a question...
⌘I
Chat SSE Chat



---

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


